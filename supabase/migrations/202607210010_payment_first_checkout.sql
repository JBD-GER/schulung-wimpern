-- Payment-first checkout for new and existing participants.
--
-- Unpaid browser state lives only in checkout_intents. Auth users, orders and
-- enrollments are created/bound after a signature-verified Stripe webhook has
-- recorded immutable paid evidence. The previous order-based flow remains in
-- place solely so already-open Checkout Sessions can drain safely.

begin;

-- A previous SQL-editor run may have committed the table before failing on a
-- later statement. The table definition itself is atomic, so an existing
-- table from this migration already contains the complete base column and
-- constraint contract. The remaining objects below are recreated safely.
create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  provisioned_order_id uuid unique references public.orders(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_version text not null check (course_version ~ '^[0-9]{4}\.[0-9]+$'),
  email text not null,
  first_name text not null check (length(trim(first_name)) between 2 and 100),
  last_name text not null check (length(trim(last_name)) between 2 and 100),
  browser_token_hash text not null unique check (browser_token_hash ~ '^[a-f0-9]{64}$'),
  email_verification_token_hash text unique check (
    email_verification_token_hash is null
    or email_verification_token_hash ~ '^[a-f0-9]{64}$'
  ),
  email_verified_at timestamptz,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  stripe_customer_id text,
  stripe_invoice_id text,
  stripe_price_id text not null,
  billing_fingerprint text check (
    billing_fingerprint is null or billing_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  billing_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(billing_snapshot) = 'object'
  ),
  consent_snapshot jsonb not null default '{}'::jsonb check (
    jsonb_typeof(consent_snapshot) = 'object'
  ),
  amount_total bigint check (amount_total is null or amount_total >= 0),
  currency text check (currency is null or currency ~ '^[a-zA-Z]{3}$'),
  tax_amount bigint check (tax_amount is null or tax_amount >= 0),
  business_purchase boolean not null default false,
  status text not null default 'draft' check (
    status in (
      'draft', 'email_verified', 'open', 'processing', 'paid',
      'provisioning', 'provisioned', 'failed', 'expired'
    )
  ),
  paid_at timestamptz,
  preparation_lease_token uuid,
  preparation_lease_expires_at timestamptz,
  provisioning_lease_token uuid,
  provisioning_lease_expires_at timestamptz,
  bootstrap_lease_token uuid,
  bootstrap_lease_expires_at timestamptz,
  bootstrap_consumed_at timestamptz,
  contract_confirmation_text text,
  contract_confirmation_sha256 text,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint checkout_intents_email_normalized check (
    email = lower(trim(email)) and length(email) between 5 and 254
  ),
  constraint checkout_intents_expiry check (expires_at > created_at),
  constraint checkout_intents_contract_confirmation check (
    (contract_confirmation_text is null and contract_confirmation_sha256 is null)
    or (
      length(contract_confirmation_text) >= 1500
      and contract_confirmation_sha256 ~ '^[a-f0-9]{64}$'
    )
  ),
  constraint checkout_intents_provisioned_confirmation check (
    status <> 'provisioned'
    or (
      contract_confirmation_text is not null
      and contract_confirmation_sha256 is not null
    )
  ),
  constraint checkout_intents_paid_evidence check (
    status not in ('paid', 'provisioning', 'provisioned')
    or (
      paid_at is not null
      and stripe_checkout_session_id is not null
      and stripe_payment_intent_id is not null
      and stripe_customer_id is not null
      and billing_fingerprint is not null
      and amount_total is not null
      and currency is not null
      and tax_amount is not null
    )
  )
);

create index if not exists checkout_intents_expiry_idx
  on public.checkout_intents(status, expires_at);
create index if not exists checkout_intents_email_idx
  on public.checkout_intents(email, created_at desc);
create index if not exists checkout_intents_provisioning_idx
  on public.checkout_intents(status, provisioning_lease_expires_at)
  where status in ('paid', 'provisioning');
create unique index if not exists checkout_intents_one_payment_per_email_course
  on public.checkout_intents(email, course_id)
  where status in ('processing', 'open', 'paid', 'provisioning');

