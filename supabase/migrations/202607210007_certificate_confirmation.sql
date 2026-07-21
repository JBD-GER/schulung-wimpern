-- Native certificates are created only after the learner has explicitly
-- confirmed the exact printed name. The confirmation is immutable evidence
-- and is bound to the durable course-completion snapshot.

begin;

alter table public.profiles
  add column certificate_identity_version uuid not null default gen_random_uuid();
alter table public.profiles
  add constraint profiles_certificate_identity_version_key
  unique (auth_user_id, certificate_identity_version);

create table public.certificate_issuance_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_version text not null check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  completion_snapshot_id uuid not null,
  profile_identity_version uuid not null,
  participant_name text not null check (
    participant_name = trim(participant_name)
    and length(participant_name) between 2 and 160
    and participant_name !~ '[[:cntrl:]]'
  ),
  confirmation_source text not null default 'learner' check (
    confirmation_source in ('learner', 'migration_finalized_certificate')
  ),
  confirmed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, course_id),
  unique (completion_snapshot_id),
  unique (
    id,
    user_id,
    course_id,
    course_version,
    completion_snapshot_id
  ),
  foreign key (
    completion_snapshot_id,
    user_id,
    course_id,
    course_version
  ) references public.course_completion_snapshots(
    id,
    user_id,
    course_id,
    course_version
  ) on delete restrict,
  foreign key (
    user_id,
    profile_identity_version
  ) references public.profiles(
    auth_user_id,
    certificate_identity_version
  ) on update restrict on delete restrict
);

comment on table public.certificate_issuance_confirmations is
  'Immutable name evidence for the single native certificate issuance, with explicit learner or migration provenance.';

alter table public.certificates
  add column issuance_confirmation_id uuid;

-- A confirmation is the authority for exactly one physical certificate row.
-- PostgreSQL unique constraints still permit multiple NULL values, so legacy
-- certificates without a native confirmation remain unaffected.
alter table public.certificates
  add constraint certificates_issuance_confirmation_id_key
  unique (issuance_confirmation_id);

alter table public.certificates
  add constraint certificates_issuance_confirmation_identity_fkey
  foreign key (
    issuance_confirmation_id,
    user_id,
    course_id,
    course_version,
    completion_snapshot_id
  ) references public.certificate_issuance_confirmations(
    id,
    user_id,
    course_id,
    course_version,
    completion_snapshot_id
  ) on delete restrict;

-- Certificates that were already finalized are historic evidence. Backfill
-- their immutable printed name for compatibility, but record the provenance
-- as a migration inference rather than pretending the learner confirmed it.
with source as (
  select distinct on (certificate.user_id, certificate.course_id)
    certificate.user_id,
    certificate.course_id,
    certificate.course_version,
    certificate.completion_snapshot_id,
    profile.certificate_identity_version as profile_identity_version,
    trim(certificate.participant_name) as participant_name,
    certificate.issued_at as confirmed_at
  from public.certificates certificate
  join public.profiles profile
    on profile.auth_user_id = certificate.user_id
  where certificate.completion_snapshot_id is not null
    and certificate.legacy_review_id is null
    and certificate.replaces_certificate_id is null
    and certificate.status in ('valid', 'revoked', 'archived')
  order by certificate.user_id,
           certificate.course_id,
           certificate.issued_at,
           certificate.id
), inserted as (
  insert into public.certificate_issuance_confirmations (
    user_id,
    course_id,
    course_version,
    completion_snapshot_id,
    profile_identity_version,
    participant_name,
    confirmation_source,
    confirmed_at
  )
  select user_id,
         course_id,
         course_version,
         completion_snapshot_id,
         profile_identity_version,
         participant_name,
         'migration_finalized_certificate',
         confirmed_at
  from source
  on conflict do nothing
  returning id,
            user_id,
            course_id,
            course_version,
            completion_snapshot_id
), audited as (
  insert into public.audit_logs (
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  )
  select 'migration',
         'finalized_certificate_confirmation_backfilled',
         'certificate_issuance_confirmation',
         inserted.id::text,
         jsonb_build_object(
           'migration', '202607210007',
           'source', 'finalized_certificate',
           'courseId', inserted.course_id,
           'courseVersion', inserted.course_version,
           'completionSnapshotId', inserted.completion_snapshot_id,
           'learnerConfirmation', false
         )
  from inserted
  returning id
)
update public.certificates certificate
set issuance_confirmation_id = confirmation.id
from public.certificate_issuance_confirmations confirmation
where certificate.completion_snapshot_id is not null
  and certificate.legacy_review_id is null
  and certificate.replaces_certificate_id is null
  and certificate.user_id = confirmation.user_id
  and certificate.course_id = confirmation.course_id
  and certificate.course_version = confirmation.course_version
  and certificate.completion_snapshot_id = confirmation.completion_snapshot_id
  and certificate.participant_name = confirmation.participant_name;

