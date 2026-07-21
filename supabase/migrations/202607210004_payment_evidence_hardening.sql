-- Immutable payment/course evidence, version-bound completion, and serialized
-- checkout-customer creation for databases that already applied 001-003.

begin;

alter table public.orders
  add column if not exists course_id uuid references public.courses(id) on delete restrict,
  add column if not exists superseded_checkout_session_id text;

update public.orders target
set course_id = source.course_id
from (
  select distinct on (enrollment.order_id)
         enrollment.order_id,
         enrollment.course_id
  from public.enrollments enrollment
  where enrollment.order_id is not null
  order by enrollment.order_id, enrollment.created_at asc
) source
where target.id = source.order_id
  and target.course_id is null;

-- Remote Stripe metadata cannot be inferred or repaired safely in SQL. Abort
-- the upgrade before replacing webhook/RPC contracts whenever an existing
-- Stripe object has not been inventoried and given matching immutable
-- course/fingerprint evidence. The operator must drain or reconcile those
-- objects in Stripe first; silently accepting them could charge without access.
do $$
declare
  unsafe_order_count bigint;
begin
  select count(*) into unsafe_order_count
  from public.orders stripe_order
  where stripe_order.payment_source = 'stripe'
    and not exists (
      select 1
      from public.legacy_import_records legacy_record
      where legacy_record.order_id = stripe_order.id
    )
    and (
      stripe_order.course_id is null
      or coalesce(
        stripe_order.billing_snapshot ->> 'billingFingerprint',
        ''
      ) !~ '^[a-f0-9]{64}$'
    );

  if unsafe_order_count > 0 then
    raise exception
      'STRIPE_HARDENING_PREFLIGHT_REQUIRED: % existing Stripe order(s) lack reconciled course/fingerprint evidence; drain open sessions and reconcile matching Checkout Session/PaymentIntent metadata before retrying migration 004',
      unsafe_order_count
      using errcode = 'P0001';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.orders
    where course_id is null
  ) then
    insert into public.audit_logs(actor_role, action, entity_type, metadata)
    values (
      'migration',
      'order_course_backfill_incomplete',
      'order',
      jsonb_build_object(
        'remainingOrders', (select count(*) from public.orders where course_id is null)
      )
    );
  else
    alter table public.orders alter column course_id set not null;
  end if;
end;
$$;


do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_stripe_course_required'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_stripe_course_required
      check (payment_source <> 'stripe' or course_id is not null) not valid;
  end if;
end;
$$;

create index if not exists orders_superseded_session_idx
  on public.orders(superseded_checkout_session_id)
  where superseded_checkout_session_id is not null;

create table if not exists public.checkout_customer_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.enrollments
  add column if not exists completed_course_version text;
alter table public.lesson_progress
  add column if not exists course_version text;
alter table public.quiz_attempts
  add column if not exists course_version text;
alter table public.video_access_sessions
  add column if not exists course_version text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'enrollments_completed_course_version_format'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
      add constraint enrollments_completed_course_version_format
      check (
        completed_course_version is null
        or completed_course_version ~ '^[0-9]{4}\.[0-9]+$'
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'lesson_progress_course_version_format'
      and conrelid = 'public.lesson_progress'::regclass
  ) then
    alter table public.lesson_progress
      add constraint lesson_progress_course_version_format
      check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'quiz_attempts_course_version_format'
      and conrelid = 'public.quiz_attempts'::regclass
  ) then
    alter table public.quiz_attempts
      add constraint quiz_attempts_course_version_format
      check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$');
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'video_access_sessions_course_version_format'
      and conrelid = 'public.video_access_sessions'::regclass
  ) then
    alter table public.video_access_sessions
      add constraint video_access_sessions_course_version_format
      check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$');
  end if;
end;
$$;

-- Existing rows deliberately remain NULL: the migration cannot invent which
-- course version produced playback or quiz evidence.
comment on column public.lesson_progress.course_version is
  'NULL means pre-hardening evidence of unknown version and is not certificate evidence.';
comment on column public.quiz_attempts.course_version is
  'NULL means pre-hardening evidence of unknown version and is not certificate evidence.';

create table if not exists public.course_completion_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_version text not null check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  completed_at timestamptz not null default timezone('utc', now()),
  unique (user_id, course_id, course_version)
);
create unique index if not exists course_completion_snapshots_identity_idx
  on public.course_completion_snapshots(id, user_id, course_id, course_version);

alter table public.certificates
  add column if not exists completion_snapshot_id uuid
    references public.course_completion_snapshots(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'certificates_completion_snapshot_identity_fkey'
      and conrelid = 'public.certificates'::regclass
  ) then
    alter table public.certificates
      add constraint certificates_completion_snapshot_identity_fkey
      foreign key (completion_snapshot_id, user_id, course_id, course_version)
      references public.course_completion_snapshots(id, user_id, course_id, course_version)
      on delete restrict;
  end if;
end;
$$;

-- A certificate issued by the native pre-hardening application is itself a
-- durable completion assertion. Preserve that assertion as migration evidence
-- without inventing playback/quiz rows. Legacy-review certificates remain on
-- their separate, explicitly reviewed evidence path and are never linked here.
with certificate_evidence as (
  select certificate.user_id,
         certificate.course_id,
         certificate.course_version,
         min(certificate.issued_at) as completed_at,
         jsonb_build_object(
           'kind', 'pre_hardening_certificate',
           'migration', '202607210004',
           'certificateIds', jsonb_agg(
             certificate.id order by certificate.created_at, certificate.id
           )
         ) as evidence
  from public.certificates certificate
  where certificate.legacy_review_id is null
    and certificate.completion_snapshot_id is null
  group by certificate.user_id, certificate.course_id, certificate.course_version
), inserted as (
  insert into public.course_completion_snapshots(
    user_id, course_id, course_version, evidence, completed_at
  )
  select user_id, course_id, course_version, evidence, completed_at
  from certificate_evidence
  on conflict (user_id, course_id, course_version) do nothing
  returning id, user_id, course_id, course_version
)
insert into public.audit_logs(
  actor_role, action, entity_type, entity_id, metadata
)
select 'migration',
       'pre_hardening_certificate_snapshot_created',
       'course_completion_snapshot',
       inserted.id::text,
       jsonb_build_object(
         'userId', inserted.user_id,
         'courseId', inserted.course_id,
         'courseVersion', inserted.course_version
       )
from inserted;

update public.certificates certificate
set completion_snapshot_id = snapshot.id
from public.course_completion_snapshots snapshot
where certificate.completion_snapshot_id is null
  and certificate.legacy_review_id is null
  and snapshot.user_id = certificate.user_id
  and snapshot.course_id = certificate.course_id
  and snapshot.course_version = certificate.course_version;

