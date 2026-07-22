-- Repair checkout preparation locking for databases where the original
-- password-checkout migration was already recorded before its recovery logic
-- was hardened. Keep this additive: editing an applied migration alone does
-- not update existing Supabase projects.

begin;

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

  perform pg_advisory_xact_lock(
    hashtextextended('checkout-intent:' || target_intent_id::text, 0)
  );

  select email, course_id into target_email, target_course_id
  from public.checkout_intents
  where id = target_intent_id
    and browser_token_hash = expected_browser_token_hash;

  if target_email is null or target_course_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'checkout-payment:' || target_email || ':' || target_course_id::text,
      0
    )
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
    and (
      intent.expires_at <= timezone('utc', now())
      or (
        intent.status = 'processing'
        and intent.stripe_checkout_session_id is null
        and intent.preparation_lease_expires_at is not null
        and intent.preparation_lease_expires_at <= timezone('utc', now())
      )
    );

  -- Return a controlled conflict instead of leaking a partial-unique-index
  -- violation. The API can inspect/reconcile the sibling Stripe session and
  -- retry without risking a second payment session.
  if exists (
    select 1
    from public.checkout_intents sibling
    where sibling.id <> target_intent_id
      and sibling.email = target_email
      and sibling.course_id = target_course_id
      and sibling.status in ('processing', 'open', 'paid', 'provisioning')
  ) then
    return false;
  end if;

  update public.checkout_intents intent
  set status = 'processing',
      preparation_lease_token = requested_lease_token,
      preparation_lease_expires_at =
        timezone('utc', now()) + make_interval(secs => lease_ttl_seconds)
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

-- Recreate the guard as part of the repair in case a manual, interrupted run
-- created the columns but stopped before installing the trigger.
drop trigger if exists checkout_intents_password_identity_guard
on public.checkout_intents;

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

revoke execute on function public.acquire_checkout_intent_preparation(
  uuid,
  text,
  uuid,
  integer
) from public, anon, authenticated;

grant execute on function public.acquire_checkout_intent_preparation(
  uuid,
  text,
  uuid,
  integer
) to service_role;

commit;
