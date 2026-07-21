-- Upgrade already-imported legacy participants without inventing playback,
-- quiz attempts, or certificate validity. Every operation is safe to run on a
-- database that was created from the updated 001/002 migrations as well.

alter table public.lesson_progress
  add column if not exists legacy_completed boolean;
update public.lesson_progress
set legacy_completed = false
where legacy_completed is null;
alter table public.lesson_progress
  alter column legacy_completed set default false,
  alter column legacy_completed set not null;

alter table public.legacy_import_records
  add column if not exists reported_completed_lessons smallint;

-- Older imports kept the count only in the immutable audit metadata. Restore
-- it once into the import ledger, then make the column authoritative.
with recovered as (
  select distinct on (record.payment_source, record.source_id)
         record.payment_source,
         record.source_id,
         case
           when audit.metadata ->> 'reportedCompletedLessons' ~ '^[0-7]$'
             then (audit.metadata ->> 'reportedCompletedLessons')::smallint
           else 0::smallint
         end as completed_lessons
  from public.legacy_import_records record
  left join public.audit_logs audit
    on audit.action = 'legacy_participant_import'
   and audit.entity_type = 'profile'
   and audit.entity_id = record.user_id::text
   and audit.metadata ->> 'paymentSource' = record.payment_source
   and audit.metadata ->> 'sourceId' = record.source_id
  order by record.payment_source, record.source_id, audit.created_at desc nulls last
)
update public.legacy_import_records record
set reported_completed_lessons = recovered.completed_lessons
from recovered
where record.payment_source = recovered.payment_source
  and record.source_id = recovered.source_id
  and record.reported_completed_lessons is null;

update public.legacy_import_records
set reported_completed_lessons = 0
where reported_completed_lessons is null;

alter table public.legacy_import_records
  alter column reported_completed_lessons set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'legacy_import_completed_lessons_range'
      and conrelid = 'public.legacy_import_records'::regclass
  ) then
    alter table public.legacy_import_records
      add constraint legacy_import_completed_lessons_range
      check (reported_completed_lessons between 0 and 7);
  end if;
end;
$$;

create table if not exists public.legacy_certificate_reviews (
  id uuid primary key default gen_random_uuid(),
  payment_source text not null,
  source_id text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  reported_status text not null check (reported_status in ('pending', 'valid', 'revoked')),
  reported_course_version text check (
    reported_course_version is null or reported_course_version ~ '^[0-9]{4}\.[0-9]+$'
  ),
  review_status text not null default 'pending' check (review_status in ('pending', 'verified', 'rejected', 'resolved')),
  evidence_summary text check (evidence_summary is null or length(trim(evidence_summary)) between 10 and 4000),
  evidence_reference text check (evidence_reference is null or length(trim(evidence_reference)) between 3 and 1000),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  mapped_certificate_id uuid unique references public.certificates(id) on delete restrict,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (payment_source, source_id),
  foreign key (payment_source, source_id)
    references public.legacy_import_records(payment_source, source_id) on delete restrict,
  constraint legacy_certificate_review_state check (
    (review_status = 'pending'
      and reviewed_by is null and reviewed_at is null
      and mapped_certificate_id is null and resolved_at is null)
    or (review_status = 'verified'
      and reviewed_by is not null and reviewed_at is not null
      and evidence_summary is not null
      and mapped_certificate_id is null and resolved_at is null)
    or (review_status = 'rejected'
      and reviewed_by is not null and reviewed_at is not null
      and evidence_summary is not null
      and mapped_certificate_id is null and resolved_at is not null)
    or (review_status = 'resolved'
      and reviewed_by is not null and reviewed_at is not null
      and evidence_summary is not null
      and mapped_certificate_id is not null and resolved_at is not null)
  )
);

alter table public.certificates
  add column if not exists legacy_review_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'certificates_legacy_review_id_fkey'
      and conrelid = 'public.certificates'::regclass
  ) then
    alter table public.certificates
      add constraint certificates_legacy_review_id_fkey
      foreign key (legacy_review_id)
      references public.legacy_certificate_reviews(id) on delete restrict;
  end if;
end;
$$;

create unique index if not exists certificates_one_active_legacy_review
  on public.certificates(legacy_review_id)
  where legacy_review_id is not null and status in ('replacing', 'valid');
create index if not exists legacy_certificate_reviews_queue_idx
  on public.legacy_certificate_reviews(review_status, created_at desc);
create index if not exists legacy_certificate_reviews_user_idx
  on public.legacy_certificate_reviews(user_id, created_at desc);

drop trigger if exists legacy_certificate_reviews_updated_at
  on public.legacy_certificate_reviews;
create trigger legacy_certificate_reviews_updated_at
before update on public.legacy_certificate_reviews
for each row execute function public.set_updated_at();

