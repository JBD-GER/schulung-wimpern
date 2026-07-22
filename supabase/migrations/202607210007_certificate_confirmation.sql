-- Native certificates are created only after the learner has explicitly
-- confirmed the exact printed name. The confirmation is immutable evidence
-- and is bound to the durable course-completion snapshot.

begin;

-- This migration is deliberately repairable. A previous SQL-editor run may
-- have stopped after creating only some objects. Keep every existing row,
-- validate existing definitions, and install only the missing contract.
lock table public.profiles, public.certificates,
  public.course_completion_snapshots in share row exclusive mode;

alter table public.profiles
  add column if not exists certificate_identity_version uuid;

do $$
declare
  actual_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.profiles'::regclass
    and attribute.attname = 'certificate_identity_version'
    and not attribute.attisdropped;

  if actual_type is distinct from 'uuid' then
    raise exception
      'profiles.certificate_identity_version has type %, expected uuid',
      coalesce(actual_type, '<missing>');
  end if;
end;
$$;

update public.profiles
set certificate_identity_version = gen_random_uuid()
where certificate_identity_version is null;

alter table public.profiles
  alter column certificate_identity_version set default gen_random_uuid(),
  alter column certificate_identity_version set not null;

-- Build a temporary canonical definition so an existing same-named
-- constraint is compared with PostgreSQL's own normalized representation.
create temporary table certificate_profile_contract_202607210007 (
  auth_user_id uuid not null,
  certificate_identity_version uuid not null,
  constraint profiles_certificate_identity_version_key
    unique (auth_user_id, certificate_identity_version)
) on commit drop;

do $$
declare
  expected_definition text;
  actual_definition text;
begin
  select pg_get_constraintdef(constraint_row.oid, true)
    into expected_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid =
          'pg_temp.certificate_profile_contract_202607210007'::regclass
    and constraint_row.conname = 'profiles_certificate_identity_version_key';

  select pg_get_constraintdef(constraint_row.oid, true)
    into actual_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.profiles'::regclass
    and constraint_row.conname = 'profiles_certificate_identity_version_key';

  if actual_definition is not null
     and regexp_replace(actual_definition, '\s+', ' ', 'g') <>
         regexp_replace(expected_definition, '\s+', ' ', 'g') then
    raise exception
      'Constraint profiles_certificate_identity_version_key has an unexpected definition: %',
      actual_definition;
  elsif actual_definition is null then
    alter table public.profiles
      add constraint profiles_certificate_identity_version_key
      unique (auth_user_id, certificate_identity_version);
  end if;
end;
$$;

-- PostgreSQL does not permit foreign keys between temporary and permanent
-- tables. Validate those contracts directly from pg_constraint metadata and
-- add a missing key only after resolving both ordered column lists.
create or replace function pg_temp.ensure_foreign_key_202607210007(
  target_table regclass,
  referenced_table regclass,
  expected_name name,
  local_column_names name[],
  referenced_column_names name[],
  expected_update_action "char",
  expected_delete_action "char",
  require_expected_name boolean,
  add_definition text
)
returns void
language plpgsql
as $$
declare
  local_keys smallint[];
  referenced_keys smallint[];
  named_constraint_oid oid;
  named_definition text;
  named_matches boolean;
