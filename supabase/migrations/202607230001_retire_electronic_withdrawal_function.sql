-- Retire the former public electronic withdrawal flow without altering or
-- deleting any evidence that may already have been recorded.

begin;

drop function if exists public.record_electronic_withdrawal(text, text, text, text);

comment on table public.withdrawal_requests is
  'Immutable historical evidence from the retired electronic withdrawal flow; no new application writes are permitted.';

commit;

select 'OK: Die elektronische Widerrufs-Schreibfunktion wurde deaktiviert; historische Nachweise bleiben erhalten.'
  as migration_status;