alter table public.legacy_certificate_reviews
  add column if not exists reported_course_version text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'legacy_certificate_reported_course_version_format'
      and conrelid = 'public.legacy_certificate_reviews'::regclass
  ) then
    alter table public.legacy_certificate_reviews
      add constraint legacy_certificate_reported_course_version_format
      check (
        reported_course_version is null
        or reported_course_version ~ '^[0-9]{4}\.[0-9]+$'
      );
  end if;
end;
$$;

-- The CSV contained purchase time, not reversal event time. Repair only rows
-- proven to originate from the legacy ledger and leave an audit trail.
with repaired as (
  update public.orders target
  set refunded_at = null
  from public.legacy_import_records record
  where record.order_id = target.id
    and target.refunded_at is not null
  returning target.id
)
insert into public.audit_logs(actor_role, action, entity_type, entity_id, metadata)
select 'migration', 'legacy_refund_timestamp_cleared', 'order', id::text,
       jsonb_build_object('reason', 'source export had no reversal timestamp')
from repaired;

with repaired as (
  update public.enrollments target
  set revoked_at = null
  from public.legacy_import_records record
  where record.enrollment_id = target.id
    and target.revoked_at is not null
  returning target.id
)
insert into public.audit_logs(actor_role, action, entity_type, entity_id, metadata)
select 'migration', 'legacy_revocation_timestamp_cleared', 'enrollment', id::text,
       jsonb_build_object('reason', 'source export had no revocation timestamp')
from repaired;

alter table public.course_completion_snapshots enable row level security;
alter table public.checkout_customer_leases enable row level security;
revoke all on table public.course_completion_snapshots,
  public.checkout_customer_leases from public, anon, authenticated;
grant all on table public.course_completion_snapshots,
  public.checkout_customer_leases to service_role;

drop function if exists public.claim_checkout_order(uuid, uuid, text, text, boolean, jsonb);
drop function if exists public.fulfill_stripe_order(uuid, uuid, text, text, text, text, text, bigint, text, bigint);
drop function if exists public.fulfill_stripe_order(uuid, uuid, text, text, text, text, text, text, bigint, text, bigint);
drop function if exists public.bind_and_revoke_stripe_order(uuid, uuid, text, text, text, bigint, text, text);
drop function if exists public.bind_and_revoke_stripe_order(uuid, uuid, uuid, text, text, text, bigint, text, text);
drop function if exists public.review_legacy_certificate_reference(uuid, uuid, text, text, text);
drop function if exists public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text);

create or replace function public.lesson_is_unlocked(check_user_id uuid, check_lesson_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons target
    join public.courses course on course.id = target.course_id
    join public.enrollments enrollment
      on enrollment.course_id = target.course_id
     and enrollment.user_id = check_user_id
     and enrollment.status in ('active', 'completed')
    where target.id = check_lesson_id
      and target.status = 'published'
      and not exists (
        select 1
        from public.lessons previous
        where previous.course_id = target.course_id
          and previous.position < target.position
          and previous.status = 'published'
          and not exists (
            select 1 from public.lesson_progress progress
            where progress.user_id = check_user_id
              and progress.lesson_id = previous.id
              and (
                progress.legacy_completed
                or (
                  progress.course_version = course.version
                  and progress.video_completed
                  and progress.quiz_passed
                )
              )
          )
      )
  );
$$;