begin
  select array_agg(attribute.attnum order by requested.ordinality)
    into local_keys
  from unnest(local_column_names) with ordinality
       as requested(column_name, ordinality)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = target_table
   and attribute.attname = requested.column_name
   and not attribute.attisdropped;

  select array_agg(attribute.attnum order by requested.ordinality)
    into referenced_keys
  from unnest(referenced_column_names) with ordinality
       as requested(column_name, ordinality)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = referenced_table
   and attribute.attname = requested.column_name
   and not attribute.attisdropped;

  if cardinality(local_keys) is distinct from cardinality(local_column_names)
     or cardinality(referenced_keys) is distinct from
          cardinality(referenced_column_names) then
    raise exception 'Cannot resolve every column for foreign key %', expected_name;
  end if;

  select constraint_row.oid,
         constraint_row.contype = 'f'
           and constraint_row.confrelid = referenced_table
           and constraint_row.conkey = local_keys
           and constraint_row.confkey = referenced_keys
           and constraint_row.confupdtype = expected_update_action
           and constraint_row.confdeltype = expected_delete_action
           and constraint_row.confmatchtype = 's'
           and not constraint_row.condeferrable
           and not constraint_row.condeferred
           and constraint_row.convalidated,
         pg_get_constraintdef(constraint_row.oid, true)
    into named_constraint_oid, named_matches, named_definition
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = target_table
    and constraint_row.conname = expected_name;

  if named_constraint_oid is not null then
    if not named_matches then
      raise exception
        'Constraint % on % has an unexpected definition: %',
        expected_name,
        target_table,
        named_definition;
    end if;
    return;
  end if;

  if not require_expected_name and exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = target_table
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = referenced_table
      and constraint_row.conkey = local_keys
      and constraint_row.confkey = referenced_keys
      and constraint_row.confupdtype = expected_update_action
      and constraint_row.confdeltype = expected_delete_action
      and constraint_row.confmatchtype = 's'
      and not constraint_row.condeferrable
      and not constraint_row.condeferred
      and constraint_row.convalidated
  ) then
    return;
  end if;

  execute format(
    'alter table %s add constraint %I %s',
    target_table,
    expected_name,
    add_definition
  );

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = target_table
      and constraint_row.conname = expected_name
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = referenced_table
      and constraint_row.conkey = local_keys
      and constraint_row.confkey = referenced_keys
      and constraint_row.confupdtype = expected_update_action
      and constraint_row.confdeltype = expected_delete_action
      and constraint_row.confmatchtype = 's'
      and not constraint_row.condeferrable
      and not constraint_row.condeferred
      and constraint_row.convalidated
  ) then
    raise exception 'Foreign key % was not installed correctly', expected_name;
  end if;
end;
$$;

revoke all on function pg_temp.ensure_foreign_key_202607210007(
  regclass,
  regclass,
  name,
  name[],
  name[],
  "char",
  "char",
  boolean,
  text
) from public;

create table if not exists public.certificate_issuance_confirmations (
  id uuid default gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  course_version text,
  completion_snapshot_id uuid,
  profile_identity_version uuid,
  participant_name text,
  confirmation_source text default 'learner',
  confirmed_at timestamptz default timezone('utc', now()),
  created_at timestamptz default timezone('utc', now())
);

-- ADD COLUMN IF NOT EXISTS also repairs a manually created or otherwise
-- incomplete table. Semantic evidence columns are never guessed for existing
-- rows: the NOT NULL preflight below fails closed if such data is incomplete.
alter table public.certificate_issuance_confirmations
  add column if not exists id uuid,
  add column if not exists user_id uuid,
  add column if not exists course_id uuid,
  add column if not exists course_version text,
  add column if not exists completion_snapshot_id uuid,
  add column if not exists profile_identity_version uuid,
  add column if not exists participant_name text,
  add column if not exists confirmation_source text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists created_at timestamptz;

do $$
declare
  required_column record;
  actual_type text;
begin
  for required_column in
    select *
    from (values
      ('id', 'uuid'),
      ('user_id', 'uuid'),
      ('course_id', 'uuid'),
      ('course_version', 'text'),
      ('completion_snapshot_id', 'uuid'),
      ('profile_identity_version', 'uuid'),
      ('participant_name', 'text'),
      ('confirmation_source', 'text'),
      ('confirmed_at', 'timestamp with time zone'),
      ('created_at', 'timestamp with time zone')
    ) as expected(column_name, data_type)
  loop
    select format_type(attribute.atttypid, attribute.atttypmod)
      into actual_type
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid =
            'public.certificate_issuance_confirmations'::regclass
      and attribute.attname = required_column.column_name
      and not attribute.attisdropped;

    if actual_type is distinct from required_column.data_type then
      raise exception
        'certificate_issuance_confirmations.% has type %, expected %',
        required_column.column_name,
        coalesce(actual_type, '<missing>'),
        required_column.data_type;
    end if;
  end loop;

  if exists (
    select 1
    from public.certificate_issuance_confirmations confirmation
    where confirmation.id is null
       or confirmation.user_id is null
       or confirmation.course_id is null
       or confirmation.course_version is null
       or confirmation.completion_snapshot_id is null
       or confirmation.profile_identity_version is null
       or confirmation.participant_name is null
       or confirmation.confirmation_source is null
       or confirmation.confirmed_at is null
       or confirmation.created_at is null
  ) then
    raise exception
      'certificate_issuance_confirmations contains incomplete evidence; repair it explicitly before rerunning migration 202607210007';
  end if;
end;
$$;

