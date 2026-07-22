-- Password-backed payment-first checkout identity.
--
-- A new participant chooses a password before payment, but only its bcrypt
-- verifier is retained on the unpaid checkout intent. The Auth user continues
-- to be created only after immutable Stripe paid evidence has been recorded.
-- Existing accounts must already be bound through an authenticated session;
-- an email match alone is never authority to attach or bootstrap that account.

begin;

alter table public.checkout_intents
  add column identity_mode text not null default 'legacy_email_verified',
  add column identity_authorized_at timestamptz,
  add column signup_password_hash text,
  add column password_set_at timestamptz;

-- Every row predating this migration used the checkout-owned email proof. Do
-- not infer a stronger password or authenticated-session identity for it.
-- Preserve the historical updated_at value: this is a schema backfill, not a
-- participant action.
alter table public.checkout_intents
  disable trigger checkout_intents_updated_at;

update public.checkout_intents
set identity_mode = 'legacy_email_verified',
    identity_authorized_at = email_verified_at,
    signup_password_hash = null,
    password_set_at = null;

alter table public.checkout_intents
  enable trigger checkout_intents_updated_at;

alter table public.checkout_intents
  drop constraint if exists checkout_intents_status_check;

alter table public.checkout_intents
  add constraint checkout_intents_status_check check (
    status in (
      'draft', 'ready', 'email_verified', 'open', 'processing', 'paid',
      'provisioning', 'provisioned', 'failed', 'expired'
    )
  ),
  add constraint checkout_intents_identity_mode_check check (
    identity_mode in (
      'new_account_password',
      'existing_authenticated',
      'legacy_email_verified'
    )
  ),
  add constraint checkout_intents_signup_password_hash_check check (
    signup_password_hash is null
    or signup_password_hash ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$'
  ),
  add constraint checkout_intents_identity_authorization_check check (
    status not in (
      'ready', 'email_verified', 'processing', 'open', 'paid',
      'provisioning', 'provisioned'
    )
    or identity_authorized_at is not null
  ),
  add constraint checkout_intents_password_identity_state_check check (
    case identity_mode
      when 'new_account_password' then
        identity_authorized_at is not null
        and email_verification_token_hash is null
        and (
          (
            status = 'provisioned'
            and signup_password_hash is null
            and password_set_at is not null
          )
          or (
            status <> 'provisioned'
            and signup_password_hash is not null
            and password_set_at is null
          )
        )
      when 'existing_authenticated' then
        identity_authorized_at is not null
        and signup_password_hash is null
        and password_set_at is null
      when 'legacy_email_verified' then
        signup_password_hash is null
        and password_set_at is null
      else false
    end
  );

comment on column public.checkout_intents.identity_mode is
  'Immutable payment identity path: password-backed new account, pre-authenticated existing account, or pre-migration email proof.';
comment on column public.checkout_intents.identity_authorized_at is
  'Time at which the selected identity path was authorized; it is not an email-verification claim for password-backed checkout.';
comment on column public.checkout_intents.signup_password_hash is
  'Temporary bcrypt verifier for a new post-payment Auth account; service-role only and erased atomically on successful provisioning.';
comment on column public.checkout_intents.password_set_at is
  'Set atomically when a password-backed checkout reaches provisioned; null for existing and legacy identities.';

create or replace function public.protect_checkout_password_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_binding_changed boolean;
  legacy_verification_transition boolean;
  legacy_verification_binding boolean;
