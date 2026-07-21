-- Final certificate content is evidence and must never follow later profile or
-- course edits. Only the one-way valid -> revoked status transition remains
-- permitted; verified legacy references may still create their first row.

begin;

create or replace function public.freeze_finalized_certificate_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('valid', 'revoked', 'archived') then
      raise exception 'Finalized certificate rows cannot be deleted'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if new.status in ('valid', 'revoked', 'archived')
     and new.replaces_certificate_id is not null then
    raise exception 'Finalized certificates cannot replace prior certificates'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.status in ('valid', 'revoked', 'archived') then
    if row(
      new.id,
      new.user_id,
      new.course_id,
      new.certificate_number,
      new.course_version,
      new.participant_name,
      new.file_key,
      new.file_sha256,
      new.completion_snapshot_id,
      new.replaces_certificate_id,
      new.legacy_review_id,
      new.issued_at,
      new.created_at
    ) is distinct from row(
      old.id,
      old.user_id,
      old.course_id,
      old.certificate_number,
      old.course_version,
      old.participant_name,
      old.file_key,
      old.file_sha256,
      old.completion_snapshot_id,
      old.replaces_certificate_id,
      old.legacy_review_id,
      old.issued_at,
      old.created_at
    ) then
      raise exception 'Finalized certificate content is immutable'
        using errcode = '23514';
    end if;

    if old.status = 'valid' then
      if new.status not in ('valid', 'revoked') then
        raise exception 'A valid certificate can only be revoked'
          using errcode = '23514';
      end if;
      if new.status = 'valid'
         and new.revoked_at is distinct from old.revoked_at then
        raise exception 'Revocation evidence requires revoked status'
          using errcode = '23514';
      end if;
      if new.status = 'revoked' and new.revoked_at is null then
        raise exception 'A revoked certificate requires a revocation timestamp'
          using errcode = '23514';
      end if;
    elsif new.status is distinct from old.status
       or new.revoked_at is distinct from old.revoked_at then
      raise exception 'A finalized certificate status cannot be restored'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists certificates_freeze_finalized_content
  on public.certificates;
create trigger certificates_freeze_finalized_content
before insert or update or delete on public.certificates
for each row execute function public.freeze_finalized_certificate_content();

revoke all on function public.freeze_finalized_certificate_content()
from public, anon, authenticated;

commit;