alter table public.legacy_certificate_reviews enable row level security;
revoke all on table public.legacy_certificate_reviews from public, anon, authenticated;
grant all on table public.legacy_certificate_reviews to service_role;

-- Convert the exact shape written by the former importer back to unknown
-- playback evidence. Rows updated later by a learner are preserved; the
-- historical completion marker remains true in either case.
with ranked_legacy_lessons as (
  select record.payment_source,
         record.source_id,
         record.user_id,
         record.imported_at,
         record.reported_completed_lessons,
         lesson.id as lesson_id,
         lesson.duration_seconds,
         row_number() over (
           partition by record.payment_source, record.source_id
           order by lesson.position
         ) as lesson_number
  from public.legacy_import_records record
  join public.enrollments enrollment on enrollment.id = record.enrollment_id
  join public.lessons lesson on lesson.course_id = enrollment.course_id
), targets as (
  select * from ranked_legacy_lessons
  where lesson_number <= reported_completed_lessons
)
update public.lesson_progress progress
set legacy_completed = true,
    watched_ranges = case
      when progress.quiz_passed = false
       and progress.completed_at is null
       and progress.updated_at <= targets.imported_at + interval '5 minutes'
       and progress.watched_seconds = targets.duration_seconds
        then '[]'::jsonb
      else progress.watched_ranges
    end,
    watched_seconds = case
      when progress.quiz_passed = false
       and progress.completed_at is null
       and progress.updated_at <= targets.imported_at + interval '5 minutes'
       and progress.watched_seconds = targets.duration_seconds
        then 0
      else progress.watched_seconds
    end,
    video_completed = case
      when progress.quiz_passed = false
       and progress.completed_at is null
       and progress.updated_at <= targets.imported_at + interval '5 minutes'
       and progress.watched_seconds = targets.duration_seconds
        then false
      else progress.video_completed
    end
from targets
where progress.user_id = targets.user_id
  and progress.lesson_id = targets.lesson_id;

-- Backfill one actionable review per imported certificate reference. Conflict
-- handling makes this repeatable without resetting any human decision.
insert into public.legacy_certificate_reviews (
  payment_source, source_id, user_id, course_id, reported_status, created_at
)
select record.payment_source,
       record.source_id,
       record.user_id,
       enrollment.course_id,
       record.certificate_status,
       record.imported_at
from public.legacy_import_records record
join public.enrollments enrollment on enrollment.id = record.enrollment_id
where record.certificate_status <> 'none'
on conflict (payment_source, source_id) do nothing;

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
                or (progress.video_completed and progress.quiz_passed)
              )
          )
      )
  );
$$;