begin
  -- Compatibility for checkout links issued before this migration and for a
  -- short rolling-deployment window. Only the legacy mode may derive its
  -- authorization timestamp from the historical email proof.
  if new.identity_mode = 'legacy_email_verified'
     and new.identity_authorized_at is null
     and new.email_verified_at is not null then
    new.identity_authorized_at := new.email_verified_at;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  auth_binding_changed := new.auth_user_id is distinct from old.auth_user_id;
  legacy_verification_transition :=
    old.identity_mode = 'legacy_email_verified'
    and old.status = 'draft'
    and new.status = 'email_verified'
    and old.auth_user_id is null
    and old.stripe_checkout_session_id is null
    and new.stripe_checkout_session_id is null
    and old.paid_at is null
    and new.paid_at is null
    and old.email_verification_token_hash is not null
    and new.email_verification_token_hash is null
    and old.email_verified_at is null
    and new.email_verified_at is not null
    and new.identity_authorized_at is not null
    and new.signup_password_hash is null
    and new.password_set_at is null
    and (
      new.auth_user_id is null
      or exists (
        select 1
        from auth.users auth_user
        where auth_user.id = new.auth_user_id
          and lower(auth_user.email) = new.email
          and auth_user.email_confirmed_at is not null
      )
    );
  legacy_verification_binding :=
    legacy_verification_transition
    and new.auth_user_id is not null;

  -- The checkout identity is selected once, at INSERT. A service-code bug must
  -- not be able to swap the buyer, password verifier, or identity path even
  -- before Stripe is opened. The sole rollout exception is an exact legacy
  -- verification-link transition created by the pre-migration flow.
  if new.email is distinct from old.email
     or new.first_name is distinct from old.first_name
     or new.last_name is distinct from old.last_name
     or new.identity_mode is distinct from old.identity_mode
     or (
       not legacy_verification_transition
       and (
         new.email_verification_token_hash is distinct from old.email_verification_token_hash
         or new.email_verified_at is distinct from old.email_verified_at
         or new.identity_authorized_at is distinct from old.identity_authorized_at
       )
     ) then
    raise exception 'Checkout identity authorization is immutable'
      using errcode = '23514';
  end if;

  -- A pre-authenticated account is the account captured before Stripe opens;
  -- it may never be replaced. Clearing it remains possible for an Auth-user
  -- deletion; an intent without its prebound account cannot be acquired.
  if auth_binding_changed
     and old.identity_mode = 'existing_authenticated'
     and new.auth_user_id is not null then
    raise exception 'Authenticated checkout account binding is immutable'
      using errcode = '23514';
  end if;

  -- New and legacy-new users may be bound only during provisioning and only
  -- when Supabase Auth carries the exact server-only checkout provenance.
  if auth_binding_changed
     and old.identity_mode in ('new_account_password', 'legacy_email_verified')
     and not (old.status = 'provisioned' and new.auth_user_id is null) then
    if not legacy_verification_binding then
      if old.auth_user_id is not null
         or new.auth_user_id is null
         or new.status <> 'provisioning'
         or not exists (
           select 1
           from auth.users auth_user
           where auth_user.id = new.auth_user_id
             and lower(auth_user.email) = new.email
             and auth_user.email_confirmed_at is not null
             and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = new.id::text
         ) then
        raise exception 'Checkout-created Auth account provenance is invalid'
          using errcode = '23514';
      end if;
    end if;
  end if;

  -- Password evidence is immutable from INSERT. On the successful transition
  -- below the trigger itself erases the verifier and stamps password_set_at.
  if new.signup_password_hash is distinct from old.signup_password_hash
     or new.password_set_at is distinct from old.password_set_at then
    raise exception 'Checkout password evidence is immutable'
      using errcode = '23514';
  end if;

  if old.status <> 'provisioned'
     and new.status = 'provisioned'
     and new.identity_mode = 'new_account_password' then
    if old.signup_password_hash is null
       or old.password_set_at is not null
       or new.signup_password_hash is distinct from old.signup_password_hash
       or new.password_set_at is distinct from old.password_set_at
       or new.auth_user_id is null
       or not exists (
         select 1
         from auth.users auth_user
         where auth_user.id = new.auth_user_id
           and lower(auth_user.email) = new.email
           and auth_user.email_confirmed_at is not null
           and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = new.id::text
       ) then
      raise exception 'Password-backed checkout cannot be finalized safely'
        using errcode = '23514';
    end if;
    new.signup_password_hash := null;
    new.password_set_at := timezone('utc', now());
  end if;

  return new;