create or replace function public.freeze_certificate_issuance_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Certificate issuance confirmations cannot be deleted'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new is distinct from old then
    raise exception 'Certificate issuance confirmations are immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger certificate_issuance_confirmations_freeze
before update or delete on public.certificate_issuance_confirmations
for each row execute function public.freeze_certificate_issuance_confirmation();

create or replace function public.rotate_profile_certificate_identity_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_effective_identity text;
  new_effective_identity text;
begin
  -- certificate_name is the printed identity whenever it contains anything
  -- but whitespace. Otherwise the normalized first/last-name combination is
  -- printed. Changes to shadowed profile fields must remain possible after a
  -- confirmation; only a change to the effective printed identity rotates the
  -- version guarded by the confirmation FK.
  old_effective_identity := coalesce(
    nullif(
      regexp_replace(trim(coalesce(old.certificate_name, '')), '\s+', ' ', 'g'),
      ''
    ),
    regexp_replace(
      trim(concat_ws(' ', old.first_name, old.last_name)),
      '\s+',
      ' ',
      'g'
    )
  );
  new_effective_identity := coalesce(
    nullif(
      regexp_replace(trim(coalesce(new.certificate_name, '')), '\s+', ' ', 'g'),
      ''
    ),
    regexp_replace(
      trim(concat_ws(' ', new.first_name, new.last_name)),
      '\s+',
      ' ',
      'g'
    )
  );

  if new_effective_identity is distinct from old_effective_identity then
    new.certificate_identity_version := gen_random_uuid();
  end if;
  return new;
end;
$$;

create trigger profiles_rotate_certificate_identity_version
before update of first_name, last_name, certificate_name on public.profiles
for each row execute function public.rotate_profile_certificate_identity_version();

create or replace function public.validate_certificate_confirmation_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  confirmation public.certificate_issuance_confirmations%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.status in ('valid', 'revoked', 'archived')
     and new.issuance_confirmation_id is distinct from old.issuance_confirmation_id then
    raise exception 'Finalized certificate confirmation cannot be changed'
      using errcode = '23514';
  end if;

  if new.issuance_confirmation_id is not null then
    select * into confirmation
    from public.certificate_issuance_confirmations
    where id = new.issuance_confirmation_id;
    if confirmation.id is null
       or confirmation.user_id <> new.user_id
       or confirmation.course_id <> new.course_id
       or confirmation.course_version <> new.course_version
       or confirmation.completion_snapshot_id <> new.completion_snapshot_id
       or confirmation.participant_name <> new.participant_name then
      raise exception 'Certificate does not match its issuance confirmation'
        using errcode = '23514';
    end if;
  elsif new.completion_snapshot_id is not null
        and new.legacy_review_id is null
        and new.replaces_certificate_id is null
        and new.status in ('generating', 'valid') then
    raise exception 'Native certificate issuance requires learner confirmation'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger certificates_validate_confirmation_link
before insert or update on public.certificates
for each row execute function public.validate_certificate_confirmation_link();

