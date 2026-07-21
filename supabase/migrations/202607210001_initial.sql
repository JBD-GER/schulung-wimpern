-- Core schema for schulung-wimpernverlaengerung.de
-- Apply with `supabase db push`. All application-side privileged writes use the
-- service-role key; end users only receive the narrowly scoped RLS access below.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  certificate_name text,
  email text not null,
  phone text,
  billing_type text not null default 'private' check (billing_type in ('private', 'business')),
  company_name text,
  contact_person text,
  billing_address jsonb not null default '{}'::jsonb,
  tax_id text,
  certificate_public_name_consent boolean not null default false,
  email_verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_email_not_blank check (length(trim(email)) > 3),
  constraint profiles_certificate_name_length check (certificate_name is null or length(certificate_name) between 2 and 160)
);

create unique index profiles_email_lower_key on public.profiles (lower(email));

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'learner')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, role)
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  level text not null default 'Anfänger',
  version text not null default '2026.1' check (version ~ '^[0-9]{4}\.[0-9]+$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  total_learning_minutes integer not null check (total_learning_minutes > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  position smallint not null check (position between 1 and 99),
  slug text not null,
  section_title text,
  title text not null,
  description text not null default '',
  duration_seconds integer not null check (duration_seconds > 0),
  stream_video_uid text,
  watch_threshold numeric(4,3) not null default 0.900 check (watch_threshold > 0 and watch_threshold <= 1),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (course_id, position),
  unique (course_id, slug)
);

create table public.lesson_materials (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  title text not null,
  file_key text not null,
  mime_type text not null,
  position smallint not null default 1 check (position > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (lesson_id, position)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  stripe_checkout_session_id text unique,
  superseded_checkout_session_id text,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_invoice_id text,
  stripe_price_id text not null,
  amount_total bigint check (amount_total is null or amount_total >= 0),
  currency text check (currency is null or currency ~ '^[a-zA-Z]{3}$'),
  tax_amount bigint check (tax_amount is null or tax_amount >= 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'processing', 'paid', 'failed', 'expired', 'refunded', 'disputed')),
  business_purchase boolean not null default false,
  billing_snapshot jsonb not null default '{}'::jsonb,
  payment_source text not null default 'stripe' check (payment_source in ('stripe', 'paypal', 'manual', 'legacy')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz,
  refunded_at timestamptz
);

create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index orders_superseded_session_idx
  on public.orders(superseded_checkout_session_id)
  where superseded_checkout_session_id is not null;

create table public.checkout_customer_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lease_token uuid not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'completed', 'revoked', 'refunded', 'disputed')),
  granted_at timestamptz,
  revoked_at timestamptz,
  order_id uuid references public.orders(id) on delete set null,
  access_type text not null default 'purchase' check (access_type in ('purchase', 'manual', 'legacy')),
  completed_course_version text check (
    completed_course_version is null or completed_course_version ~ '^[0-9]{4}\.[0-9]+$'
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index enrollments_one_current_per_course
  on public.enrollments(user_id, course_id)
  where status in ('pending_payment', 'active', 'completed');
create index enrollments_user_idx on public.enrollments(user_id, status);

create table public.course_completion_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_version text not null check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  completed_at timestamptz not null default timezone('utc', now()),
  unique (user_id, course_id, course_version),
  unique (id, user_id, course_id, course_version)
);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_version text check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$'),
  watched_ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(watched_ranges) = 'array'),
  watched_seconds integer not null default 0 check (watched_seconds >= 0),
  video_completed boolean not null default false,
  quiz_passed boolean not null default false,
  legacy_completed boolean not null default false,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, lesson_id)
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  question_text text not null,
  editorial_note text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (lesson_id, position),
  constraint quiz_question_approval_metadata check (
    (status = 'approved' and approved_at is not null and approved_by is not null)
    or status <> 'approved'
  )
);

create table public.quiz_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  position smallint not null check (position between 1 and 4),
  created_at timestamptz not null default timezone('utc', now()),
  unique (question_id, position)
);

create unique index quiz_options_one_correct
  on public.quiz_options(question_id)
  where is_correct;