alter table public.certificate_issuance_confirmations
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column user_id drop default,
  alter column user_id set not null,
  alter column course_id drop default,
  alter column course_id set not null,
  alter column course_version drop default,
  alter column course_version set not null,
  alter column completion_snapshot_id drop default,
  alter column completion_snapshot_id set not null,
  alter column profile_identity_version drop default,
  alter column profile_identity_version set not null,
  alter column participant_name drop default,
  alter column participant_name set not null,
  alter column confirmation_source set default 'learner',
  alter column confirmation_source set not null,
  alter column confirmed_at set default timezone('utc', now()),
  alter column confirmed_at set not null,
  alter column created_at set default timezone('utc', now()),
  alter column created_at set not null;

-- Generate the exact required constraint definitions in a temporary table.
-- The block below validates same-named constraints and accepts an equivalent
-- auto-named constraint from an earlier partial run; otherwise it installs the
-- missing definition without touching existing data.
create temporary table certificate_confirmation_contract_202607210007 (
  id uuid,
  user_id uuid,
  course_id uuid,
  course_version text,
  completion_snapshot_id uuid,
  profile_identity_version uuid,
  participant_name text,
  confirmation_source text,
  constraint certificate_confirmation_contract_pkey primary key (id),
  constraint certificate_confirmation_contract_version_check
    check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  constraint certificate_confirmation_contract_name_check check (
    participant_name = trim(participant_name)
    and length(participant_name) between 2 and 160
    and participant_name !~ '[[:cntrl:]]'
  ),
  constraint certificate_confirmation_contract_source_check check (
    confirmation_source in ('learner', 'migration_finalized_certificate')
  ),
  constraint certificate_confirmation_contract_user_course_key
    unique (user_id, course_id),
  constraint certificate_confirmation_contract_snapshot_key
    unique (completion_snapshot_id),
  constraint certificate_confirmation_contract_identity_key unique (
    id,
    user_id,
    course_id,
    course_version,
    completion_snapshot_id
  )
) on commit drop;

do $$
declare
  expected_constraint record;
  actual_definition text;
begin
  for expected_constraint in
    select constraint_row.conname,
           pg_get_constraintdef(constraint_row.oid, true) as definition
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
            'pg_temp.certificate_confirmation_contract_202607210007'::regclass
    order by constraint_row.contype, constraint_row.conname
  loop
    select pg_get_constraintdef(constraint_row.oid, true)
      into actual_definition
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
            'public.certificate_issuance_confirmations'::regclass
      and constraint_row.conname = expected_constraint.conname;

    if actual_definition is not null
       and regexp_replace(actual_definition, '\s+', ' ', 'g') <>
           regexp_replace(expected_constraint.definition, '\s+', ' ', 'g') then
      raise exception
        'Constraint % on certificate_issuance_confirmations has an unexpected definition: %',
        expected_constraint.conname,
        actual_definition;
    elsif actual_definition is null and not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid =
              'public.certificate_issuance_confirmations'::regclass
        and regexp_replace(
              pg_get_constraintdef(constraint_row.oid, true),
              '\s+',
              ' ',
              'g'
            ) = regexp_replace(
              expected_constraint.definition,
              '\s+',
              ' ',
              'g'
            )
    ) then
      execute format(
        'alter table public.certificate_issuance_confirmations add constraint %I %s',
        expected_constraint.conname,
        expected_constraint.definition
      );
    end if;
  end loop;
end;
$$;

select pg_temp.ensure_foreign_key_202607210007(
  'public.certificate_issuance_confirmations'::regclass,
  'auth.users'::regclass,
  'certificate_confirmation_contract_user_fkey',
  array['user_id']::name[],
  array['id']::name[],
  'a'::"char",
  'r'::"char",
  false,
  'foreign key (user_id) references auth.users(id) on delete restrict'
);

select pg_temp.ensure_foreign_key_202607210007(
  'public.certificate_issuance_confirmations'::regclass,
  'public.courses'::regclass,
  'certificate_confirmation_contract_course_fkey',
  array['course_id']::name[],
  array['id']::name[],
  'a'::"char",
  'r'::"char",
  false,
  'foreign key (course_id) references public.courses(id) on delete restrict'
);

select pg_temp.ensure_foreign_key_202607210007(
  'public.certificate_issuance_confirmations'::regclass,
  'public.course_completion_snapshots'::regclass,
  'certificate_confirmation_contract_snapshot_fkey',
  array[
    'completion_snapshot_id',
    'user_id',
    'course_id',
    'course_version'
  ]::name[],
  array['id', 'user_id', 'course_id', 'course_version']::name[],
  'a'::"char",
  'r'::"char",
  false,
  'foreign key (completion_snapshot_id, user_id, course_id, course_version) references public.course_completion_snapshots(id, user_id, course_id, course_version) on delete restrict'
);