create or replace function public.certificate_evidence_eligibility(
  check_user_id uuid,
  check_course_id uuid,
  evidence_course_version text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    evidence_course_version ~ '^[0-9]{4}\.[0-9]+$'
    and exists (
      select 1 from public.courses course
      where course.id = check_course_id
    )
    and
    (select count(*) = 7
     from public.lessons
     where course_id = check_course_id and status = 'published')
    and not exists (
      select 1
      from public.lessons lesson
      left join public.lesson_progress progress
        on progress.lesson_id = lesson.id
       and progress.user_id = check_user_id
       and progress.course_version = evidence_course_version
      where lesson.course_id = check_course_id
        and lesson.status = 'published'
        and (coalesce(progress.video_completed, false) = false or coalesce(progress.quiz_passed, false) = false)
    )
    and not exists (
      select 1
      from public.lessons lesson
      where lesson.course_id = check_course_id
        and lesson.status = 'published'
        and not exists (
          select 1
          from public.quiz_attempts attempt
          where attempt.user_id = check_user_id
            and attempt.lesson_id = lesson.id
            and attempt.course_version = evidence_course_version
            and attempt.passed = true
            and attempt.score >= 4
        )
    );
$$;

create or replace function public.certificate_eligibility(check_user_id uuid, check_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.certificate_evidence_eligibility(
    check_user_id,
    check_course_id,
    (select course.version from public.courses course where course.id = check_course_id)
  );
$$;

create or replace function public.record_course_completion_snapshot(
  completing_user_id uuid,
  completing_course_id uuid,
  completing_course_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_id uuid;
  created_snapshot boolean := false;
  affected integer;
  current_course_version text;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(completing_user_id::text || ':' || completing_course_id::text, 0)
  );
  select course.version into strict current_course_version
  from public.courses course
  where course.id = completing_course_id
  for share;
  if completing_course_version is distinct from current_course_version then
    raise exception 'Completion evidence belongs to another course version' using errcode = '23514';
  end if;
  if not public.certificate_evidence_eligibility(
    completing_user_id,
    completing_course_id,
    completing_course_version
  ) then
    raise exception 'Current-version completion evidence is incomplete' using errcode = '23514';
  end if;

  insert into public.course_completion_snapshots(
    user_id, course_id, course_version, evidence
  ) values (
    completing_user_id,
    completing_course_id,
    completing_course_version,
    jsonb_build_object(
      'lessonProgressIds', (
        select jsonb_agg(progress.id order by lesson.position)
        from public.lessons lesson
        join public.lesson_progress progress
          on progress.lesson_id = lesson.id
         and progress.user_id = completing_user_id
         and progress.course_version = completing_course_version
         and progress.video_completed
         and progress.quiz_passed
        where lesson.course_id = completing_course_id
          and lesson.status = 'published'
      ),
      'quizAttemptIds', (
        select jsonb_agg(chosen.attempt_id order by chosen.position)
        from (
          select distinct on (lesson.id)
                 attempt.id as attempt_id,
                 lesson.position
          from public.lessons lesson
          join public.quiz_attempts attempt
            on attempt.lesson_id = lesson.id
           and attempt.user_id = completing_user_id
           and attempt.course_version = completing_course_version
           and attempt.passed = true
           and attempt.score >= 4
          where lesson.course_id = completing_course_id
            and lesson.status = 'published'
          order by lesson.id, attempt.submitted_at desc, attempt.id
        ) chosen
      )
    )
  )
  on conflict (user_id, course_id, course_version) do nothing
  returning id into snapshot_id;
  if snapshot_id is not null then
    created_snapshot := true;
  else
    select snapshot.id into strict snapshot_id
    from public.course_completion_snapshots snapshot
    where snapshot.user_id = completing_user_id
      and snapshot.course_id = completing_course_id
      and snapshot.course_version = completing_course_version;
  end if;

  update public.enrollments enrollment
  set status = 'completed',
      completed_course_version = completing_course_version
  where enrollment.user_id = completing_user_id
    and enrollment.course_id = completing_course_id
    and enrollment.status in ('active', 'completed');
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Completion enrollment is unavailable' using errcode = '23514';
  end if;

  if created_snapshot then
    insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (
      completing_user_id,
      'learner',
      'course_completion_snapshot_created',
      'course_completion_snapshot',
      snapshot_id::text,
      jsonb_build_object(
        'courseId', completing_course_id,
        'courseVersion', completing_course_version
      )
    );
  end if;
  return snapshot_id;
end;
$$;

create or replace function public.activate_certificate_reissue(
  editing_admin_id uuid,
  original_certificate_id uuid,
  replacement_certificate_id uuid,
  replacement_hash text,
  replacement_participant_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.certificates%rowtype;
  replacement public.certificates%rowtype;
  affected integer;
begin
  select * into strict original
  from public.certificates
  where id = original_certificate_id
  for update;

  select * into strict replacement
  from public.certificates
  where id = replacement_certificate_id
  for update;

  if original.status not in ('valid', 'revoked', 'failed')
     or replacement.status <> 'replacing'
     or replacement.replaces_certificate_id is distinct from original.id
     or replacement.user_id <> original.user_id
     or replacement.course_id <> original.course_id
     or replacement.course_version <> original.course_version
     or original.completion_snapshot_id is null
     or replacement.completion_snapshot_id is distinct from original.completion_snapshot_id
     or replacement_hash !~ '^[a-f0-9]{64}$'
     or length(trim(replacement_participant_name)) < 2
     or not exists (
       select 1 from public.course_completion_snapshots snapshot
       where snapshot.id = original.completion_snapshot_id
         and snapshot.user_id = original.user_id
         and snapshot.course_id = original.course_id
         and snapshot.course_version = original.course_version
     ) then
    raise exception 'Certificate reissue state is invalid' using errcode = '22023';
  end if;

  if original.status = 'valid' then
    update public.certificates
    set status = 'archived'
    where id = original.id and status = 'valid';
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Original certificate changed concurrently' using errcode = '40001';
    end if;
  end if;

  update public.certificates
  set status = 'valid',
      file_sha256 = replacement_hash,
      participant_name = trim(replacement_participant_name)
  where id = replacement.id and status = 'replacing';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Replacement certificate changed concurrently' using errcode = '40001';
  end if;

  update public.profiles
  set certificate_name = trim(replacement_participant_name)
  where auth_user_id = original.user_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Certificate profile is missing' using errcode = 'P0002';
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    'certificate_reissued',
    'certificate',
    replacement.id::text,
    jsonb_build_object(
      'originalCertificateId', original.id,
      'originalCertificateNumber', original.certificate_number,
      'replacementCertificateNumber', replacement.certificate_number,
      'participantName', trim(replacement_participant_name)
    )
  );

  return replacement.id;
end;
$$;

create or replace function public.fulfill_stripe_order(
  paid_user_id uuid,
  paid_course_id uuid,
  checkout_session_id text,
  payment_intent_id text,
  customer_id text,
  invoice_id text,
  price_id text,
  billing_fingerprint text,
  total_amount bigint,
  currency_code text,
  total_tax bigint
)
returns table(order_id uuid, access_granted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_enrollment public.enrollments%rowtype;
  competing_order public.orders%rowtype;
  terminal_status text;
begin
  if paid_user_id is null
     or paid_course_id is null
     or nullif(trim(checkout_session_id), '') is null
     or nullif(trim(payment_intent_id), '') is null
     or nullif(trim(price_id), '') is null
     or nullif(trim(billing_fingerprint), '') is null
     or billing_fingerprint !~ '^[a-f0-9]{64}$'
     or total_amount < 0 or total_tax < 0
     or lower(currency_code) !~ '^[a-z]{3}$' then
    raise exception 'Stripe fulfillment input is invalid' using errcode = '22023';
  end if;

  -- Checkout claims, successful payments, and reversals use the same lock key.
  -- This serializes a late success for an expired session with its replacement.
  perform pg_advisory_xact_lock(
    hashtextextended(paid_user_id::text || ':' || paid_course_id::text, 0)
  );
  select stripe_order.* into target_order
  from public.orders stripe_order
  where stripe_order.stripe_checkout_session_id = checkout_session_id
  for update;
  if target_order.id is null
     or target_order.user_id <> paid_user_id
     or target_order.course_id is distinct from paid_course_id
     or target_order.payment_source <> 'stripe'
     or target_order.stripe_price_id <> price_id
     or target_order.billing_snapshot ->> 'billingFingerprint' is distinct from billing_fingerprint
     or (target_order.stripe_payment_intent_id is not null
         and target_order.stripe_payment_intent_id <> payment_intent_id)
     or (target_order.amount_total is not null
         and target_order.amount_total <> total_amount) then
    raise exception 'Stripe order does not match immutable checkout data' using errcode = '23514';
  end if;

  select enrollment.* into target_enrollment
  from public.enrollments enrollment
  where enrollment.user_id = paid_user_id
    and enrollment.course_id = paid_course_id
    and enrollment.access_type = 'purchase'
  order by
    case when enrollment.status in ('pending_payment', 'active', 'completed') then 0 else 1 end,
    case when enrollment.order_id = target_order.id then 0 else 1 end,
    enrollment.created_at desc
  limit 1
  for update;
  if target_enrollment.id is null then
    raise exception 'Stripe order enrollment does not match course metadata' using errcode = '23514';
  end if;

  terminal_status := case
    when target_order.payment_status = 'disputed'
      or (target_enrollment.order_id = target_order.id and target_enrollment.status = 'disputed')
      then 'disputed'
    when target_order.payment_status = 'refunded'
      or (target_enrollment.order_id = target_order.id and target_enrollment.status = 'refunded')
      then 'refunded'
    else null
  end;

  update public.orders
  set stripe_payment_intent_id = coalesce(stripe_payment_intent_id, payment_intent_id),
      stripe_customer_id = coalesce(nullif(customer_id, ''), stripe_customer_id),
      stripe_invoice_id = coalesce(nullif(invoice_id, ''), stripe_invoice_id),
      amount_total = coalesce(amount_total, total_amount),
      currency = lower(currency_code),
      tax_amount = total_tax,
      payment_status = coalesce(terminal_status, 'paid'),
      paid_at = coalesce(paid_at, timezone('utc', now()))
  where id = target_order.id;

  if terminal_status is not null then
    update public.enrollments
    set status = terminal_status,
        revoked_at = coalesce(revoked_at, timezone('utc', now()))
    where id = target_enrollment.id
      and order_id = target_order.id
      and status in ('pending_payment', 'active', 'completed', 'refunded', 'disputed');
    return query select target_order.id, false;
    return;
  end if;

  if target_enrollment.order_id is distinct from target_order.id then
    if target_enrollment.order_id is not null then
      select stripe_order.* into competing_order
      from public.orders stripe_order
      where stripe_order.id = target_enrollment.order_id
      for update;
    end if;

    -- A second completed charge must not steal an enrollment already backed by
    -- another paid order. It remains recorded as paid for support/refund work.
    if competing_order.payment_status = 'paid' then
      insert into public.audit_logs(
        actor_role, action, entity_type, entity_id, metadata
      ) values (
        'system',
        'stripe_duplicate_payment_detected',
        'order',
        target_order.id::text,
        jsonb_build_object(
          'accessOrderId', competing_order.id,
          'userId', paid_user_id,
          'courseId', paid_course_id
        )
      );
      return query select target_order.id, false;
      return;
    end if;
    if target_enrollment.status not in (
      'pending_payment', 'active', 'completed', 'refunded', 'disputed'
    ) then
      return query select target_order.id, false;
      return;
    end if;

    update public.orders
    set payment_status = 'expired'
    where id = target_enrollment.order_id
      and payment_status in ('pending', 'processing');

    update public.enrollments
    set order_id = target_order.id,
        status = case
          when status = 'completed' or completed_course_version is not null
            then 'completed'
          else 'active'
        end,
        granted_at = coalesce(granted_at, timezone('utc', now())),
        revoked_at = null
    where id = target_enrollment.id;
    return query select target_order.id, true;
    return;
  end if;

  if target_enrollment.status not in ('pending_payment', 'active', 'completed') then
    return query select target_order.id, false;
    return;
  end if;

  update public.enrollments
  set status = case when status = 'completed' then 'completed' else 'active' end,
      granted_at = coalesce(granted_at, timezone('utc', now())),
      revoked_at = null
  where id = target_enrollment.id;

  return query select target_order.id, true;
end;
$$;

create or replace function public.bind_and_revoke_stripe_order(
  target_order_id uuid,
  expected_user_id uuid,
  expected_course_id uuid,
  payment_intent_id text,
  expected_price_id text,
  expected_billing_fingerprint text,
  expected_total_amount bigint,
  new_payment_status text,
  new_enrollment_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_enrollment public.enrollments%rowtype;
  alternate_paid_order public.orders%rowtype;
  final_status text;
begin
  if target_order_id is null
     or expected_user_id is null
     or expected_course_id is null
     or new_payment_status not in ('refunded', 'disputed')
     or new_enrollment_status not in ('refunded', 'disputed')
     or nullif(trim(payment_intent_id), '') is null
     or nullif(trim(expected_price_id), '') is null
     or expected_billing_fingerprint !~ '^[a-f0-9]{64}$'
     or expected_total_amount is null or expected_total_amount < 0 then
    raise exception 'Invalid Stripe reversal input' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(expected_user_id::text || ':' || expected_course_id::text, 0)
  );
  select stripe_order.* into target_order
  from public.orders stripe_order
  where stripe_order.id = target_order_id
  for update;
  if target_order.id is null
     or target_order.user_id <> expected_user_id
     or target_order.course_id is distinct from expected_course_id
     or target_order.payment_source <> 'stripe'
     or target_order.stripe_price_id <> expected_price_id
     or target_order.billing_snapshot ->> 'billingFingerprint' is distinct from expected_billing_fingerprint
     or (target_order.stripe_payment_intent_id is not null
         and target_order.stripe_payment_intent_id <> payment_intent_id)
     or (target_order.amount_total is not null
         and target_order.amount_total <> expected_total_amount)
     or exists (
       select 1 from public.orders other_order
       where other_order.stripe_payment_intent_id = payment_intent_id
         and other_order.id <> target_order.id
     ) then
    raise exception 'Stripe reversal does not match immutable order data' using errcode = '23514';
  end if;

  final_status := case
    when target_order.payment_status = 'disputed' or new_payment_status = 'disputed'
      then 'disputed'
    else 'refunded'
  end;
  update public.orders
  set stripe_payment_intent_id = coalesce(stripe_payment_intent_id, payment_intent_id),
      amount_total = coalesce(amount_total, expected_total_amount),
      payment_status = final_status,
      refunded_at = case
        when new_payment_status = 'refunded' then coalesce(refunded_at, timezone('utc', now()))
        else refunded_at
      end
  where id = target_order.id;

  select enrollment.* into target_enrollment
  from public.enrollments enrollment
  where enrollment.user_id = expected_user_id
    and enrollment.course_id = expected_course_id
    and enrollment.access_type = 'purchase'
  order by
    case when enrollment.status in ('pending_payment', 'active', 'completed') then 0 else 1 end,
    case when enrollment.order_id = target_order.id then 0 else 1 end,
    enrollment.created_at desc
  limit 1
  for update;

  if target_enrollment.id is not null
     and target_enrollment.order_id = target_order.id
     and target_enrollment.status <> 'revoked' then
    select other_order.* into alternate_paid_order
    from public.orders other_order
    where other_order.user_id = expected_user_id
      and other_order.course_id = expected_course_id
      and other_order.id <> target_order.id
      and other_order.payment_status = 'paid'
    order by other_order.paid_at asc nulls last, other_order.created_at asc, other_order.id
    limit 1
    for update;

    if alternate_paid_order.id is not null then
      update public.enrollments
      set order_id = alternate_paid_order.id,
          status = case
            when status = 'completed' or completed_course_version is not null
              then 'completed'
            else 'active'
          end,
          granted_at = coalesce(granted_at, timezone('utc', now())),
          revoked_at = null
      where id = target_enrollment.id;
    else
      update public.enrollments enrollment
      set status = case
            when enrollment.status = 'disputed' or new_enrollment_status = 'disputed'
              then 'disputed'
            else 'refunded'
          end,
          revoked_at = coalesce(revoked_at, timezone('utc', now()))
      where enrollment.id = target_enrollment.id
        and enrollment.status in (
          'pending_payment', 'active', 'completed', 'refunded', 'disputed'
        );
    end if;
  end if;
  return target_order.id;
end;
$$;

create or replace function public.submit_quiz_attempt(
  submitting_user_id uuid,
  target_attempt_id uuid,
  submitted_answers jsonb
)
returns table(score smallint, passed boolean, already_submitted boolean, course_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_attempt public.quiz_attempts%rowtype;
  answer_count integer;
  correct_count integer;
  completed_now boolean;
  attempt_course_id uuid;
  current_course_version text;
  current_progress public.lesson_progress%rowtype;
begin
  select * into locked_attempt
  from public.quiz_attempts
  where id = target_attempt_id
  for update;

  if locked_attempt.id is null or locked_attempt.user_id <> submitting_user_id then
    raise exception 'Quiz attempt not found' using errcode = 'P0002';
  end if;

  select lesson.course_id, course.version
    into strict attempt_course_id, current_course_version
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.id = locked_attempt.lesson_id
  for share of course;
  if locked_attempt.course_version is distinct from current_course_version then
    raise exception 'Quiz attempt belongs to another course version' using errcode = '23514';
  end if;

  select progress.* into current_progress
  from public.lesson_progress progress
  where progress.user_id = submitting_user_id
    and progress.lesson_id = locked_attempt.lesson_id
  for update;
  if current_progress.id is null
     or current_progress.course_version is distinct from current_course_version
     or not current_progress.video_completed then
    raise exception 'Current-version video evidence is required' using errcode = '23514';
  end if;

  if locked_attempt.submitted_at is not null then
    completed_now := public.certificate_evidence_eligibility(
      submitting_user_id,
      attempt_course_id,
      current_course_version
    );
    if completed_now then
      perform public.record_course_completion_snapshot(
        submitting_user_id,
        attempt_course_id,
        current_course_version
      );
    end if;
    return query select locked_attempt.score, locked_attempt.passed, true, completed_now;
    return;
  end if;

  if jsonb_typeof(submitted_answers) <> 'array' then
    raise exception 'Answers must be an array' using errcode = '22023';
  end if;

  with answers as (
    select (value ->> 'questionId')::uuid as question_id,
           (value ->> 'optionId')::uuid as option_id
    from jsonb_array_elements(submitted_answers)
  )
  select count(*), count(distinct question_id)
    into answer_count, correct_count
  from answers;

  if answer_count <> 5 or correct_count <> 5 then
    raise exception 'Exactly five distinct answers are required' using errcode = '22023';
  end if;

  if exists (
    with answers as (
      select (value ->> 'questionId')::uuid as question_id,
             (value ->> 'optionId')::uuid as option_id
      from jsonb_array_elements(submitted_answers)
    )
    select 1 from answers answer
    left join public.quiz_options option
      on option.id = answer.option_id and option.question_id = answer.question_id
    where option.id is null
       or not (answer.question_id = any(locked_attempt.question_order))
       or not coalesce(
         (locked_attempt.option_order -> (answer.question_id::text)) @> to_jsonb(answer.option_id::text),
         false
       )
  ) then
    raise exception 'An answer does not belong to this attempt' using errcode = '22023';
  end if;

  insert into public.quiz_responses(attempt_id, question_id, selected_option_id, is_correct_snapshot)
  select locked_attempt.id, answer.question_id, answer.option_id,
         locked_attempt.answer_key ->> answer.question_id::text = answer.option_id::text
  from (
    select (value ->> 'questionId')::uuid as question_id,
           (value ->> 'optionId')::uuid as option_id
    from jsonb_array_elements(submitted_answers)
  ) answer
  join public.quiz_options option
    on option.id = answer.option_id and option.question_id = answer.question_id;

  select count(*) filter (where is_correct_snapshot)::smallint into correct_count
  from public.quiz_responses
  where attempt_id = locked_attempt.id;

  update public.quiz_attempts
  set submitted_at = timezone('utc', now()), score = correct_count, passed = correct_count >= 4
  where id = locked_attempt.id;

  update public.lesson_progress
  set quiz_passed = quiz_passed or correct_count >= 4,
      completed_at = case
        when video_completed and (quiz_passed or correct_count >= 4) then coalesce(completed_at, timezone('utc', now()))
        else completed_at
      end
  where user_id = submitting_user_id
    and lesson_id = locked_attempt.lesson_id
    and course_version = current_course_version;

  completed_now := public.certificate_evidence_eligibility(
    submitting_user_id,
    attempt_course_id,
    current_course_version
  );

  if completed_now then
    perform public.record_course_completion_snapshot(
      submitting_user_id,
      attempt_course_id,
      current_course_version
    );
  end if;

  return query select correct_count::smallint, correct_count >= 4, false, completed_now;
end;
$$;

create or replace function public.record_video_progress(
  progressing_user_id uuid,
  access_session_id uuid,
  target_lesson_id uuid,
  normalized_ranges jsonb,
  normalized_watched_seconds integer,
  reported_position numeric
)
returns table(watched_seconds integer, video_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_session public.video_access_sessions%rowtype;
  target_lesson public.lessons%rowtype;
  prior_progress public.lesson_progress%rowtype;
  current_course_version text;
  existing_ranges jsonb;
  merged_ranges jsonb;
  prior_watched_seconds integer;
  merged_watched_seconds integer;
  newly_reported integer;
  since_session numeric;
  since_report numeric;
  completed boolean;
begin
  select * into locked_session
  from public.video_access_sessions
  where id = access_session_id
  for update;

  if locked_session.id is null
     or locked_session.user_id <> progressing_user_id
     or locked_session.lesson_id <> target_lesson_id
     or locked_session.revoked_at is not null
     or locked_session.expires_at <= timezone('utc', now()) then
    raise exception 'Video access session is invalid' using errcode = '42501';
  end if;

  select course.version into strict current_course_version
  from public.courses course
  join public.lessons lesson on lesson.course_id = course.id
  where lesson.id = target_lesson_id
  for share of course;
  select * into strict target_lesson from public.lessons where id = target_lesson_id;
  if locked_session.course_version is distinct from current_course_version
     or normalized_watched_seconds is null
     or normalized_watched_seconds < 0
     or normalized_watched_seconds > target_lesson.duration_seconds
     or reported_position is null
     or reported_position < 0
     or reported_position > target_lesson.duration_seconds
     or jsonb_typeof(normalized_ranges) <> 'array'
     or exists (
       select 1
       from jsonb_array_elements(normalized_ranges) item
       where jsonb_typeof(item.value) <> 'object'
          or jsonb_typeof(item.value -> 'start') is distinct from 'number'
          or jsonb_typeof(item.value -> 'end') is distinct from 'number'
          or (item.value ->> 'start')::numeric < 0
          or (item.value ->> 'end')::numeric > target_lesson.duration_seconds
          or (item.value ->> 'end')::numeric <= (item.value ->> 'start')::numeric
     )
     or not exists (
       select 1
       from jsonb_array_elements(normalized_ranges) item
       where reported_position >= (item.value ->> 'start')::numeric - 3
         and reported_position <= (item.value ->> 'end')::numeric + 3
     ) then
    raise exception 'Invalid progress values' using errcode = '22023';
  end if;

  -- The advisory key also serializes the first insert, for which FOR UPDATE
  -- alone cannot lock an as-yet nonexistent progress row.
  perform pg_advisory_xact_lock(
    hashtextextended(progressing_user_id::text || ':' || target_lesson_id::text, 0)
  );
  select * into prior_progress
  from public.lesson_progress
  where user_id = progressing_user_id and lesson_id = target_lesson_id
  for update;

  if prior_progress.id is not null
     and prior_progress.course_version = current_course_version then
    existing_ranges := prior_progress.watched_ranges;
    prior_watched_seconds := prior_progress.watched_seconds;
  else
    existing_ranges := '[]'::jsonb;
    prior_watched_seconds := 0;
  end if;

  with raw_ranges as (
    select (item.value ->> 'start')::numeric as range_start,
           (item.value ->> 'end')::numeric as range_end
    from jsonb_array_elements(existing_ranges || normalized_ranges) item
  ), ordered_ranges as (
    select range_start,
           range_end,
           max(range_end) over (
             order by range_start, range_end
             rows between unbounded preceding and 1 preceding
           ) as prior_max_end
    from raw_ranges
  ), marked_ranges as (
    select range_start,
           range_end,
           case
             when prior_max_end is null or range_start > prior_max_end + 0.5 then 1
             else 0
           end as starts_group
    from ordered_ranges
  ), grouped_ranges as (
    select range_start,
           range_end,
           sum(starts_group) over (order by range_start, range_end) as range_group
    from marked_ranges
  ), merged as (
    select round(min(range_start), 1) as range_start,
           round(max(range_end), 1) as range_end
    from grouped_ranges
    group by range_group
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('start', range_start, 'end', range_end)
             order by range_start
           ),
           '[]'::jsonb
         ),
         least(
           target_lesson.duration_seconds,
           floor(coalesce(sum(range_end - range_start), 0))::integer
         )
    into merged_ranges, merged_watched_seconds
  from merged;

  newly_reported := greatest(merged_watched_seconds - prior_watched_seconds, 0);
  since_session := greatest(extract(epoch from timezone('utc', now()) - locked_session.issued_at), 0);
  since_report := greatest(extract(epoch from timezone('utc', now()) - coalesce(locked_session.last_reported_at, locked_session.issued_at)), 0);

  if locked_session.reported_seconds + newly_reported > ceil(since_session * 1.15 + 15)
     or newly_reported > ceil(since_report * 1.25 + 15) then
    raise exception 'Reported progress exceeds elapsed server time' using errcode = '22023';
  end if;

  completed := merged_watched_seconds::numeric / target_lesson.duration_seconds >= target_lesson.watch_threshold;

  insert into public.lesson_progress(
    user_id, lesson_id, course_version, watched_ranges, watched_seconds, video_completed
  ) values (
    progressing_user_id, target_lesson_id, current_course_version, merged_ranges,
    merged_watched_seconds, completed
  )
  on conflict (user_id, lesson_id) do update set
    course_version = excluded.course_version,
    watched_ranges = excluded.watched_ranges,
    watched_seconds = excluded.watched_seconds,
    video_completed = (
      public.lesson_progress.course_version = excluded.course_version
      and public.lesson_progress.video_completed
    ) or excluded.video_completed,
    quiz_passed = case
      when public.lesson_progress.course_version = excluded.course_version
        then public.lesson_progress.quiz_passed
      else false
    end,
    completed_at = case
      when public.lesson_progress.course_version <> excluded.course_version
        or public.lesson_progress.course_version is null then null
      when public.lesson_progress.quiz_passed and excluded.video_completed
        then coalesce(public.lesson_progress.completed_at, timezone('utc', now()))
      else public.lesson_progress.completed_at
    end,
    started_at = case
      when public.lesson_progress.course_version = excluded.course_version
        then public.lesson_progress.started_at
      else timezone('utc', now())
    end;

  update public.video_access_sessions
  set reported_seconds = reported_seconds + newly_reported,
      last_reported_at = timezone('utc', now()),
      last_position = reported_position
  where id = access_session_id;

  return query
  select progress.watched_seconds, progress.video_completed
  from public.lesson_progress progress
  where progress.user_id = progressing_user_id and progress.lesson_id = target_lesson_id;
end;
$$;

create or replace function public.claim_checkout_order(
  checkout_user_id uuid,
  checkout_course_id uuid,
  checkout_customer_id text,
  checkout_price_id text,
  checkout_business_purchase boolean,
  checkout_billing_snapshot jsonb
)
returns table(order_id uuid, checkout_session_id text, rotated_checkout_session_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  target_enrollment public.enrollments%rowtype;
  requested_fingerprint text;
  rotated_session_id text;
  prior_enrollment_session_id text;
begin
  requested_fingerprint := checkout_billing_snapshot ->> 'billingFingerprint';
  if checkout_user_id is null
     or checkout_course_id is null
     or nullif(trim(checkout_customer_id), '') is null
     or nullif(trim(checkout_price_id), '') is null
     or jsonb_typeof(checkout_billing_snapshot) <> 'object'
     or nullif(trim(requested_fingerprint), '') is null
     or requested_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'A canonical billing fingerprint is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(checkout_user_id::text || ':' || checkout_course_id::text, 0)
  );
  select * into target_order
  from public.orders
  where user_id = checkout_user_id
    and course_id = checkout_course_id
    and stripe_price_id = checkout_price_id
    and payment_status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if target_order.id is not null then
    rotated_session_id := target_order.superseded_checkout_session_id;
  end if;

  if target_order.id is not null and (
       target_order.billing_snapshot ->> 'billingFingerprint' is distinct from requested_fingerprint
       or target_order.business_purchase is distinct from checkout_business_purchase
     ) then
    rotated_session_id := coalesce(
      target_order.stripe_checkout_session_id,
      target_order.superseded_checkout_session_id
    );
    update public.orders
    set payment_status = 'expired'
    where id = target_order.id and payment_status = 'pending';
    target_order := null;
  end if;

  if target_order.id is null then
    insert into public.orders(
      user_id, course_id, stripe_customer_id, stripe_price_id,
      superseded_checkout_session_id, payment_status, business_purchase,
      billing_snapshot
    ) values (
      checkout_user_id, checkout_course_id, checkout_customer_id,
      checkout_price_id, rotated_session_id, 'pending',
      checkout_business_purchase, checkout_billing_snapshot
    ) returning * into target_order;
  else
    update public.orders
    set stripe_customer_id = case
      when stripe_checkout_session_id is null then checkout_customer_id
      else stripe_customer_id
    end
    where id = target_order.id;
  end if;

  select * into target_enrollment
  from public.enrollments
  where user_id = checkout_user_id
    and course_id = checkout_course_id
    and status in ('pending_payment', 'active', 'completed')
  order by created_at desc
  limit 1
  for update;

  if target_enrollment.status in ('active', 'completed') then
    raise exception 'User already has course access' using errcode = '23505';
  elsif target_enrollment.id is null then
    insert into public.enrollments(user_id, course_id, status, order_id, access_type)
    values (checkout_user_id, checkout_course_id, 'pending_payment', target_order.id, 'purchase');
  else
    if target_enrollment.order_id is distinct from target_order.id then
      select stripe_checkout_session_id into prior_enrollment_session_id
      from public.orders
      where id = target_enrollment.order_id
      for update;
      update public.orders
      set payment_status = 'expired'
      where id = target_enrollment.order_id
        and payment_status in ('pending', 'processing');
      rotated_session_id := coalesce(
        rotated_session_id,
        prior_enrollment_session_id
      );
      update public.orders
      set superseded_checkout_session_id = coalesce(
        superseded_checkout_session_id,
        prior_enrollment_session_id
      )
      where id = target_order.id;
    end if;
    update public.enrollments set order_id = target_order.id where id = target_enrollment.id;
  end if;

  return query
  select target_order.id, target_order.stripe_checkout_session_id, rotated_session_id;
end;
$$;

create or replace function public.confirm_checkout_session_rotation(
  checkout_order_id uuid,
  superseded_session_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if checkout_order_id is null
     or nullif(trim(superseded_session_id), '') is null then
    raise exception 'Checkout rotation confirmation is invalid' using errcode = '22023';
  end if;
  update public.orders
  set superseded_checkout_session_id = null
  where id = checkout_order_id
    and superseded_checkout_session_id = superseded_session_id
    and payment_status = 'pending';
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.acquire_checkout_customer_lease(
  lease_user_id uuid,
  requested_lease_token uuid,
  lease_ttl_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if lease_user_id is null
     or requested_lease_token is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout customer lease input is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('checkout-customer:' || lease_user_id::text, 0)
  );
  insert into public.checkout_customer_leases(
    user_id, lease_token, expires_at, updated_at
  ) values (
    lease_user_id,
    requested_lease_token,
    timezone('utc', now()) + make_interval(secs => lease_ttl_seconds),
    timezone('utc', now())
  )
  on conflict (user_id) do update set
    lease_token = excluded.lease_token,
    expires_at = excluded.expires_at,
    updated_at = excluded.updated_at
  where public.checkout_customer_leases.expires_at <= timezone('utc', now())
     or public.checkout_customer_leases.lease_token = excluded.lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_checkout_customer_lease(
  lease_user_id uuid,
  requested_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if lease_user_id is null or requested_lease_token is null then
    raise exception 'Checkout customer lease input is invalid' using errcode = '22023';
  end if;
  delete from public.checkout_customer_leases
  where user_id = lease_user_id and lease_token = requested_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.update_checkout_profile_under_lease(
  checkout_profile_user_id uuid,
  checkout_lease_token uuid,
  checkout_first_name text,
  checkout_last_name text,
  checkout_billing_type text,
  checkout_company_name text,
  checkout_contact_person text,
  checkout_billing_address jsonb,
  checkout_tax_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if checkout_profile_user_id is null
     or checkout_lease_token is null
     or length(trim(checkout_first_name)) not between 2 and 100
     or length(trim(checkout_last_name)) not between 2 and 100
     or checkout_billing_type not in ('private', 'business')
     or jsonb_typeof(checkout_billing_address) <> 'object' then
    raise exception 'Checkout profile input is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('checkout-customer:' || checkout_profile_user_id::text, 0)
  );
  update public.profiles
  set first_name = trim(checkout_first_name),
      last_name = trim(checkout_last_name),
      billing_type = checkout_billing_type,
      company_name = checkout_company_name,
      contact_person = checkout_contact_person,
      billing_address = checkout_billing_address,
      tax_id = checkout_tax_id
  where auth_user_id = checkout_profile_user_id
    and exists (
      select 1
      from public.checkout_customer_leases lease
      where lease.user_id = checkout_profile_user_id
        and lease.lease_token = checkout_lease_token
        and lease.expires_at > timezone('utc', now())
    );
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Checkout customer lease was lost before profile update'
      using errcode = '40001';
  end if;
  return true;
end;
$$;

create or replace function public.review_legacy_certificate_reference(
  editing_admin_id uuid,
  target_review_id uuid,
  review_decision text,
  review_evidence_summary text,
  review_reported_course_version text,
  review_evidence_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.legacy_certificate_reviews%rowtype;
begin
  if review_decision not in ('verified', 'rejected')
     or nullif(trim(review_evidence_summary), '') is null
     or length(trim(review_evidence_summary)) not between 10 and 4000
     or (
       review_decision = 'verified'
       and nullif(trim(review_reported_course_version), '') is null
     )
     or (
       nullif(trim(review_reported_course_version), '') is not null
       and trim(review_reported_course_version) !~ '^[0-9]{4}\.[0-9]+$'
     )
     or (nullif(trim(review_evidence_reference), '') is not null
         and length(trim(review_evidence_reference)) not between 3 and 1000) then
    raise exception 'Invalid legacy certificate review decision' using errcode = '22023';
  end if;

  select * into strict review
  from public.legacy_certificate_reviews
  where id = target_review_id
  for update;
  if review.review_status not in ('pending', 'verified') then
    raise exception 'Legacy certificate review is already final' using errcode = '23514';
  end if;

  update public.legacy_certificate_reviews
  set review_status = review_decision,
      reported_course_version = case
        when review_decision = 'verified'
          then trim(review_reported_course_version)
        else null
      end,
      evidence_summary = trim(review_evidence_summary),
      evidence_reference = nullif(trim(review_evidence_reference), ''),
      reviewed_by = editing_admin_id,
      reviewed_at = timezone('utc', now()),
      mapped_certificate_id = null,
      resolved_at = case
        when review_decision = 'rejected' then timezone('utc', now())
        else null
      end
  where id = review.id;

  insert into public.audit_logs(
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    editing_admin_id,
    'admin',
    case when review_decision = 'verified'
      then 'legacy_certificate_evidence_verified'
      else 'legacy_certificate_evidence_rejected'
    end,
    'legacy_certificate_review',
    review.id::text,
    jsonb_build_object(
      'reportedStatus', review.reported_status,
      'reportedCourseVersion', case
        when review_decision = 'verified'
          then trim(review_reported_course_version)
        else null
      end,
      'paymentSource', review.payment_source,
      'sourceId', review.source_id,
      'evidenceReferenceProvided',
        nullif(trim(review_evidence_reference), '') is not null
    )
  );
  return review.id;
end;
$$;

create or replace function public.map_legacy_certificate_reference(
  editing_admin_id uuid,
  target_review_id uuid,
  target_certificate_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.legacy_certificate_reviews%rowtype;
  certificate public.certificates%rowtype;
  affected integer;
begin
  select * into strict review
  from public.legacy_certificate_reviews
  where id = target_review_id
  for update;
  if review.review_status <> 'verified'
     or review.reported_course_version is null then
    raise exception 'Legacy certificate evidence is not verified' using errcode = '23514';
  end if;

  select * into strict certificate
  from public.certificates
  where id = target_certificate_id
  for update;
  if certificate.user_id <> review.user_id
     or certificate.course_id <> review.course_id
     or certificate.course_version <> review.reported_course_version
     or certificate.legacy_review_id is not null then
    raise exception 'Certificate does not match the legacy review' using errcode = '23514';
  end if;
  if (review.reported_status = 'valid' and certificate.status not in ('valid', 'archived'))
     or (review.reported_status = 'revoked' and certificate.status <> 'revoked')
     or review.reported_status = 'pending' then
    raise exception 'Certificate status does not match the legacy reference' using errcode = '23514';
  end if;

  update public.certificates
  set legacy_review_id = review.id
  where id = certificate.id and legacy_review_id is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Certificate mapping changed concurrently' using errcode = '40001';
  end if;

  update public.legacy_certificate_reviews
  set review_status = 'resolved',
      mapped_certificate_id = certificate.id,
      resolved_at = timezone('utc', now())
  where id = review.id and review_status = 'verified';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Legacy certificate review changed concurrently' using errcode = '40001';
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    'legacy_certificate_reference_mapped',
    'legacy_certificate_review',
    review.id::text,
    jsonb_build_object(
      'certificateId', certificate.id,
      'certificateNumber', certificate.certificate_number,
      'reportedStatus', review.reported_status,
      'reportedCourseVersion', review.reported_course_version,
      'mappedStatus', certificate.status
    )
  );
  return certificate.id;
end;
$$;

create or replace function public.activate_legacy_certificate_reissue(
  editing_admin_id uuid,
  target_review_id uuid,
  replacement_certificate_id uuid,
  replacement_hash text,
  replacement_participant_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.legacy_certificate_reviews%rowtype;
  replacement public.certificates%rowtype;
  affected integer;
begin
  select * into strict review
  from public.legacy_certificate_reviews
  where id = target_review_id
  for update;
  select * into strict replacement
  from public.certificates
  where id = replacement_certificate_id
  for update;

  if review.review_status <> 'verified'
     or review.reported_status <> 'valid'
     or review.reported_course_version is null then
    raise exception 'A verified valid legacy reference is required' using errcode = '23514';
  end if;
  if replacement.status <> 'replacing'
     or replacement.legacy_review_id is distinct from review.id
     or replacement.user_id <> review.user_id
     or replacement.course_id <> review.course_id
     or replacement.course_version <> review.reported_course_version
     or replacement.completion_snapshot_id is not null
     or replacement_hash !~ '^[a-f0-9]{64}$'
     or length(trim(replacement_participant_name)) not between 2 and 160 then
    raise exception 'Legacy certificate replacement is invalid' using errcode = '23514';
  end if;

  -- This explicit evidence path does not weaken automatic quiz eligibility.
  update public.certificates
  set status = 'valid',
      file_sha256 = replacement_hash,
      participant_name = trim(replacement_participant_name)
  where id = replacement.id and status = 'replacing';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Legacy certificate replacement changed concurrently' using errcode = '40001';
  end if;

  update public.legacy_certificate_reviews
  set review_status = 'resolved',
      mapped_certificate_id = replacement.id,
      resolved_at = timezone('utc', now())
  where id = review.id and review_status = 'verified';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Legacy certificate review changed concurrently' using errcode = '40001';
  end if;

  update public.profiles
  set certificate_name = trim(replacement_participant_name)
  where auth_user_id = review.user_id;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    'legacy_certificate_reissued',
    'legacy_certificate_review',
    review.id::text,
    jsonb_build_object(
      'certificateId', replacement.id,
      'certificateNumber', replacement.certificate_number,
      'reportedStatus', review.reported_status,
      'reportedCourseVersion', review.reported_course_version
    )
  );
  return replacement.id;
end;
$$;

revoke execute on function public.lesson_is_unlocked(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.certificate_evidence_eligibility(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.certificate_eligibility(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.record_course_completion_snapshot(uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.activate_certificate_reissue(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function public.fulfill_stripe_order(uuid, uuid, text, text, text, text, text, text, bigint, text, bigint)
  from public, anon, authenticated;
revoke execute on function public.bind_and_revoke_stripe_order(uuid, uuid, uuid, text, text, text, bigint, text, text)
  from public, anon, authenticated;
revoke execute on function public.submit_quiz_attempt(uuid, uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.record_video_progress(uuid, uuid, uuid, jsonb, integer, numeric)
  from public, anon, authenticated;
revoke execute on function public.claim_checkout_order(uuid, uuid, text, text, boolean, jsonb)
  from public, anon, authenticated;
revoke execute on function public.confirm_checkout_session_rotation(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.acquire_checkout_customer_lease(uuid, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.release_checkout_customer_lease(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.update_checkout_profile_under_lease(uuid, uuid, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.lesson_is_unlocked(uuid, uuid) to service_role;
grant execute on function public.certificate_evidence_eligibility(uuid, uuid, text) to service_role;
grant execute on function public.certificate_eligibility(uuid, uuid) to service_role;
grant execute on function public.record_course_completion_snapshot(uuid, uuid, text) to service_role;
grant execute on function public.activate_certificate_reissue(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.fulfill_stripe_order(uuid, uuid, text, text, text, text, text, text, bigint, text, bigint) to service_role;
grant execute on function public.bind_and_revoke_stripe_order(uuid, uuid, uuid, text, text, text, bigint, text, text) to service_role;
grant execute on function public.submit_quiz_attempt(uuid, uuid, jsonb) to service_role;
grant execute on function public.record_video_progress(uuid, uuid, uuid, jsonb, integer, numeric) to service_role;
grant execute on function public.claim_checkout_order(uuid, uuid, text, text, boolean, jsonb) to service_role;
grant execute on function public.confirm_checkout_session_rotation(uuid, text) to service_role;
grant execute on function public.acquire_checkout_customer_lease(uuid, uuid, integer) to service_role;
grant execute on function public.release_checkout_customer_lease(uuid, uuid) to service_role;
grant execute on function public.update_checkout_profile_under_lease(uuid, uuid, text, text, text, text, text, jsonb, text) to service_role;
grant execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid) to service_role;
grant execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text) to service_role;

commit;