create table public.quiz_question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  version integer not null check (version > 0),
  question_text text not null,
  editorial_note text,
  status text not null,
  options_snapshot jsonb not null check (jsonb_typeof(options_snapshot) = 'array'),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (question_id, version)
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  course_version text check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$'),
  started_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz,
  score smallint check (score between 0 and 5),
  passed boolean,
  attempt_number integer not null check (attempt_number > 0),
  question_order uuid[] not null,
  option_order jsonb not null check (jsonb_typeof(option_order) = 'object'),
  answer_key jsonb not null check (jsonb_typeof(answer_key) = 'object'),
  submission_token uuid not null default gen_random_uuid(),
  unique (user_id, lesson_id, attempt_number),
  unique (submission_token),
  constraint quiz_attempt_submission_consistent check (
    (submitted_at is null and score is null and passed is null)
    or (submitted_at is not null and score is not null and passed is not null)
  )
);

create index quiz_attempts_user_lesson_idx on public.quiz_attempts(user_id, lesson_id, started_at desc);

create table public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete restrict,
  selected_option_id uuid not null references public.quiz_options(id) on delete restrict,
  is_correct_snapshot boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, question_id)
);

create table public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  certificate_number text not null unique,
  course_version text not null check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  participant_name text not null,
  file_key text not null,
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  completion_snapshot_id uuid references public.course_completion_snapshots(id) on delete restrict,
  replaces_certificate_id uuid references public.certificates(id) on delete restrict,
  issued_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz,
  status text not null default 'valid' check (status in ('generating', 'replacing', 'valid', 'revoked', 'failed', 'archived')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (completion_snapshot_id, user_id, course_id, course_version)
    references public.course_completion_snapshots(id, user_id, course_id, course_version)
    on delete restrict
);

create unique index certificates_one_current_version
  on public.certificates(user_id, course_id, course_version)
  where status in ('generating', 'valid');

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  recipient_email text not null,
  template text not null,
  event_key text not null unique,
  provider_message_id text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed', 'ignored')),
  payload_hash text not null,
  error_message text,
  unique (provider, external_event_id)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_logs_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved', 'spam')),
  created_at timestamptz not null default timezone('utc', now())
);

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  subject_hash text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index rate_limit_events_lookup_idx on public.rate_limit_events(bucket, subject_hash, created_at desc);

create table public.video_access_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_version text check (course_version is null or course_version ~ '^[0-9]{4}\.[0-9]+$'),
  issued_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  watched_seconds_at_start integer not null default 0 check (watched_seconds_at_start >= 0),
  reported_seconds integer not null default 0 check (reported_seconds >= 0),
  last_reported_at timestamptz,
  last_position numeric,
  revoked_at timestamptz,
  constraint video_session_expiry check (expires_at > issued_at)
);

create index video_access_sessions_lookup_idx
  on public.video_access_sessions(user_id, lesson_id, issued_at desc);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  consent_type text not null,
  consent_version text not null,
  granted boolean not null,
  proof jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint consent_subject_present check (user_id is not null or anonymous_id is not null)
);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  request_type text not null check (request_type in ('export', 'deletion', 'correction')),
  status text not null default 'requested' check (status in ('requested', 'verified', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create unique index data_requests_one_open_kind_idx
  on public.data_requests(user_id, request_type)
  where status in ('requested', 'verified', 'processing');
create index data_requests_open_queue_idx
  on public.data_requests(status, requested_at)
  where status in ('requested', 'verified', 'processing');

create table public.auth_recovery_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce_hash text not null unique check (nonce_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint auth_recovery_expiry check (expires_at > created_at)
);

create table public.auth_session_registry (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_agent text,
  ip_hash text,
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  revoked_at timestamptz
);

create index auth_session_registry_user_idx
  on public.auth_session_registry(user_id, last_seen_at desc);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(auth_user_id, first_name, last_name, certificate_name, email, email_verified_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'certificate_name', ''),
    new.email,
    new.email_confirmed_at
  )
  on conflict (auth_user_id) do update
    set email = excluded.email,
        email_verified_at = excluded.email_verified_at,
        updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.validate_approved_quiz_question()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  option_count integer;
  correct_count integer;
begin
  if new.status = 'approved' then
    select count(*), count(*) filter (where is_correct)
      into option_count, correct_count
      from public.quiz_options
      where question_id = new.id;
    if option_count <> 4 or correct_count <> 1 then
      raise exception 'Approved questions require exactly four options and one correct option';
    end if;
  end if;
  return new;
end;
$$;

create trigger quiz_question_approval_guard
before insert or update of status on public.quiz_questions
for each row execute function public.validate_approved_quiz_question();

create or replace function public.guard_approved_quiz_options()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_status text;
begin
  if tg_op = 'UPDATE' and old.question_id <> new.question_id then
    raise exception 'Quiz options cannot be moved between questions';
  end if;
  if tg_op = 'DELETE' then
    select status into parent_status
    from public.quiz_questions
    where id = old.question_id;
  else
    select status into parent_status
    from public.quiz_questions
    where id = new.question_id;
  end if;
  if parent_status = 'approved' then
    raise exception 'Move the question back to draft before changing approved answer options';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger quiz_options_approval_guard
before insert or update or delete on public.quiz_options
for each row execute function public.guard_approved_quiz_options();

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = check_user_id and role = 'admin'
      and check_user_id = auth.uid()
  );
