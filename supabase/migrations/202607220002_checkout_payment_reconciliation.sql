-- Independent recovery for Stripe payments whose webhook and browser return
-- were both delayed or lost. The timestamp throttles remote Stripe lookups;
-- paid evidence is still recorded only by the existing strict reconciler.

begin;

alter table public.checkout_intents
  add column if not exists payment_reconciliation_checked_at timestamptz;

comment on column public.checkout_intents.payment_reconciliation_checked_at is
  'Last independent Stripe status check for an unpaid open checkout; used only to throttle the recovery cron.';

create index if not exists checkout_intents_payment_reconciliation_idx
  on public.checkout_intents(
    payment_reconciliation_checked_at asc nulls first,
    updated_at asc
  )
  where paid_at is null
    and stripe_checkout_session_id is not null
    and status in ('open', 'processing');

commit;