end;
$$;

create trigger checkout_intents_password_identity_guard
before insert or update of
  email,
  first_name,
  last_name,
  email_verification_token_hash,
  identity_mode,
  identity_authorized_at,
  signup_password_hash,
  password_set_at,
  email_verified_at,
  auth_user_id,
  stripe_checkout_session_id,
  paid_at,
  status
on public.checkout_intents
for each row execute function public.protect_checkout_password_identity();

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
     or expected_browser_token_hash is null
     or expected_browser_token_hash !~ '^[a-f0-9]{64}$'
     or requested_lease_token is null
     or lease_ttl_seconds is null
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
  update public.checkout_intents intent
  set status = 'expired',
      preparation_lease_token = null,
      preparation_lease_expires_at = null
  where intent.id <> target_intent_id
    and intent.email = target_email
    and intent.course_id = target_course_id
    and intent.paid_at is null
    and intent.status in ('processing', 'open')
    and intent.expires_at <= timezone('utc', now());
  update public.checkout_intents intent
  set status = 'processing',
      preparation_lease_token = requested_lease_token,
      preparation_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where intent.id = target_intent_id
    and intent.browser_token_hash = expected_browser_token_hash
    and intent.identity_authorized_at is not null
    and intent.status in ('ready', 'email_verified', 'open', 'processing')
    and intent.expires_at > timezone('utc', now())
    and (
      intent.preparation_lease_expires_at is null
      or intent.preparation_lease_expires_at <= timezone('utc', now())
      or intent.preparation_lease_token = requested_lease_token
    )
    and (
      (
        intent.identity_mode = 'new_account_password'
        and intent.auth_user_id is null
        and intent.signup_password_hash is not null
        and intent.password_set_at is null
        and not exists (
          select 1
          from auth.users auth_user
          where lower(auth_user.email) = intent.email
        )
      )
      or (
        intent.identity_mode = 'existing_authenticated'
        and intent.auth_user_id is not null
        and intent.signup_password_hash is null
        and exists (
          select 1
          from auth.users auth_user
          where auth_user.id = intent.auth_user_id
            and lower(auth_user.email) = intent.email
            and auth_user.email_confirmed_at is not null
        )
      )
      or (
        intent.identity_mode = 'legacy_email_verified'
        and intent.email_verified_at is not null
      )
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
        when paid_at is null
             and status = 'processing'
             and stripe_checkout_session_id is null then
          case
            when identity_mode = 'legacy_email_verified' then 'email_verified'
            else 'ready'
          end
        when paid_at is null
             and status = 'processing'
             and stripe_checkout_session_id is not null then 'open'
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
     or billing_fingerprint is null
     or billing_fingerprint !~ '^[a-f0-9]{64}$'
     or total_amount is null or total_amount < 0
     or total_tax is null or total_tax < 0
     or currency_code is null
     or lower(currency_code) !~ '^[a-z]{3}$' then
    raise exception 'Paid checkout intent evidence is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;

  if target.id is null
     or target.identity_authorized_at is null
     or target.identity_mode not in (
       'new_account_password',
       'existing_authenticated',
       'legacy_email_verified'
     )
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

  if target.paid_at is null
     and not (
       (
         target.identity_mode = 'new_account_password'
         and target.auth_user_id is null
         and target.signup_password_hash is not null
         and target.password_set_at is null
       )
       or (
         target.identity_mode = 'existing_authenticated'
         and target.auth_user_id is not null
         and target.signup_password_hash is null
         and target.password_set_at is null
       )
       or (
         target.identity_mode = 'legacy_email_verified'
         and target.email_verified_at is not null
       )
     ) then
    raise exception 'Checkout identity is not authorized for paid evidence' using errcode = '23514';
  end if;

  if target.paid_at is not null then
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
     or lease_ttl_seconds is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout provisioning lease input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  update public.checkout_intents intent
  set status = 'provisioning',
      provisioning_lease_token = requested_lease_token,
      provisioning_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where intent.id = target_intent_id
    and intent.paid_at is not null
    and intent.identity_authorized_at is not null
    and intent.status in ('paid', 'provisioning')
    and (
      intent.status = 'paid'
      or intent.provisioning_lease_expires_at is null
      or intent.provisioning_lease_expires_at <= timezone('utc', now())
      or intent.provisioning_lease_token = requested_lease_token
    )
    and (
      (
        intent.identity_mode = 'new_account_password'
        and intent.signup_password_hash is not null
        and intent.password_set_at is null
        and (
          intent.auth_user_id is null
          or exists (
            select 1
            from auth.users auth_user
            where auth_user.id = intent.auth_user_id
              and lower(auth_user.email) = intent.email
              and auth_user.email_confirmed_at is not null
              and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = intent.id::text
          )
        )
      )
      or (
        intent.identity_mode = 'existing_authenticated'
        and intent.auth_user_id is not null
        and exists (
          select 1
          from auth.users auth_user
          where auth_user.id = intent.auth_user_id
            and lower(auth_user.email) = intent.email
            and auth_user.email_confirmed_at is not null
        )
      )
      or (
        intent.identity_mode = 'legacy_email_verified'
        and intent.email_verified_at is not null
      )
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
  where intent.identity_mode in ('new_account_password', 'legacy_email_verified')
    and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target_intent_id::text;
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
  target public.checkout_intents%rowtype;
  valid_binding boolean;
begin
  if target_intent_id is null
     or requested_lease_token is null
     or provisioned_user_id is null then
    raise exception 'Checkout Auth binding input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;

  if target.id is null
     or target.status <> 'provisioning'
     or target.provisioning_lease_token is distinct from requested_lease_token
     or target.provisioning_lease_expires_at is null
     or target.provisioning_lease_expires_at <= timezone('utc', now()) then
    return false;
  end if;

  select exists (
    select 1
    from auth.users auth_user
    where auth_user.id = provisioned_user_id
      and lower(auth_user.email) = target.email
      and auth_user.email_confirmed_at is not null
      and (
        (
          target.identity_mode = 'existing_authenticated'
          and target.auth_user_id = auth_user.id
        )
        or (
          target.identity_mode = 'new_account_password'
          and (target.auth_user_id is null or target.auth_user_id = auth_user.id)
          and target.signup_password_hash is not null
          and target.password_set_at is null
          and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target.id::text
        )
        or (
          target.identity_mode = 'legacy_email_verified'
          and target.email_verified_at is not null
          and (
            target.auth_user_id = auth_user.id
            or (
              target.auth_user_id is null
              and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target.id::text
            )
          )
        )
      )
  ) into valid_binding;
  if not valid_binding then
    raise exception 'Provisioned Auth user does not match checkout identity authority'
      using errcode = '23514';
  end if;

  update public.checkout_intents
  set auth_user_id = provisioned_user_id
  where id = target.id
    and status = 'provisioning'
    and provisioning_lease_token = requested_lease_token
    and provisioning_lease_expires_at > timezone('utc', now())
    and (auth_user_id is null or auth_user_id = provisioned_user_id);
  return found;
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
     or expected_browser_token_hash is null
     or expected_browser_token_hash !~ '^[a-f0-9]{64}$'
     or requested_lease_token is null
     or lease_ttl_seconds is null
     or lease_ttl_seconds not between 30 and 300 then
    raise exception 'Checkout bootstrap lease input is invalid' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  update public.checkout_intents intent
  set bootstrap_lease_token = requested_lease_token,
      bootstrap_lease_expires_at = timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
  where intent.id = target_intent_id
    and intent.browser_token_hash = expected_browser_token_hash
    and intent.status = 'provisioned'
    and intent.auth_user_id is not null
    and intent.bootstrap_consumed_at is null
    and intent.expires_at > timezone('utc', now())
    and (
      intent.bootstrap_lease_expires_at is null
      or intent.bootstrap_lease_expires_at <= timezone('utc', now())
      or intent.bootstrap_lease_token = requested_lease_token
    )
    and (
      (
        intent.identity_mode = 'new_account_password'
        and intent.signup_password_hash is null
        and intent.password_set_at is not null
        and exists (
          select 1
          from auth.users auth_user
          where auth_user.id = intent.auth_user_id
            and lower(auth_user.email) = intent.email
            and auth_user.email_confirmed_at is not null
            and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = intent.id::text
        )
      )
      or (
        intent.identity_mode = 'legacy_email_verified'
        and intent.email_verified_at is not null
        and exists (
          select 1
          from auth.users auth_user
          where auth_user.id = intent.auth_user_id
            and lower(auth_user.email) = intent.email
            and auth_user.email_confirmed_at is not null
        )
      )
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
    and bootstrap_consumed_at is null
    and status = 'provisioned'
    and identity_mode in ('new_account_password', 'legacy_email_verified');
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
  identity_matches boolean;
begin
  if target_intent_id is null
     or expected_browser_token_hash is null
     or expected_browser_token_hash !~ '^[a-f0-9]{64}$'
     or authenticated_user_id is null then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('checkout-intent:' || target_intent_id::text, 0));
  select * into target
  from public.checkout_intents
  where id = target_intent_id
  for update;
  if target.id is null
     or target.browser_token_hash is distinct from expected_browser_token_hash
     or target.status <> 'provisioned'
     or target.auth_user_id is distinct from authenticated_user_id
     or target.expires_at <= timezone('utc', now()) then
    return false;
  end if;

  select exists (
    select 1
    from auth.users auth_user
    where auth_user.id = authenticated_user_id
      and lower(auth_user.email) = target.email
      and auth_user.email_confirmed_at is not null
      and (
        (
          target.identity_mode = 'new_account_password'
          and target.signup_password_hash is null
          and target.password_set_at is not null
          and auth_user.raw_app_meta_data ->> 'checkout_intent_id' = target.id::text
        )
        or (
          target.identity_mode = 'existing_authenticated'
          and target.auth_user_id = auth_user.id
          and target.signup_password_hash is null
          and target.password_set_at is null
        )
        or (
          target.identity_mode = 'legacy_email_verified'
          and target.email_verified_at is not null
        )
      )
  ) into identity_matches;
  if not identity_matches then
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
    and status in (
      'draft', 'ready', 'email_verified', 'open', 'processing', 'failed', 'expired'
    )
    and expires_at < timezone('utc', now()) - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.protect_checkout_password_identity() from public, anon, authenticated;
revoke execute on function public.acquire_checkout_intent_preparation(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_checkout_intent_preparation(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_paid_checkout_intent(uuid, text, text, text, text, text, text, bigint, text, bigint) from public, anon, authenticated;
revoke execute on function public.claim_checkout_intent_provisioning(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.find_checkout_intent_auth_user(uuid) from public, anon, authenticated;
revoke execute on function public.bind_checkout_intent_auth_user(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.claim_checkout_intent_bootstrap(uuid, text, uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_checkout_intent_bootstrap(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.consume_checkout_intent_bootstrap(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.purge_expired_unpaid_checkout_intents() from public, anon, authenticated;

grant execute on function public.acquire_checkout_intent_preparation(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_checkout_intent_preparation(uuid, uuid) to service_role;
grant execute on function public.record_paid_checkout_intent(uuid, text, text, text, text, text, text, bigint, text, bigint) to service_role;
grant execute on function public.claim_checkout_intent_provisioning(uuid, uuid, integer) to service_role;
grant execute on function public.find_checkout_intent_auth_user(uuid) to service_role;
grant execute on function public.bind_checkout_intent_auth_user(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_checkout_intent_bootstrap(uuid, text, uuid, integer) to service_role;
grant execute on function public.release_checkout_intent_bootstrap(uuid, uuid) to service_role;
grant execute on function public.consume_checkout_intent_bootstrap(uuid, text, uuid) to service_role;
grant execute on function public.purge_expired_unpaid_checkout_intents() to service_role;

commit;