$$;

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

create or replace function public.assert_course_quiz_publishable(check_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) = 7
       and count(*) filter (where status = 'published' and nullif(trim(stream_video_uid), '') is not null) = 7
       and count(distinct stream_video_uid) filter (
         where status = 'published' and nullif(trim(stream_video_uid), '') is not null
       ) = 7
     from public.lessons where course_id = check_course_id)
    and
    (select count(*) = 35
       and count(*) filter (where question.status = 'approved') = 35
       and count(distinct question.lesson_id) = 7
     from public.quiz_questions question
     join public.lessons lesson on lesson.id = question.lesson_id
     where lesson.course_id = check_course_id);
$$;

create or replace function public.reorder_course_lessons(
  target_course_id uuid,
  ordered_lesson_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_id uuid;
  target_position integer := 0;
  affected integer;
begin
  if cardinality(ordered_lesson_ids) <> 7
     or (select count(distinct item) from unnest(ordered_lesson_ids) item) <> 7
     or (select count(*) from public.lessons where course_id = target_course_id and id = any(ordered_lesson_ids)) <> 7
     or (select count(*) from public.lessons where course_id = target_course_id) <> 7 then
    raise exception 'Course ordering must contain exactly its seven lessons' using errcode = '22023';
  end if;

  update public.lessons set position = position + 50 where course_id = target_course_id;
  foreach lesson_id in array ordered_lesson_ids loop
    target_position := target_position + 1;
    update public.lessons
    set position = target_position
    where id = lesson_id and course_id = target_course_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Course lesson changed concurrently' using errcode = '40001';
    end if;
  end loop;
end;
$$;

create or replace function public.list_admin_participants(
  search_text text,
  requested_status text,
  page_offset integer,
  page_limit integer
)
returns table(
  participant_id uuid,
  first_name text,
  last_name text,
  email text,
  participant_created_at timestamptz,
  enrollment_status text,
  enrollment_granted_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with latest_enrollment as (
    select distinct on (user_id) user_id, status, granted_at
    from public.enrollments
    order by user_id, created_at desc
  ), filtered as (
    select profile.auth_user_id,
           profile.first_name,
           profile.last_name,
           profile.email,
           profile.created_at,
           enrollment.status,
           enrollment.granted_at
    from public.profiles profile
    left join latest_enrollment enrollment on enrollment.user_id = profile.auth_user_id
    where (requested_status is null or enrollment.status = requested_status)
      and (
        nullif(trim(search_text), '') is null
        or profile.first_name ilike '%' || search_text || '%'
        or profile.last_name ilike '%' || search_text || '%'
        or profile.email ilike '%' || search_text || '%'
      )
  )
  select auth_user_id,
         first_name,
         last_name,
         email,
         created_at,
         status,
         granted_at,
         count(*) over ()
  from filtered
  order by created_at desc
  offset greatest(page_offset, 0)
  limit least(greatest(page_limit, 1), 100);
$$;

create or replace function public.update_course_content(
  editing_admin_id uuid,
  target_course_id uuid,
  new_course_title text,
  new_course_description text,
  new_course_version text,
  new_course_status text,
  new_lessons jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_row public.courses%rowtype;
  lesson_item jsonb;
  target_position integer;
  lesson_status text;
  lesson_video_uid text;
  affected integer;
begin
  if new_course_status not in ('draft', 'published')
     or new_course_version !~ '^[0-9]{4}\.[0-9]+$'
     or length(trim(coalesce(new_course_title, ''))) < 5
     or length(new_course_title) > 200
     or length(trim(coalesce(new_course_description, ''))) < 10
     or length(new_course_description) > 5000
     or new_lessons is null
     or jsonb_typeof(new_lessons) <> 'array'
     or jsonb_array_length(new_lessons) <> 7
     or (select count(distinct value ->> 'id') from jsonb_array_elements(new_lessons)) <> 7 then
    raise exception 'Course content is invalid' using errcode = '22023';
  end if;

  select * into strict course_row
  from public.courses
  where id = target_course_id
  for update;

  if (select count(*)
      from jsonb_array_elements(new_lessons) item
      join public.lessons lesson
        on lesson.id = (item.value ->> 'id')::uuid and lesson.course_id = target_course_id) <> 7
     or (select count(*) from public.lessons where course_id = target_course_id) <> 7 then
    raise exception 'Course lessons do not match' using errcode = '22023';
  end if;

  update public.courses set status = 'draft' where id = target_course_id;
  update public.lessons set position = position + 50 where course_id = target_course_id;

  for lesson_item, target_position in
    select value, ordinality::integer
    from jsonb_array_elements(new_lessons) with ordinality
  loop
    lesson_status := lesson_item ->> 'status';
    lesson_video_uid := nullif(trim(lesson_item ->> 'streamVideoUid'), '');
    if lesson_status not in ('draft', 'published')
       or length(trim(coalesce(lesson_item ->> 'title', ''))) < 3
       or length(lesson_item ->> 'title') > 240
       or length(coalesce(lesson_item ->> 'description', '')) > 5000
       or (lesson_item ->> 'durationSeconds')::integer < 1
       or (lesson_item ->> 'durationSeconds')::integer > 28800
       or (lesson_status = 'published' and lesson_video_uid is null) then
      raise exception 'Lesson content is invalid' using errcode = '22023';
    end if;

    update public.lessons
    set position = target_position,
        title = trim(lesson_item ->> 'title'),
        description = coalesce(lesson_item ->> 'description', ''),
        duration_seconds = (lesson_item ->> 'durationSeconds')::integer,
        stream_video_uid = lesson_video_uid,
        status = lesson_status
    where id = (lesson_item ->> 'id')::uuid and course_id = target_course_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Course lesson changed concurrently' using errcode = '40001';
    end if;
  end loop;

  if new_course_status = 'published' and not public.assert_course_quiz_publishable(target_course_id) then
    raise exception 'Course is not publishable' using errcode = '23514';
  end if;

  update public.courses
  set title = trim(new_course_title),
      description = trim(new_course_description),
      version = new_course_version,
      status = new_course_status
  where id = target_course_id;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    'course_updated',
    'course',
    target_course_id::text,
    jsonb_build_object(
      'status', new_course_status,
      'version', new_course_version,
      'lessonOrder', (select jsonb_agg(value ->> 'id' order by ordinality)
                      from jsonb_array_elements(new_lessons) with ordinality)
    )
  );
end;
$$;

create or replace function public.reorder_lesson_materials(
  target_lesson_id uuid,
  ordered_material_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  material_id uuid;
  target_position integer := 0;
  affected integer;
begin
  if cardinality(ordered_material_ids) < 1
     or (select count(distinct item) from unnest(ordered_material_ids) item) <> cardinality(ordered_material_ids)
     or (select count(*) from public.lesson_materials where lesson_id = target_lesson_id and id = any(ordered_material_ids)) <> cardinality(ordered_material_ids)
     or (select count(*) from public.lesson_materials where lesson_id = target_lesson_id) <> cardinality(ordered_material_ids) then
    raise exception 'Material ordering must contain every lesson material' using errcode = '22023';
  end if;

  update public.lesson_materials set position = position + 1000 where lesson_id = target_lesson_id;
  foreach material_id in array ordered_material_ids loop
    target_position := target_position + 1;
    update public.lesson_materials
    set position = target_position
    where id = material_id and lesson_id = target_lesson_id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Lesson material changed concurrently' using errcode = '40001';
    end if;
  end loop;
end;
$$;

create or replace function public.update_quiz_question_content(
  editing_admin_id uuid,
  target_question_id uuid,
  new_question_text text,
  new_editorial_note text,
  new_status text,
  new_options jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  question public.quiz_questions%rowtype;
  option_item jsonb;
  option_id uuid;
  next_version integer;
  affected integer;
begin
  if new_status not in ('draft', 'approved')
     or length(trim(coalesce(new_question_text, ''))) < 5
     or length(new_question_text) > 1000
     or new_options is null
     or jsonb_typeof(new_options) <> 'array'
     or jsonb_array_length(new_options) <> 4
     or (select count(distinct value ->> 'id') from jsonb_array_elements(new_options)) <> 4
     or (select count(*) from jsonb_array_elements(new_options)
         where jsonb_typeof(value -> 'isCorrect') = 'boolean' and (value ->> 'isCorrect')::boolean) <> 1
     or exists (select 1 from jsonb_array_elements(new_options)
                where jsonb_typeof(value -> 'isCorrect') is distinct from 'boolean'
                   or length(trim(coalesce(value ->> 'text', ''))) < 1
                   or length(value ->> 'text') > 1000) then
    raise exception 'Quiz question input is invalid' using errcode = '22023';
  end if;

  select * into strict question
  from public.quiz_questions
  where id = target_question_id
  for update;

  if (select count(*)
      from jsonb_array_elements(new_options) item
      join public.quiz_options option
        on option.id = (item.value ->> 'id')::uuid and option.question_id = question.id) <> 4 then
    raise exception 'Quiz options do not belong to the question' using errcode = '22023';
  end if;

  insert into public.quiz_question_versions(
    question_id, version, question_text, editorial_note, status, options_snapshot, changed_by
  )
  select question.id, question.version, question.question_text, question.editorial_note, question.status,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', option.id,
           'text', option.option_text,
           'isCorrect', option.is_correct,
           'position', option.position
         ) order by option.position), '[]'::jsonb),
         editing_admin_id
  from public.quiz_options option
  where option.question_id = question.id;

  next_version := question.version + 1;
  update public.quiz_questions
  set question_text = trim(new_question_text),
      editorial_note = nullif(trim(new_editorial_note), ''),
      status = 'draft',
      approved_at = null,
      approved_by = null,
      version = next_version
  where id = question.id;

  update public.quiz_options set is_correct = false where question_id = question.id;
  for option_item in select value from jsonb_array_elements(new_options) loop
    option_id := (option_item ->> 'id')::uuid;
    update public.quiz_options
    set option_text = trim(option_item ->> 'text'),
        is_correct = (option_item ->> 'isCorrect')::boolean
    where id = option_id and question_id = question.id;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Quiz option changed concurrently' using errcode = '40001';
    end if;
  end loop;

  if new_status = 'approved' then
    update public.quiz_questions
    set status = 'approved', approved_at = timezone('utc', now()), approved_by = editing_admin_id
    where id = question.id;
  end if;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    case when new_status = 'approved' then 'quiz_question_approved' else 'quiz_question_updated' end,
    'quiz_question',
    question.id::text,
    jsonb_build_object('status', new_status, 'version', next_version)
  );
  return next_version;
