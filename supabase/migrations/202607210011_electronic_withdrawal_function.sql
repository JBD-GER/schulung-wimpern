-- Public electronic withdrawal evidence under section 356a BGB. The declaration
-- is accepted without authentication, but only the server-side service role may
-- call the narrowly scoped insert function. Evidence rows are append-only.

begin;

create table public.withdrawal_requests (
  id uuid primary key,
  receipt_number text not null unique
    check (receipt_number ~ '^WR-[0-9]{8}-[A-F0-9]{12}$'),
  submission_key_hash text not null unique
    check (submission_key_hash ~ '^[a-f0-9]{64}$'),
  consumer_name text not null
    check (length(consumer_name) between 2 and 160),
  contract_reference text not null
    check (length(contract_reference) between 3 and 240),
  confirmation_email text not null
    check (length(confirmation_email) between 3 and 254),
  declaration_version text not null
    check (declaration_version = 'electronic-withdrawal-v1'),
  declaration_text text not null,
  declaration_payload jsonb not null
    check (jsonb_typeof(declaration_payload) = 'object'),
  received_at timestamptz not null,
  evidence_document jsonb not null
    check (jsonb_typeof(evidence_document) = 'object'),
  evidence_sha256 text not null
    check (evidence_sha256 ~ '^[a-f0-9]{64}$')
);

create index withdrawal_requests_email_received_idx
  on public.withdrawal_requests(lower(confirmation_email), received_at desc);

comment on table public.withdrawal_requests is
  'Immutable receipt evidence created through the electronic withdrawal function.';
comment on column public.withdrawal_requests.declaration_payload is
  'Exact section 356a(2) declaration content confirmed by the consumer.';
comment on column public.withdrawal_requests.evidence_document is
  'Canonical JSON evidence including receipt number and database receipt time.';

create or replace function public.reject_withdrawal_request_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Electronic withdrawal evidence is immutable'
      using errcode = '23514';
  end if;

  raise exception 'Electronic withdrawal evidence cannot be deleted'
    using errcode = '23514';
end;
$$;

create trigger withdrawal_requests_freeze
before update or delete on public.withdrawal_requests
for each row execute function public.reject_withdrawal_request_mutation();

create or replace function public.record_electronic_withdrawal(
  submitted_submission_key_hash text,
  submitted_consumer_name text,
  submitted_contract_reference text,
  submitted_confirmation_email text
)
returns table(
  withdrawal_id uuid,
  receipt_number text,
  received_at timestamptz,
  recorded_consumer_name text,
  recorded_contract_reference text,
  recorded_confirmation_email text,
  declaration_text text,
  declaration_payload jsonb,
  evidence_sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_request public.withdrawal_requests%rowtype;
  new_request_id uuid;
  received_timestamp timestamptz;
  normalized_name text := regexp_replace(
    trim(coalesce(submitted_consumer_name, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_reference text := regexp_replace(
    trim(coalesce(submitted_contract_reference, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_email text := lower(trim(coalesce(submitted_confirmation_email, '')));
  generated_receipt_number text;
  fixed_declaration_text constant text :=
    'Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.';
  fixed_contract_description constant text :=
    'Online-Schulung Wimpernverlängerung';
  generated_declaration_payload jsonb;
  generated_evidence_document jsonb;
  generated_evidence_sha256 text;
begin
  if submitted_submission_key_hash is null
     or submitted_submission_key_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid electronic withdrawal submission key'
      using errcode = '22023';
  end if;

  if length(normalized_name) not between 2 and 160
     or length(normalized_reference) not between 3 and 240
     or length(normalized_email) not between 3 and 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid electronic withdrawal declaration data'
      using errcode = '22023';
  end if;

  -- A lost HTTP response can be retried with the same browser-generated key.
  -- Serialize that key and return the original immutable receipt only when the
  -- declaration content is byte-for-byte equivalent after normalization.
  perform pg_advisory_xact_lock(hashtextextended(submitted_submission_key_hash, 0));

  select request.* into existing_request
  from public.withdrawal_requests request
  where request.submission_key_hash = submitted_submission_key_hash;

  if existing_request.id is not null then
    if existing_request.consumer_name is distinct from normalized_name
       or existing_request.contract_reference is distinct from normalized_reference
       or existing_request.confirmation_email is distinct from normalized_email then
      raise exception 'Electronic withdrawal submission key was already used for different content'
        using errcode = '23514';
    end if;

    return query
    select existing_request.id,
           existing_request.receipt_number,
           existing_request.received_at,
           existing_request.consumer_name,
           existing_request.contract_reference,
           existing_request.confirmation_email,
           existing_request.declaration_text,
           existing_request.declaration_payload,
           existing_request.evidence_sha256;
    return;
  end if;

  new_request_id := gen_random_uuid();
  received_timestamp := clock_timestamp();
  generated_receipt_number := concat(
    'WR-',
    to_char(received_timestamp at time zone 'UTC', 'YYYYMMDD'),
    '-',
    upper(substr(replace(new_request_id::text, '-', ''), 1, 12))
  );

  generated_declaration_payload := jsonb_build_object(
    'version', 'electronic-withdrawal-v1',
    'consumerName', normalized_name,
    'contractReference', normalized_reference,
    'contractDescription', fixed_contract_description,
    'confirmationChannel', 'email',
    'confirmationEmail', normalized_email,
    'declarationText', fixed_declaration_text
  );

  generated_evidence_document := jsonb_build_object(
    'withdrawalId', new_request_id,
    'receiptNumber', generated_receipt_number,
    'receivedAt', received_timestamp,
    'source', 'electronic_withdrawal_function',
    'declaration', generated_declaration_payload
  );
  generated_evidence_sha256 := encode(
    sha256(convert_to(generated_evidence_document::text, 'UTF8')),
    'hex'
  );

  insert into public.withdrawal_requests(
    id,
    receipt_number,
    submission_key_hash,
    consumer_name,
    contract_reference,
    confirmation_email,
    declaration_version,
    declaration_text,
    declaration_payload,
    received_at,
    evidence_document,
    evidence_sha256
  ) values (
    new_request_id,
    generated_receipt_number,
    submitted_submission_key_hash,
    normalized_name,
    normalized_reference,
    normalized_email,
    'electronic-withdrawal-v1',
    fixed_declaration_text,
    generated_declaration_payload,
    received_timestamp,
    generated_evidence_document,
    generated_evidence_sha256
  );

  return query
  select new_request_id,
         generated_receipt_number,
         received_timestamp,
         normalized_name,
         normalized_reference,
         normalized_email,
         fixed_declaration_text,
         generated_declaration_payload,
         generated_evidence_sha256;
end;
$$;

alter table public.withdrawal_requests enable row level security;

revoke all on table public.withdrawal_requests
from public, anon, authenticated, service_role;
grant select on table public.withdrawal_requests to service_role;

revoke all on function public.reject_withdrawal_request_mutation()
from public, anon, authenticated;
revoke all on function public.record_electronic_withdrawal(text, text, text, text)
from public, anon, authenticated;
grant execute on function public.record_electronic_withdrawal(text, text, text, text)
to service_role;

commit;