create or replace function public.find_auth_user_by_checkout_email(
  normalized_email text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_user_id uuid;
  matches integer;
begin
  select (array_agg(auth_user.id order by auth_user.created_at))[1], count(*)
    into matched_user_id, matches
  from auth.users auth_user
  where lower(auth_user.email) = lower(trim(normalized_email));
  if matches > 1 then
    raise exception 'Multiple auth users share this checkout email' using errcode = '23505';
  end if;
  return matched_user_id;
end;
$$;

create or replace function public.acquire_checkout_intent_preparation(
  target_intent_id uuid,
  expected_browser_token_hash text,
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
  target_email text;
  target_course_id uuid;
begin
  if target_intent_id is null
     or expected_browser_token_hash !~ '^[a-f0-9]{64}$'
     or requested_lease_token is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout preparation lease input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select email, course_id into target_email, target_course_id
  from public.checkout_intents
  where id = target_intent_id
    and browser_token_hash = expected_browser_token_hash;
  if target_email is null or target_course_id is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('checkout-payment:' || target_email || ':' || target_course_id::text, 0)
  );
  update public.checkout_intents
  set status = 'expired',
      preparation_lease_token = null,
      preparation_lease_expires_at = null
  where id <> target_intent_id
    and email = target_email
    and course_id = target_course_id
    and paid_at is null
    and status in ('processing', 'open')
    and expires_at <= timezone('utc', now());
  update public.checkout_intents
  set status = 'processing',
      preparation_lease_token = requested_lease_token,
      preparation_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where id = target_intent_id
    and browser_token_hash = expected_browser_token_hash
    and email_verified_at is not null
    and status in ('email_verified', 'open', 'processing')
    and expires_at > timezone('utc', now())
    and (
      preparation_lease_expires_at is null
      or preparation_lease_expires_at <= timezone('utc', now())
      or preparation_lease_token = requested_lease_token
    );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_checkout_intent_preparation(
  target_intent_id uuid,
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
  update public.checkout_intents
  set status = case
        when paid_at is null and status = 'processing' and stripe_checkout_session_id is null
          then 'email_verified'
        when paid_at is null and status = 'processing' and stripe_checkout_session_id is not null
          then 'open'
        else status
      end,
      preparation_lease_token = null,
      preparation_lease_expires_at = null
  where id = target_intent_id
    and preparation_lease_token = requested_lease_token;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

drop trigger if exists checkout_intents_updated_at
on public.checkout_intents;
create trigger checkout_intents_updated_at
before update on public.checkout_intents
for each row execute function public.set_updated_at();

create or replace function public.freeze_checkout_contract_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.contract_confirmation_text is not null
     and (
       new.contract_confirmation_text is distinct from old.contract_confirmation_text
       or new.contract_confirmation_sha256 is distinct from old.contract_confirmation_sha256
     ) then
    raise exception 'Checkout contract confirmation is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists checkout_intents_contract_confirmation_freeze
on public.checkout_intents;
create trigger checkout_intents_contract_confirmation_freeze
before update on public.checkout_intents
for each row execute function public.freeze_checkout_contract_confirmation();

alter table public.checkout_intents enable row level security;
revoke all on table public.checkout_intents from public, anon, authenticated;
grant all on table public.checkout_intents to service_role;

create or replace function public.record_paid_checkout_intent(
  target_intent_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkout_intents%rowtype;
begin
  if target_intent_id is null
     or nullif(trim(checkout_session_id), '') is null
     or nullif(trim(payment_intent_id), '') is null
     or nullif(trim(customer_id), '') is null
     or nullif(trim(price_id), '') is null
     or billing_fingerprint !~ '^[a-f0-9]{64}$'
     or total_amount is null or total_amount < 0
     or total_tax is null or total_tax < 0
     or lower(currency_code) !~ '^[a-z]{3}$' then
    raise exception 'Paid checkout intent evidence is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;

  if target.id is null
     or target.email_verified_at is null
     or target.stripe_price_id <> price_id
     or target.stripe_checkout_session_id is distinct from checkout_session_id
     or target.billing_fingerprint is distinct from billing_fingerprint
     or target.billing_snapshot ->> 'billingFingerprint' is distinct from billing_fingerprint
     or (target.stripe_payment_intent_id is not null and target.stripe_payment_intent_id <> payment_intent_id)
     or (target.stripe_customer_id is not null and target.stripe_customer_id <> customer_id)
     or (target.amount_total is not null and target.amount_total <> total_amount)
     or (target.currency is not null and lower(target.currency) <> lower(currency_code))
     or (target.tax_amount is not null and target.tax_amount <> total_tax)
     or (
       target.stripe_invoice_id is not null
       and nullif(invoice_id, '') is not null
       and target.stripe_invoice_id <> invoice_id
     ) then
    raise exception 'Checkout intent does not match immutable Stripe evidence' using errcode = '23514';
  end if;

  if target.paid_at is not null then
    -- A duplicate success event must never reset a live provisioning lease.
    -- Only a later, matching invoice identifier may be filled in.
    if target.stripe_invoice_id is null and nullif(invoice_id, '') is not null then
      update public.checkout_intents
      set stripe_invoice_id = invoice_id
      where id = target.id
        and stripe_invoice_id is null;
    end if;
    return target.id;
  end if;

  update public.checkout_intents
  set stripe_payment_intent_id = payment_intent_id,
      stripe_customer_id = customer_id,
      stripe_invoice_id = coalesce(nullif(invoice_id, ''), stripe_invoice_id),
      amount_total = total_amount,
      currency = lower(currency_code),
      tax_amount = total_tax,
      status = 'paid',
      paid_at = coalesce(paid_at, timezone('utc', now())),
      provisioning_lease_token = null,
      provisioning_lease_expires_at = null
  where id = target.id;
  return target.id;
end;
$$;

create or replace function public.claim_checkout_intent_provisioning(
  target_intent_id uuid,
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
  if target_intent_id is null
     or requested_lease_token is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout provisioning lease input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  update public.checkout_intents
  set status = 'provisioning',
      provisioning_lease_token = requested_lease_token,
      provisioning_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where id = target_intent_id
    and paid_at is not null
    and status in ('paid', 'provisioning')
    and (
      status = 'paid'
      or provisioning_lease_expires_at <= timezone('utc', now())
      or provisioning_lease_token = requested_lease_token
    );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.find_checkout_intent_auth_user(
  target_intent_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_user_id uuid;
  matches integer;
begin
  select (array_agg(auth_user.id order by auth_user.created_at))[1], count(*)
    into matched_user_id, matches
  from auth.users auth_user
  join public.checkout_intents intent
    on intent.id = target_intent_id
   and lower(auth_user.email) = intent.email
  where auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target_intent_id::text;
  if matches > 1 then
    raise exception 'Checkout intent is linked to multiple auth users' using errcode = '23505';
  end if;
  return matched_user_id;
end;
$$;

create or replace function public.bind_checkout_intent_auth_user(
  target_intent_id uuid,
  requested_lease_token uuid,
  provisioned_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not exists (
    select 1
    from public.checkout_intents intent
    join auth.users auth_user on auth_user.id = provisioned_user_id
    where intent.id = target_intent_id
      and lower(auth_user.email) = intent.email
      and auth_user.email_confirmed_at is not null
      and (
        intent.auth_user_id = auth_user.id
        or auth_user.raw_app_meta_data ->> 'checkout_intent_id' = intent.id::text
        or (intent.auth_user_id is null and intent.email_verified_at is not null)
      )
  ) then
    raise exception 'Provisioned auth user does not match checkout intent' using errcode = '23514';
  end if;

  update public.checkout_intents
  set auth_user_id = provisioned_user_id
  where id = target_intent_id
    and status = 'provisioning'
    and provisioning_lease_token = requested_lease_token
    and provisioning_lease_expires_at > timezone('utc', now())
    and (auth_user_id is null or auth_user_id = provisioned_user_id);
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.finalize_paid_checkout_intent(
  target_intent_id uuid,
  requested_lease_token uuid,
  provisioned_user_id uuid,
  submitted_contract_confirmation_text text,
  submitted_contract_confirmation_sha256 text
)
returns table(order_id uuid, access_granted boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkout_intents%rowtype;
  created_order public.orders%rowtype;
  current_enrollment public.enrollments%rowtype;
  granted boolean := false;
  legal_hash text;
  terms_version text;
  contract_snapshot jsonb;
begin
  if length(coalesce(submitted_contract_confirmation_text, '')) < 1500
     or submitted_contract_confirmation_sha256 !~ '^[a-f0-9]{64}$'
     or encode(
       sha256(convert_to(submitted_contract_confirmation_text, 'UTF8')),
       'hex'
     ) <> submitted_contract_confirmation_sha256 then
    raise exception 'Checkout contract confirmation is invalid' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;

  if target.id is null
     or target.status not in ('provisioning', 'provisioned')
     or target.paid_at is null
     or target.auth_user_id is distinct from provisioned_user_id then
    raise exception 'Checkout intent is not ready for fulfillment' using errcode = '23514';
  end if;
  if target.status = 'provisioned' then
    return query select target.provisioned_order_id, false;
    return;
  end if;
  if target.provisioning_lease_token is distinct from requested_lease_token
     or target.provisioning_lease_expires_at <= timezone('utc', now()) then
    raise exception 'Checkout provisioning lease was lost' using errcode = '40001';
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where auth_user.id = provisioned_user_id
      and lower(auth_user.email) = target.email
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception 'Checkout auth user is unavailable' using errcode = '23514';
  end if;

  -- Serialize against the historical checkout RPC, which uses the same key.
  perform pg_advisory_xact_lock(
    hashtextextended(provisioned_user_id::text || ':' || target.course_id::text, 0)
  );

  select * into created_order
  from public.orders
  where stripe_checkout_session_id = target.stripe_checkout_session_id
  for update;
  if created_order.id is null then
    insert into public.orders(
      id, user_id, course_id, stripe_checkout_session_id,
      stripe_payment_intent_id, stripe_customer_id, stripe_invoice_id,
      stripe_price_id, amount_total, currency, tax_amount, payment_status,
      business_purchase, billing_snapshot, payment_source, paid_at
    ) values (
      target.id, provisioned_user_id, target.course_id, target.stripe_checkout_session_id,
      target.stripe_payment_intent_id, target.stripe_customer_id, target.stripe_invoice_id,
      target.stripe_price_id, target.amount_total, lower(target.currency), target.tax_amount, 'paid',
      target.business_purchase, target.billing_snapshot, 'stripe', target.paid_at
    ) returning * into created_order;
  elsif created_order.id <> target.id
     or created_order.user_id <> provisioned_user_id
     or created_order.course_id <> target.course_id
     or created_order.payment_status <> 'paid'
     or created_order.stripe_payment_intent_id <> target.stripe_payment_intent_id
     or created_order.billing_snapshot ->> 'billingFingerprint' is distinct from target.billing_fingerprint then
    raise exception 'Existing order conflicts with paid checkout intent' using errcode = '23514';
  end if;

  insert into public.stripe_customers(user_id, stripe_customer_id)
  values (provisioned_user_id, target.stripe_customer_id)
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id
    where public.stripe_customers.stripe_customer_id = excluded.stripe_customer_id;
  if not found then
    raise exception 'Stripe customer belongs to a different mapping' using errcode = '23505';
  end if;

  update public.profiles
  set first_name = target.first_name,
      last_name = target.last_name,
      certificate_name = coalesce(certificate_name, target.first_name || ' ' || target.last_name),
      billing_type = coalesce(target.billing_snapshot ->> 'billingType', 'private'),
      company_name = nullif(target.billing_snapshot ->> 'companyName', ''),
      contact_person = nullif(target.billing_snapshot ->> 'contactPerson', ''),
      billing_address = coalesce(target.billing_snapshot -> 'billingAddress', '{}'::jsonb),
      tax_id = nullif(target.billing_snapshot ->> 'taxId', '')
  where auth_user_id = provisioned_user_id;
  if not found then
    raise exception 'Checkout profile was not created' using errcode = '23514';
  end if;

  select * into current_enrollment
  from public.enrollments
  where user_id = provisioned_user_id
    and course_id = target.course_id
    and status in ('pending_payment', 'active', 'completed')
  order by created_at desc
  limit 1
  for update;
  if current_enrollment.id is null then
    insert into public.enrollments(
      user_id, course_id, status, granted_at, order_id, access_type
    ) values (
      provisioned_user_id, target.course_id, 'active', timezone('utc', now()), created_order.id, 'purchase'
    );
    granted := true;
  elsif current_enrollment.status = 'pending_payment' then
    update public.orders
    set payment_status = 'expired'
    where id = current_enrollment.order_id
      and id <> created_order.id
      and payment_status in ('pending', 'processing');
    update public.enrollments
    set status = 'active',
        granted_at = timezone('utc', now()),
        revoked_at = null,
        order_id = created_order.id,
        access_type = 'purchase'
    where id = current_enrollment.id;
    granted := true;
  end if;

  legal_hash := target.consent_snapshot ->> 'legalTextHash';
  terms_version := target.consent_snapshot ->> 'termsVersion';
  contract_snapshot := target.consent_snapshot -> 'contract';
  if nullif(legal_hash, '') is null
     or nullif(terms_version, '') is null
     or coalesce((target.consent_snapshot ->> 'termsAccepted')::boolean, false) is not true
     or coalesce((target.consent_snapshot ->> 'earlyAccessAccepted')::boolean, false) is not true
     or jsonb_typeof(contract_snapshot) <> 'object'
     or contract_snapshot ->> 'legalTextHash' is distinct from legal_hash
     or contract_snapshot ->> 'termsVersion' is distinct from terms_version
     or nullif(contract_snapshot ->> 'acceptedAt', '') is null
     or length(coalesce(contract_snapshot ->> 'termsAcceptanceText', '')) < 20
     or length(coalesce(contract_snapshot ->> 'earlyAccessAcceptanceText', '')) < 100
     or length(coalesce(contract_snapshot ->> 'termsText', '')) < 1000
     or length(coalesce(contract_snapshot ->> 'withdrawalText', '')) < 500 then
    raise exception 'Checkout consent evidence is incomplete' using errcode = '23514';
  end if;
  insert into public.consent_records(user_id, consent_type, consent_version, granted, proof)
  values
    (provisioned_user_id, 'terms_and_privacy', terms_version, true,
      jsonb_build_object(
        'orderId', created_order.id,
        'legalTextHash', legal_hash,
        'acceptedAt', contract_snapshot ->> 'acceptedAt',
        'statement', contract_snapshot ->> 'termsAcceptanceText'
      )),
    (provisioned_user_id, 'early_access', terms_version, true,
      jsonb_build_object(
        'orderId', created_order.id,
        'legalTextHash', legal_hash,
        'acceptedAt', contract_snapshot ->> 'acceptedAt',
        'statement', contract_snapshot ->> 'earlyAccessAcceptanceText'
      ));

  update public.checkout_intents
  set status = 'provisioned',
      provisioned_order_id = created_order.id,
      contract_confirmation_text = submitted_contract_confirmation_text,
      contract_confirmation_sha256 = submitted_contract_confirmation_sha256,
      provisioning_lease_token = null,
      provisioning_lease_expires_at = null
  where id = target.id;

  -- Commit the delivery request in the same transaction as access. This
  -- guarantees that the retry worker can discover the message even if the
  -- webhook process crashes immediately after this function returns.
  insert into public.email_deliveries(
    user_id, recipient_email, template, event_key, status, error_message
  ) values (
    provisioned_user_id,
    target.email,
    'enrollment_activated',
    'enrollment-activated:' || created_order.id::text,
    'failed',
    'Automatischer Versand nach Payment-first-Freischaltung ausstehend.'
  )
  on conflict (event_key) do nothing;

  insert into public.audit_logs(actor_role, action, entity_type, entity_id, metadata)
  values (
    'stripe', 'payment_first_checkout_provisioned', 'order', created_order.id::text,
    jsonb_build_object('checkoutIntentId', target.id, 'userId', provisioned_user_id, 'accessGranted', granted)
  );
  return query select created_order.id, granted;
end;
$$;

create or replace function public.claim_checkout_intent_bootstrap(
  target_intent_id uuid,
  expected_browser_token_hash text,
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
  if target_intent_id is null
     or expected_browser_token_hash !~ '^[a-f0-9]{64}$'
     or requested_lease_token is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout bootstrap lease input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  update public.checkout_intents
  set bootstrap_lease_token = requested_lease_token,
      bootstrap_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where id = target_intent_id
    and browser_token_hash = expected_browser_token_hash
    and status = 'provisioned'
    and auth_user_id is not null
    and bootstrap_consumed_at is null
    and expires_at > timezone('utc', now())
    and (
      bootstrap_lease_expires_at is null
      or bootstrap_lease_expires_at <= timezone('utc', now())
      or bootstrap_lease_token = requested_lease_token
    );
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_checkout_intent_bootstrap(
  target_intent_id uuid,
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
  update public.checkout_intents
  set bootstrap_lease_token = null,
      bootstrap_lease_expires_at = null
  where id = target_intent_id
    and bootstrap_lease_token = requested_lease_token
    and bootstrap_consumed_at is null;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.consume_checkout_intent_bootstrap(
  target_intent_id uuid,
  expected_browser_token_hash text,
  authenticated_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkout_intents%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;
  if target.id is null
     or target.browser_token_hash <> expected_browser_token_hash
     or target.status <> 'provisioned'
     or target.auth_user_id is distinct from authenticated_user_id
     or target.expires_at <= timezone('utc', now()) then
    return false;
  end if;
  if target.bootstrap_consumed_at is null then
    update public.checkout_intents
    set bootstrap_consumed_at = timezone('utc', now()),
        bootstrap_lease_token = null,
        bootstrap_lease_expires_at = null,
        browser_token_hash = encode(
          sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')),
          'hex'
        )
    where id = target.id;
  end if;
  return true;
end;
$$;

create or replace function public.bind_paid_checkout_intent_invoice(
  target_intent_id uuid,
  paid_invoice_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.checkout_intents%rowtype;
  linked_order public.orders%rowtype;
begin
  if paid_invoice_id !~ '^in_[A-Za-z0-9_]+$' then
    raise exception 'Stripe invoice identifier is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;
  if target.id is null
     or target.paid_at is null
     or target.status not in ('paid', 'provisioning', 'provisioned')
     or (target.stripe_invoice_id is not null and target.stripe_invoice_id <> paid_invoice_id) then
    raise exception 'Paid invoice conflicts with checkout intent' using errcode = '23514';
  end if;
  update public.checkout_intents
  set stripe_invoice_id = paid_invoice_id
  where id = target.id;

  if target.provisioned_order_id is not null then
    select * into linked_order
    from public.orders
    where id = target.provisioned_order_id
    for update;
    if linked_order.id is null
       or linked_order.stripe_checkout_session_id <> target.stripe_checkout_session_id
       or (
         linked_order.stripe_invoice_id is not null
         and linked_order.stripe_invoice_id <> paid_invoice_id
       ) then
      raise exception 'Paid invoice conflicts with provisioned order' using errcode = '23514';
    end if;
    update public.orders
    set stripe_invoice_id = paid_invoice_id
    where id = linked_order.id;
  end if;
  return true;
end;
$$;

create or replace function public.purge_expired_unpaid_checkout_intents()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed bigint;
begin
  delete from public.checkout_intents
  where paid_at is null
    and provisioned_order_id is null
    and stripe_checkout_session_id is null
    and stripe_payment_intent_id is null
    and (stripe_customer_id is null or auth_user_id is not null)
    and status in ('draft', 'email_verified', 'open', 'processing', 'failed', 'expired')
    and expires_at < timezone('utc', now()) - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.record_paid_checkout_intent(uuid, text, text, text, text, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke execute on function public.freeze_checkout_contract_confirmation() from public, anon, authenticated;
revoke execute on function public.find_auth_user_by_checkout_email(text) from public, anon, authenticated;
revoke execute on function public.acquire_checkout_intent_preparation(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_checkout_intent_preparation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_checkout_intent_provisioning(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.find_checkout_intent_auth_user(uuid) from public, anon, authenticated;
revoke execute on function public.bind_checkout_intent_auth_user(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.finalize_paid_checkout_intent(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.claim_checkout_intent_bootstrap(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_checkout_intent_bootstrap(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.consume_checkout_intent_bootstrap(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.bind_paid_checkout_intent_invoice(uuid, text) from public, anon, authenticated;
revoke execute on function public.purge_expired_unpaid_checkout_intents() from public, anon, authenticated;
grant execute on function public.record_paid_checkout_intent(uuid, text, text, text, text, text, text, bigint, text, bigint) to service_role;
grant execute on function public.find_auth_user_by_checkout_email(text) to service_role;
grant execute on function public.acquire_checkout_intent_preparation(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_checkout_intent_preparation(uuid, uuid) to service_role;
grant execute on function public.claim_checkout_intent_provisioning(uuid, uuid, integer) to service_role;
grant execute on function public.find_checkout_intent_auth_user(uuid) to service_role;
grant execute on function public.bind_checkout_intent_auth_user(uuid, uuid, uuid) to service_role;
grant execute on function public.finalize_paid_checkout_intent(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.claim_checkout_intent_bootstrap(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_checkout_intent_bootstrap(uuid, uuid) to service_role;
grant execute on function public.consume_checkout_intent_bootstrap(uuid, text, uuid) to service_role;
grant execute on function public.bind_paid_checkout_intent_invoice(uuid, text) to service_role;
grant execute on function public.purge_expired_unpaid_checkout_intents() to service_role;

commit;

select 'OK: Migration 202607210010 wurde vollständig angewendet.'
  as migration_status;