end;
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

create or replace function public.set_admin_course_access(
  editing_admin_id uuid,
  target_user_id uuid,
  target_course_id uuid,
  requested_status text
)
returns table(enrollment_id uuid, resulting_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.enrollments%rowtype;
  changed_id uuid;
begin
  if requested_status not in ('active', 'revoked') then
    raise exception 'Invalid enrollment status' using errcode = '22023';
  end if;

  select * into existing
  from public.enrollments
  where user_id = target_user_id and course_id = target_course_id
  order by created_at desc
  limit 1
  for update;

  if requested_status = 'active' then
    if existing.id is not null and existing.status in ('active', 'completed', 'pending_payment') then
      raise exception 'Enrollment cannot be activated from its current state' using errcode = '23514';
    elsif existing.id is not null and existing.status = 'revoked' then
      update public.enrollments
      set status = 'active',
          granted_at = coalesce(granted_at, timezone('utc', now())),
          revoked_at = null
      where id = existing.id and status = 'revoked'
      returning id into changed_id;
    else
      insert into public.enrollments(user_id, course_id, status, granted_at, access_type)
      values (target_user_id, target_course_id, 'active', timezone('utc', now()), 'manual')
      returning id into changed_id;
    end if;
  else
    if existing.id is null or existing.status not in ('active', 'completed', 'pending_payment') then
      raise exception 'No active enrollment can be revoked' using errcode = '23514';
    end if;
    update public.enrollments
    set status = 'revoked', revoked_at = timezone('utc', now())
    where id = existing.id and status = existing.status
    returning id into changed_id;
  end if;

  if changed_id is null then
    raise exception 'Enrollment changed concurrently' using errcode = '40001';
  end if;

  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    case when requested_status = 'active' then 'enrollment_granted' else 'enrollment_revoked' end,
    'user',
    target_user_id::text,
    jsonb_build_object(
      'courseId', target_course_id,
      'enrollmentId', changed_id,
      'previousStatus', existing.status,
      'preservedOrderId', existing.order_id,
      'preservedAccessType', existing.access_type
    )
  );

  return query select changed_id, requested_status;