create or replace function public.confirm_certificate_issuance(
  confirming_user_id uuid,
  target_completion_snapshot_id uuid,
  confirmed_participant_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot public.course_completion_snapshots%rowtype;
  normalized_name text;
  confirmation_id uuid;
  existing_name text;
  existing_snapshot_id uuid;
  profile_id uuid;
  profile_identity_version uuid;
begin
  normalized_name := regexp_replace(trim(confirmed_participant_name), '\s+', ' ', 'g');
  if length(normalized_name) not between 2 and 160
     or normalized_name ~ '[[:cntrl:]]'
     or strpos(normalized_name, ' ') = 0 then
    raise exception 'A complete first and last name is required'
      using errcode = '22023';
  end if;

  select * into snapshot
  from public.course_completion_snapshots
  where id = target_completion_snapshot_id
  for share;
  if snapshot.id is null or snapshot.user_id <> confirming_user_id then
    raise exception 'Completion snapshot not found'
      using errcode = 'P0002';
  end if;

  -- A repeated POST after a timeout is idempotent even if the first request
  -- has already finalized the certificate. Only the exact same name and
  -- completion snapshot may reuse the durable confirmation.
  select id, participant_name, completion_snapshot_id
    into confirmation_id, existing_name, existing_snapshot_id
  from public.certificate_issuance_confirmations
  where user_id = snapshot.user_id
    and course_id = snapshot.course_id
  for share;
  if confirmation_id is not null then
    if existing_snapshot_id <> snapshot.id then
      raise exception 'A certificate issuance was already confirmed for this course'
        using errcode = '23514';
    end if;
    if existing_name <> normalized_name then
      raise exception 'Certificate name was already confirmed and cannot be changed'
        using errcode = '23514';
    end if;
    return confirmation_id;
  end if;

  if exists (
    select 1
    from public.certificates certificate
    where certificate.user_id = snapshot.user_id
      and certificate.course_id = snapshot.course_id
      and certificate.status in ('valid', 'revoked', 'archived')
  ) then
    raise exception 'A native certificate was already finalized for this course'
      using errcode = '23514';
  end if;

  -- This locked update rotates the profile identity version before the insert.
  -- The confirmation then references that exact version, so the database FK
  -- atomically rejects every later or concurrent profile-name change.
  update public.profiles
  set certificate_name = normalized_name,
      updated_at = timezone('utc', now())
  where auth_user_id = confirming_user_id
  returning id, certificate_identity_version
    into profile_id, profile_identity_version;
  if profile_id is null then
    raise exception 'Certificate profile not found'
      using errcode = 'P0002';
  end if;
  insert into public.certificate_issuance_confirmations (
    user_id,
    course_id,
    course_version,
    completion_snapshot_id,
    profile_identity_version,
    participant_name
  ) values (
    snapshot.user_id,
    snapshot.course_id,
    snapshot.course_version,
    snapshot.id,
    profile_identity_version,
    normalized_name
  )
  on conflict do nothing
  returning id into confirmation_id;

  if confirmation_id is null then
    select id, participant_name, completion_snapshot_id
      into confirmation_id, existing_name, existing_snapshot_id
    from public.certificate_issuance_confirmations
    where user_id = snapshot.user_id
      and course_id = snapshot.course_id
    for share;
    if confirmation_id is null then
      raise exception 'Certificate confirmation changed concurrently'
        using errcode = '40001';
    end if;
    if existing_snapshot_id <> snapshot.id then
      raise exception 'A certificate issuance was already confirmed for this course'
        using errcode = '23514';
    end if;
    if existing_name <> normalized_name then
      raise exception 'Certificate name was already confirmed and cannot be changed'
        using errcode = '23514';
    end if;
    return confirmation_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    confirming_user_id,
    'learner',
    'certificate_name_confirmed',
    'certificate_issuance_confirmation',
    confirmation_id::text,
    jsonb_build_object(
      'courseId', snapshot.course_id,
      'courseVersion', snapshot.course_version,
      'completionSnapshotId', snapshot.id,
      'participantName', normalized_name,
      'correctionNoticeAccepted', true,
      'singleIssuanceNoticeAccepted', true
    )
  );

  return confirmation_id;
end;
$$;

alter table public.certificate_issuance_confirmations enable row level security;
revoke all on table public.certificate_issuance_confirmations
from public, anon, authenticated;
grant all on table public.certificate_issuance_confirmations to service_role;

revoke all on function public.freeze_certificate_issuance_confirmation()
from public, anon, authenticated;
revoke all on function public.rotate_profile_certificate_identity_version()
from public, anon, authenticated;
revoke all on function public.validate_certificate_confirmation_link()
from public, anon, authenticated;
revoke execute on function public.confirm_certificate_issuance(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.confirm_certificate_issuance(uuid, uuid, text)
to service_role;

commit;