select pg_temp.ensure_foreign_key_202607210007(
  'public.certificate_issuance_confirmations'::regclass,
  'public.profiles'::regclass,
  'certificate_confirmation_contract_profile_fkey',
  array['user_id', 'profile_identity_version']::name[],
  array['auth_user_id', 'certificate_identity_version']::name[],
  'r'::"char",
  'r'::"char",
  false,
  'foreign key (user_id, profile_identity_version) references public.profiles(auth_user_id, certificate_identity_version) on update restrict on delete restrict'
);

comment on table public.certificate_issuance_confirmations is
  'Immutable name evidence for the single native certificate issuance, with explicit learner or migration provenance.';

alter table public.certificates
  add column if not exists issuance_confirmation_id uuid;

do $$
declare
  actual_type text;
begin
  select format_type(attribute.atttypid, attribute.atttypmod)
    into actual_type
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.certificates'::regclass
    and attribute.attname = 'issuance_confirmation_id'
    and not attribute.attisdropped;

  if actual_type is distinct from 'uuid' then
    raise exception
      'certificates.issuance_confirmation_id has type %, expected uuid',
      coalesce(actual_type, '<missing>');
  end if;
end;
$$;

alter table public.certificates
  alter column issuance_confirmation_id drop default,
  alter column issuance_confirmation_id drop not null;

-- A confirmation is the authority for exactly one physical certificate row.
-- PostgreSQL unique constraints still permit multiple NULL values, so legacy
-- certificates without a native confirmation remain unaffected.
create temporary table certificate_link_contract_202607210007 (
  issuance_confirmation_id uuid,
  user_id uuid,
  course_id uuid,
  course_version text,
  completion_snapshot_id uuid,
  constraint certificates_issuance_confirmation_id_key
    unique (issuance_confirmation_id)
) on commit drop;

do $$
declare
  expected_constraint record;
  actual_definition text;
begin
  for expected_constraint in
    select constraint_row.conname,
           pg_get_constraintdef(constraint_row.oid, true) as definition
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
            'pg_temp.certificate_link_contract_202607210007'::regclass
    order by constraint_row.contype, constraint_row.conname
  loop
    select pg_get_constraintdef(constraint_row.oid, true)
      into actual_definition
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.certificates'::regclass
      and constraint_row.conname = expected_constraint.conname;

    if actual_definition is not null
       and regexp_replace(actual_definition, '\s+', ' ', 'g') <>
           regexp_replace(expected_constraint.definition, '\s+', ' ', 'g') then
      raise exception
        'Constraint % on certificates has an unexpected definition: %',
        expected_constraint.conname,
        actual_definition;
    elsif actual_definition is null then
      execute format(
        'alter table public.certificates add constraint %I %s',
        expected_constraint.conname,
        expected_constraint.definition
      );
    end if;
  end loop;
end;
$$;

select pg_temp.ensure_foreign_key_202607210007(
  'public.certificates'::regclass,
  'public.certificate_issuance_confirmations'::regclass,
  'certificates_issuance_confirmation_identity_fkey',
  array[
    'issuance_confirmation_id',
    'user_id',
    'course_id',
    'course_version',
    'completion_snapshot_id'
  ]::name[],
  array[
    'id',
    'user_id',
    'course_id',
    'course_version',
    'completion_snapshot_id'
  ]::name[],
  'a'::"char",
  'r'::"char",
  true,
  'foreign key (issuance_confirmation_id, user_id, course_id, course_version, completion_snapshot_id) references public.certificate_issuance_confirmations(id, user_id, course_id, course_version, completion_snapshot_id) on delete restrict'
);

-- Existing protection may come from a previous run that stopped after one of
-- the trigger creations. Disable all three before the repair backfill and
-- install their canonical definitions again later in this transaction.
drop trigger if exists certificate_issuance_confirmations_freeze
  on public.certificate_issuance_confirmations;
drop trigger if exists profiles_rotate_certificate_identity_version
  on public.profiles;
drop trigger if exists certificates_validate_confirmation_link
  on public.certificates;

do $$
begin
  if exists (
    select 1
    from public.certificates certificate
    where certificate.completion_snapshot_id is not null
      and certificate.legacy_review_id is null
      and certificate.replaces_certificate_id is null
      and certificate.status = 'generating'
      and certificate.issuance_confirmation_id is null
  ) then
    raise exception
      'A generating native certificate has no issuance confirmation; resolve it before rerunning migration 202607210007';
  end if;