end;
$$;

create or replace function public.revoke_certificate_with_audit(
  editing_admin_id uuid,
  target_certificate_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  certificate public.certificates%rowtype;
begin
  select * into strict certificate
  from public.certificates
  where id = target_certificate_id
  for update;
  if certificate.status <> 'valid' then
    raise exception 'Only a valid certificate can be revoked' using errcode = '23514';
  end if;
  update public.certificates
  set status = 'revoked', revoked_at = timezone('utc', now())
  where id = certificate.id and status = 'valid';
  if not found then
    raise exception 'Certificate changed concurrently' using errcode = '40001';
  end if;
  insert into public.audit_logs(actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    editing_admin_id,
    'admin',
    'certificate_revoked',
    'certificate',
    certificate.id::text,
    jsonb_build_object('certificateNumber', certificate.certificate_number)
  );
  return certificate.id;
end;
$$;

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

  -- Serialize the whole cleanup/count/insert decision for this exact key.
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

create or replace function public.observe_auth_session(
  observed_session_id text,
  observed_user_id uuid,
  observed_user_agent text,
  observed_ip_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if length(observed_session_id) < 8 or length(observed_session_id) > 200 then
    raise exception 'Invalid auth session identifier' using errcode = '22023';
  end if;
  insert into public.auth_session_registry(session_id, user_id, user_agent, ip_hash)
  values (
    observed_session_id,
    observed_user_id,
    left(observed_user_agent, 500),
    observed_ip_hash
  )
  on conflict (session_id) do update set
    user_agent = excluded.user_agent,
    ip_hash = excluded.ip_hash,
    last_seen_at = timezone('utc', now())
  where public.auth_session_registry.user_id = excluded.user_id;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Auth session belongs to another user' using errcode = '42501';
  end if;
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

create or replace function public.revoke_order_access(
  target_order_id uuid,
  new_payment_status text,
  new_enrollment_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_payment_status not in ('refunded', 'disputed')
     or new_enrollment_status not in ('refunded', 'disputed', 'revoked') then
    raise exception 'Invalid revocation status';
  end if;

  update public.orders
  set payment_status = new_payment_status,
      refunded_at = case when new_payment_status = 'refunded' then coalesce(refunded_at, timezone('utc', now())) else refunded_at end
  where id = target_order_id;

  update public.enrollments
  set status = new_enrollment_status,
      revoked_at = coalesce(revoked_at, timezone('utc', now()))
  where order_id = target_order_id
    and status in ('pending_payment', 'active', 'completed')
    and not exists (
      select 1 from public.orders other_order
      where other_order.user_id = public.enrollments.user_id
        and other_order.id <> target_order_id
        and other_order.payment_status = 'paid'
    );
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

create or replace function public.claim_email_delivery(
  delivery_user_id uuid,
  delivery_recipient text,
  delivery_template text,
  delivery_event_key text
)
returns table(delivery_id uuid, claimed boolean, delivery_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_delivery public.email_deliveries%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(delivery_event_key, 0));
  insert into public.email_deliveries(user_id, recipient_email, template, event_key, status)
  values (delivery_user_id, delivery_recipient, delivery_template, delivery_event_key, 'pending')
  on conflict (event_key) do nothing;

  select * into strict target_delivery
  from public.email_deliveries
  where event_key = delivery_event_key
  for update;

  if target_delivery.status = 'sent'
     or (target_delivery.status = 'sending'
         and target_delivery.updated_at > timezone('utc', now()) - interval '10 minutes') then
    return query select target_delivery.id, false, target_delivery.status;
    return;
  end if;

  update public.email_deliveries
  set status = 'sending', error_message = null
  where id = target_delivery.id;
  return query select target_delivery.id, true, 'sending'::text;
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

create or replace function public.consume_recovery_proof(
  proof_user_id uuid,
  proof_nonce_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed_count integer;
begin
  update public.auth_recovery_proofs
  set consumed_at = timezone('utc', now())
  where user_id = proof_user_id
    and nonce_hash = proof_nonce_hash
    and consumed_at is null
    and expires_at > timezone('utc', now());
  get diagnostics consumed_count = row_count;
  return consumed_count = 1;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger lessons_updated_at before update on public.lessons for each row execute function public.set_updated_at();
create trigger lesson_materials_updated_at before update on public.lesson_materials for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger enrollments_updated_at before update on public.enrollments for each row execute function public.set_updated_at();
create trigger progress_updated_at before update on public.lesson_progress for each row execute function public.set_updated_at();
create trigger questions_updated_at before update on public.quiz_questions for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.stripe_customers for each row execute function public.set_updated_at();
create trigger certificates_updated_at before update on public.certificates for each row execute function public.set_updated_at();
create trigger email_deliveries_updated_at before update on public.email_deliveries for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.orders enable row level security;
alter table public.enrollments enable row level security;
alter table public.course_completion_snapshots enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_options enable row level security;
alter table public.quiz_question_versions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_responses enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.checkout_customer_leases enable row level security;
alter table public.certificates enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.contact_messages enable row level security;
alter table public.rate_limit_events enable row level security;
alter table public.video_access_sessions enable row level security;
alter table public.consent_records enable row level security;
alter table public.data_requests enable row level security;
alter table public.auth_recovery_proofs enable row level security;
alter table public.auth_session_registry enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using (auth_user_id = auth.uid() or public.is_admin());
create policy roles_select_own on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy courses_public_select on public.courses for select to anon, authenticated using (status = 'published' or public.is_admin());
create policy orders_select_own on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy enrollments_select_own on public.enrollments for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy progress_select_own on public.lesson_progress for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy certificates_select_own on public.certificates for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy consent_select_own on public.consent_records for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy data_requests_select_own on public.data_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Correct-answer and response tables intentionally have no learner policies.
revoke all on table public.quiz_questions, public.quiz_options, public.quiz_question_versions, public.quiz_responses from anon, authenticated;
revoke all on table public.webhook_events, public.audit_logs, public.email_deliveries,
  public.contact_messages, public.rate_limit_events, public.video_access_sessions,
  public.stripe_customers, public.checkout_customer_leases,
  public.course_completion_snapshots, public.auth_recovery_proofs,
  public.auth_session_registry from public, anon, authenticated;

grant select on public.courses to anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.user_roles, public.orders, public.enrollments,
  public.lesson_progress, public.certificates, public.consent_records,
  public.data_requests to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
revoke execute on function public.lesson_is_unlocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.assert_course_quiz_publishable(uuid) from public, anon, authenticated;
revoke execute on function public.reorder_course_lessons(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.list_admin_participants(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.update_course_content(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.reorder_lesson_materials(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.update_quiz_question_content(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.certificate_evidence_eligibility(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.certificate_eligibility(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_course_completion_snapshot(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.activate_certificate_reissue(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.set_admin_course_access(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.revoke_certificate_with_audit(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.observe_auth_session(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fulfill_stripe_order(uuid, uuid, text, text, text, text, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke execute on function public.bind_and_revoke_stripe_order(uuid, uuid, uuid, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.revoke_order_access(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.submit_quiz_attempt(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.record_video_progress(uuid, uuid, uuid, jsonb, integer, numeric) from public, anon, authenticated;
revoke execute on function public.claim_email_delivery(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_checkout_order(uuid, uuid, text, text, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.confirm_checkout_session_rotation(uuid, text) from public, anon, authenticated;
revoke execute on function public.acquire_checkout_customer_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_checkout_customer_lease(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.update_checkout_profile_under_lease(uuid, uuid, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.consume_recovery_proof(uuid, text) from public, anon, authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Private certificate and course-material buckets. These inserts are harmless on re-run.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('certificates', 'certificates', false, 10485760, array['application/pdf']),
  ('course-materials', 'course-materials', false, 52428800, null)
on conflict (id) do update set public = false;

-- No storage.objects policies are created: files are accessed only through checked
-- server routes or short-lived signed URLs created with the service-role client.
