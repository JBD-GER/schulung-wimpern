-- Admin authority is granted only by service-controlled rows in user_roles.
-- RLS already blocks learner writes; explicit grants also remove table-level
-- mutation and TRUNCATE privileges from browser roles.

revoke all on table public.user_roles from public, anon, authenticated;

-- RLS protects rows, but it does not protect table-level operations such as
-- TRUNCATE. Learners only read these relations directly; every write is routed
-- through server-side service code or tightly scoped RPCs.
revoke all on table
  public.profiles,
  public.courses,
  public.orders,
  public.enrollments,
  public.lesson_progress,
  public.certificates,
  public.consent_records,
  public.data_requests
from public, anon, authenticated;

grant select on table public.courses to anon, authenticated;
grant select on table
  public.profiles,
  public.user_roles,
  public.orders,
  public.enrollments,
  public.lesson_progress,
  public.certificates,
  public.consent_records,
  public.data_requests
to authenticated;