revoke execute on function public.lesson_is_unlocked(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.lesson_is_unlocked(uuid, uuid) to service_role;

-- Replace the importer for installations where 002 had already been applied.
create or replace function public.import_legacy_participant_batch(
  p_batch_id text,
  p_records jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  preflight jsonb;
  item jsonb;
  matched_profile public.profiles%rowtype;
  target_course_id uuid;
  created_order_id uuid;
  created_enrollment_id uuid;
  lesson_record record;
  source_value text;
  provider_value text;
  purchase_value timestamptz;
  imported integer := 0;
  skipped integer := 0;
  certificate_reviews integer := 0;
begin
  if nullif(trim(p_batch_id), '') is null or length(trim(p_batch_id)) > 160 then
    raise exception 'A non-empty batch ID of at most 160 characters is required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('legacy-participant-import', 0));
  preflight := public.preflight_legacy_participant_batch(p_records);
  if not (preflight ->> 'ready')::boolean then
    raise exception 'Legacy import preflight failed: %', preflight
      using errcode = '23514';
  end if;

  select id into target_course_id
  from public.courses
  where slug = 'online-schulung-wimpernverlaengerung';

  for item in select value from jsonb_array_elements(p_records)
  loop
    source_value := trim(item ->> 'sourceId');
    provider_value := lower(trim(item ->> 'paymentSource'));

    if exists (
      select 1 from public.legacy_import_records
      where payment_source = provider_value and source_id = source_value
    ) then
      skipped := skipped + 1;
      continue;
    end if;

    select * into strict matched_profile
    from public.profiles
    where lower(email) = lower(trim(item ->> 'email'));

    update public.profiles
    set first_name = case when trim(first_name) = '' then trim(item ->> 'firstName') else first_name end,
        last_name = case when trim(last_name) = '' then trim(item ->> 'lastName') else last_name end,
        certificate_name = coalesce(
          certificate_name,
          trim(item ->> 'firstName') || ' ' || trim(item ->> 'lastName')
        )
    where auth_user_id = matched_profile.auth_user_id;

    purchase_value := (item ->> 'purchaseDate')::timestamptz;
    insert into public.orders (
      user_id, course_id, stripe_price_id, amount_total, currency, payment_status,
      payment_source, paid_at, refunded_at, billing_snapshot
    ) values (
      matched_profile.auth_user_id,
      target_course_id,
      item ->> 'stripePriceId',
      nullif(item ->> 'amountMinor', '')::bigint,
      nullif(item ->> 'currency', ''),
      item ->> 'paymentStatus',
      provider_value,
      case when item ->> 'paymentStatus' in ('paid', 'refunded', 'disputed') then purchase_value end,
      null,
      jsonb_build_object(
        'legacyImport', true,
        'sourceId', source_value,
        'batchId', trim(p_batch_id),
        'sourceRow', (item ->> 'rowNumber')::integer
      )
    ) returning id into created_order_id;

    insert into public.enrollments (
      user_id, course_id, status, granted_at, revoked_at, order_id, access_type
    ) values (
      matched_profile.auth_user_id,
      target_course_id,
      item ->> 'courseAccess',
      case when item ->> 'courseAccess' in ('active', 'completed') then purchase_value end,
      null,
      created_order_id,
      case when provider_value = 'manual' then 'manual' else 'legacy' end
    ) returning id into created_enrollment_id;

    for lesson_record in
      select id
      from public.lessons
      where course_id = target_course_id
      order by position
      limit (item ->> 'completedLessons')::integer
    loop
      insert into public.lesson_progress (
        user_id, lesson_id, watched_ranges, watched_seconds,
        video_completed, quiz_passed, legacy_completed, completed_at
      ) values (
        matched_profile.auth_user_id,
        lesson_record.id,
        '[]'::jsonb,
        0,
        false,
        false,
        true,
        null
      );
    end loop;

    insert into public.legacy_import_records (
      payment_source, source_id, batch_id, source_row, user_id,
      order_id, enrollment_id, reported_completed_lessons, certificate_status
    ) values (
      provider_value,
      source_value,
      trim(p_batch_id),
      (item ->> 'rowNumber')::integer,
      matched_profile.auth_user_id,
      created_order_id,
      created_enrollment_id,
      (item ->> 'completedLessons')::smallint,
      item ->> 'certificateStatus'
    );

    if item ->> 'certificateStatus' <> 'none' then
      insert into public.legacy_certificate_reviews (
        payment_source, source_id, user_id, course_id, reported_status
      ) values (
        provider_value,
        source_value,
        matched_profile.auth_user_id,
        target_course_id,
        item ->> 'certificateStatus'
      );
      certificate_reviews := certificate_reviews + 1;
    end if;

    insert into public.audit_logs (
      actor_role, action, entity_type, entity_id, metadata
    ) values (
      'migration',
      'legacy_participant_import',
      'profile',
      matched_profile.auth_user_id::text,
      jsonb_build_object(
        'batchId', trim(p_batch_id),
        'sourceRow', (item ->> 'rowNumber')::integer,
        'sourceId', source_value,
        'paymentSource', provider_value,
        'reportedCompletedLessons', (item ->> 'completedLessons')::integer,
        'legacyCompletionImported', true,
        'playbackCompletionImported', false,
        'quizPassesImported', false,
        'certificateStatus', item ->> 'certificateStatus',
        'certificateReviewRequired', item ->> 'certificateStatus' <> 'none'
      )
    );
    imported := imported + 1;
  end loop;

  return jsonb_build_object(
    'imported', imported,
    'skipped', skipped,
    'certificateReviews', certificate_reviews
  );
end;
$$;

revoke execute on function public.import_legacy_participant_batch(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_legacy_participant_batch(text, jsonb)
  to service_role;

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

revoke execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text)
  to service_role;
grant execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid)
  to service_role;
grant execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text)
  to service_role;

-- Upgrade installations that had the original non-serialized limiter.
create or replace function public.consume_rate_limit(
  event_bucket text,
  event_subject_hash text,
  maximum_events integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  if nullif(trim(event_bucket), '') is null
     or nullif(trim(event_subject_hash), '') is null
     or maximum_events is null or maximum_events < 1
     or window_seconds is null or window_seconds < 1 then
    raise exception 'Invalid rate-limit configuration';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(jsonb_build_array(event_bucket, event_subject_hash)::text, 0)
  );
  delete from public.rate_limit_events
  where bucket = event_bucket
    and subject_hash = event_subject_hash
    and created_at < timezone('utc', now()) - make_interval(secs => window_seconds);

  select count(*) into current_count
  from public.rate_limit_events
  where bucket = event_bucket
    and subject_hash = event_subject_hash
    and created_at >= timezone('utc', now()) - make_interval(secs => window_seconds);

  if current_count >= maximum_events then
    return false;
  end if;

  insert into public.rate_limit_events(bucket, subject_hash)
  values (event_bucket, event_subject_hash);
  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer)
  to service_role;
