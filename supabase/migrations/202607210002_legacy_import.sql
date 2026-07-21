-- Transactional, service-role-only import path for verified legacy participants.
-- Account invitations intentionally happen in a separate preparation step: this
-- function either commits the complete business-data batch or no row at all.

create table public.legacy_import_records (
  payment_source text not null check (payment_source in ('stripe', 'paypal', 'manual', 'legacy')),
  source_id text not null check (length(trim(source_id)) between 1 and 160),
  batch_id text not null check (length(trim(batch_id)) between 1 and 160),
  source_row integer not null check (source_row >= 2),
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  enrollment_id uuid not null references public.enrollments(id) on delete restrict,
  reported_completed_lessons smallint not null,
  certificate_status text not null check (certificate_status in ('none', 'pending', 'valid', 'revoked')),
  imported_at timestamptz not null default timezone('utc', now()),
  primary key (payment_source, source_id),
  constraint legacy_import_completed_lessons_range
    check (reported_completed_lessons between 0 and 7)
);

alter table public.legacy_import_records enable row level security;
revoke all on table public.legacy_import_records from public, anon, authenticated;
grant all on table public.legacy_import_records to service_role;

-- A legacy certificate value is evidence to review, never a local certificate.
-- Only an explicit, audited admin decision may later map it to a real record or
-- produce a newly issued PDF from verified source evidence.
create table public.legacy_certificate_reviews (
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
  add column legacy_review_id uuid
  references public.legacy_certificate_reviews(id) on delete restrict;

create unique index certificates_one_active_legacy_review
  on public.certificates(legacy_review_id)
  where legacy_review_id is not null and status in ('replacing', 'valid');

create index legacy_certificate_reviews_queue_idx
  on public.legacy_certificate_reviews(review_status, created_at desc);
create index legacy_certificate_reviews_user_idx
  on public.legacy_certificate_reviews(user_id, created_at desc);

create trigger legacy_certificate_reviews_updated_at
before update on public.legacy_certificate_reviews
for each row execute function public.set_updated_at();

alter table public.legacy_certificate_reviews enable row level security;
revoke all on table public.legacy_certificate_reviews from public, anon, authenticated;
grant all on table public.legacy_certificate_reviews to service_role;

create or replace function public.preflight_legacy_participant_batch(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  matched_profile public.profiles%rowtype;
  imported_record public.legacy_import_records%rowtype;
  target_course_id uuid;
  issues jsonb := '[]'::jsonb;
  missing_accounts jsonb := '[]'::jsonb;
  already_imported integer := 0;
  candidates integer := 0;
  source_value text;
  provider_value text;
  email_value text;
  row_value integer;
begin
  if jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) < 1
     or jsonb_array_length(p_records) > 500 then
    raise exception 'Import batch must contain between 1 and 500 records'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_records) as entry(value)
    group by lower(trim(entry.value ->> 'paymentSource')), trim(entry.value ->> 'sourceId')
    having count(*) > 1
  ) then
    raise exception 'Import batch contains duplicate paymentSource/sourceId pairs'
      using errcode = '22023';
  end if;

  select id into target_course_id
  from public.courses
  where slug = 'online-schulung-wimpernverlaengerung';

  if target_course_id is null
     or (select count(*) from public.lessons where course_id = target_course_id) <> 7 then
    raise exception 'Target course with exactly seven lessons is unavailable';
  end if;

  for item in select value from jsonb_array_elements(p_records)
  loop
    source_value := nullif(trim(item ->> 'sourceId'), '');
    provider_value := lower(trim(item ->> 'paymentSource'));
    email_value := lower(trim(item ->> 'email'));
    row_value := (item ->> 'rowNumber')::integer;

    if source_value is null
       or provider_value not in ('stripe', 'paypal', 'manual', 'legacy')
       or email_value = ''
       or row_value < 2 then
      raise exception 'Malformed import record at source row %', row_value
        using errcode = '22023';
    end if;

    imported_record := null;
    select * into imported_record
    from public.legacy_import_records
    where payment_source = provider_value and source_id = source_value;

    matched_profile := null;
    select * into matched_profile
    from public.profiles
    where lower(email) = email_value;

    if imported_record.source_id is not null then
      if matched_profile.auth_user_id is null
         or imported_record.user_id <> matched_profile.auth_user_id then
        issues := issues || jsonb_build_array(jsonb_build_object(
          'rowNumber', row_value,
          'email', email_value,
          'code', 'source-already-linked',
          'message', 'Die globale Quellen-ID ist bereits einem anderen Konto zugeordnet.'
        ));
      else
        already_imported := already_imported + 1;
      end if;
      continue;
    end if;

    if matched_profile.auth_user_id is null then
      missing_accounts := missing_accounts || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value,
        'email', email_value
      ));
      continue;
    end if;

    candidates := candidates + 1;

    if nullif(trim(matched_profile.first_name), '') is not null
       and lower(trim(matched_profile.first_name)) <> lower(trim(item ->> 'firstName')) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'first-name-conflict',
        'message', 'Der vorhandene Vorname weicht von der Importquelle ab.'
      ));
    end if;
    if nullif(trim(matched_profile.last_name), '') is not null
       and lower(trim(matched_profile.last_name)) <> lower(trim(item ->> 'lastName')) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'last-name-conflict',
        'message', 'Der vorhandene Nachname weicht von der Importquelle ab.'
      ));
    end if;
    if matched_profile.certificate_name is not null
       and lower(trim(matched_profile.certificate_name)) <>
           lower(trim(item ->> 'firstName') || ' ' || trim(item ->> 'lastName')) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'certificate-name-conflict',
        'message', 'Der vorhandene Zertifikatsname weicht von der Importquelle ab.'
      ));
    end if;
    if exists (
      select 1 from public.enrollments
      where user_id = matched_profile.auth_user_id and course_id = target_course_id
    ) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'enrollment-conflict',
        'message', 'Für das Konto existiert bereits eine Kursteilnahme; sie wird nicht überschrieben.'
      ));
    end if;
    if exists (
      select 1
      from public.lesson_progress progress
      join public.lessons lesson on lesson.id = progress.lesson_id
      where progress.user_id = matched_profile.auth_user_id
        and lesson.course_id = target_course_id
    ) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'progress-conflict',
        'message', 'Für das Konto existiert bereits Lernfortschritt; er wird nicht überschrieben.'
      ));
    end if;
    if exists (
      select 1 from public.certificates where user_id = matched_profile.auth_user_id
    ) then
      issues := issues || jsonb_build_array(jsonb_build_object(
        'rowNumber', row_value, 'email', email_value, 'code', 'certificate-conflict',
        'message', 'Für das Konto existiert eine Zertifikatshistorie; eine manuelle Prüfung ist erforderlich.'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'ready', jsonb_array_length(issues) = 0 and jsonb_array_length(missing_accounts) = 0,
    'issues', issues,
    'missingAccounts', missing_accounts,
    'alreadyImported', already_imported,
    'candidates', candidates
  );
end;
$$;

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

  -- Serialize all legacy imports and re-run every conflict check inside the same
  -- transaction that performs the writes.
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

    -- Historic completion counts prove neither playback nor a saved 4/5 quiz
    -- attempt. Preserve them explicitly without fabricating either signal.
    for lesson_record in
      select id, duration_seconds
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
    if item ->> 'certificateStatus' <> 'none' then
      certificate_reviews := certificate_reviews + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'imported', imported,
    'skipped', skipped,
    'certificateReviews', certificate_reviews
  );
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

revoke execute on function public.preflight_legacy_participant_batch(jsonb)
  from public, anon, authenticated;
revoke execute on function public.import_legacy_participant_batch(text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.preflight_legacy_participant_batch(jsonb) to service_role;
grant execute on function public.import_legacy_participant_batch(text, jsonb) to service_role;
grant execute on function public.review_legacy_certificate_reference(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.map_legacy_certificate_reference(uuid, uuid, uuid) to service_role;
grant execute on function public.activate_legacy_certificate_reissue(uuid, uuid, uuid, text, text) to service_role;
