# Quiz-Freigabe

`seed.sql` setzt alle 35 Fragen absichtlich auf `draft`. Das ist auch in lokalen
Umgebungen der sichere Standard. Vor einer Freigabe müssen die Fragen und
Lösungsschlüssel gegen die sieben Originalvideos geprüft werden.

Für einen lokalen End-to-End-Test kann ein als `admin` eingetragener Supabase-
Benutzer die Fragen nach der Prüfung mit folgendem SQL freigeben. `<ADMIN_UUID>`
muss durch dessen `auth.users.id` ersetzt werden:

```sql
begin;

insert into public.user_roles (user_id, role)
values ('<ADMIN_UUID>'::uuid, 'admin')
on conflict do nothing;

update public.quiz_questions question
set status = 'approved',
    approved_at = timezone('utc', now()),
    approved_by = '<ADMIN_UUID>'::uuid
from public.lessons lesson
join public.courses course on course.id = lesson.course_id
where question.lesson_id = lesson.id
  and course.slug = 'online-schulung-wimpernverlaengerung';

select public.assert_course_quiz_publishable(
  (select id from public.courses where slug = 'online-schulung-wimpernverlaengerung')
);

commit;
```

Der Approval-Trigger lehnt eine Freigabe ab, sobald eine Frage nicht genau vier
Optionen oder nicht genau eine richtige Option besitzt. Dieses Verfahren darf
nicht automatisiert im Produktions-Deployment ausgeführt werden.