end;
$$;

-- Certificates that were already finalized are historic evidence. Backfill
-- their immutable printed name for compatibility, but record the provenance
-- as a migration inference rather than pretending the learner confirmed it.
do $$
begin
  if exists (
    select 1
    from public.certificates certificate
    where certificate.completion_snapshot_id is not null
      and certificate.legacy_review_id is null
      and certificate.replaces_certificate_id is null
      and certificate.status in ('valid', 'revoked', 'archived')
    group by certificate.user_id, certificate.course_id
    having count(*) > 1
  ) then
    raise exception
      'Multiple finalized native certificates exist for one learner and course; migration 202607210007 will not guess which evidence is authoritative';
  end if;

  if exists (
    select 1
    from public.certificates certificate
    join public.certificate_issuance_confirmations confirmation
      on confirmation.id = certificate.issuance_confirmation_id
    where certificate.participant_name is distinct from confirmation.participant_name
  ) then
    raise exception
      'An existing certificate has a participant name that conflicts with its issuance confirmation';
  end if;

  if exists (
    with source as (
      select distinct on (certificate.user_id, certificate.course_id)
        certificate.user_id,
        certificate.course_id,
        certificate.course_version,
        certificate.completion_snapshot_id,
        trim(certificate.participant_name) as participant_name
      from public.certificates certificate
      where certificate.completion_snapshot_id is not null
        and certificate.legacy_review_id is null
        and certificate.replaces_certificate_id is null
        and certificate.status in ('valid', 'revoked', 'archived')
      order by certificate.user_id,
               certificate.course_id,
               certificate.issued_at,
               certificate.id
    )
    select 1
    from source
    join public.certificate_issuance_confirmations confirmation
      on confirmation.user_id = source.user_id
     and confirmation.course_id = source.course_id
    where confirmation.course_version is distinct from source.course_version
       or confirmation.completion_snapshot_id is distinct from
            source.completion_snapshot_id
       or confirmation.participant_name is distinct from source.participant_name
  ) then
    raise exception
      'An existing issuance confirmation conflicts with finalized certificate evidence';
  end if;
end;
$$;

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
  and certificate.issuance_confirmation_id is null
  and certificate.user_id = confirmation.user_id
  and certificate.course_id = confirmation.course_id
  and certificate.course_version = confirmation.course_version
  and certificate.completion_snapshot_id = confirmation.completion_snapshot_id
  and certificate.participant_name = confirmation.participant_name;

do $$
begin
  if exists (
    with source as (
      select distinct on (certificate.user_id, certificate.course_id)
        certificate.id as certificate_id,
        certificate.user_id,
        certificate.course_id,
        certificate.course_version,
        certificate.completion_snapshot_id,
        trim(certificate.participant_name) as participant_name,
        certificate.issuance_confirmation_id
      from public.certificates certificate
      where certificate.completion_snapshot_id is not null
        and certificate.legacy_review_id is null
        and certificate.replaces_certificate_id is null
        and certificate.status in ('valid', 'revoked', 'archived')
      order by certificate.user_id,
               certificate.course_id,
               certificate.issued_at,
               certificate.id
    )
    select 1
    from source
    left join public.certificate_issuance_confirmations confirmation
      on confirmation.user_id = source.user_id
     and confirmation.course_id = source.course_id
     and confirmation.course_version = source.course_version
     and confirmation.completion_snapshot_id = source.completion_snapshot_id
     and confirmation.participant_name = source.participant_name
    where confirmation.id is null
       or source.issuance_confirmation_id is distinct from confirmation.id
  ) then
    raise exception
      'Migration 202607210007 could not bind every finalized certificate to exact confirmation evidence';
  end if;
end;
$$;

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
       or confirmation.user_id is distinct from new.user_id
       or confirmation.course_id is distinct from new.course_id
       or confirmation.course_version is distinct from new.course_version
       or confirmation.completion_snapshot_id is distinct from
            new.completion_snapshot_id
       or confirmation.participant_name is distinct from new.participant_name then
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

-- Supabase SQL Editor otherwise displays the empty return value of the last
-- internal void helper. This final row is the unambiguous operator signal that
-- every statement above completed and the transaction was committed.
select 'OK: Migration 202607210007 wurde vollständig angewendet.'
  as migration_status;
