-- A durable course completion keeps every published lesson replayable, even
-- after the editorial course version changes. The immutable completion
-- snapshot is the authority; ordinary active enrollments still follow the
-- sequential quiz prerequisite chain.

begin;

create or replace function public.lesson_is_unlocked(
  check_user_id uuid,
  check_lesson_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons target
    join public.courses course on course.id = target.course_id
    join public.enrollments enrollment
      on enrollment.course_id = target.course_id
     and enrollment.user_id = check_user_id
     and enrollment.status in ('active', 'completed')
    where target.id = check_lesson_id
      and target.status = 'published'
      and (
        exists (
          select 1
          from public.course_completion_snapshots snapshot
          where snapshot.user_id = check_user_id
            and snapshot.course_id = target.course_id
        )
        or not exists (
          select 1
          from public.lessons previous
          where previous.course_id = target.course_id
            and previous.position < target.position
            and previous.status = 'published'
            and not exists (
              select 1
              from public.lesson_progress progress
              where progress.user_id = check_user_id
                and progress.lesson_id = previous.id
                and (
                  progress.legacy_completed
                  or (
                    progress.course_version = course.version
                    and progress.video_completed
                    and progress.quiz_passed
                  )
                )
            )
        )
      )
  );
$$;

-- Close the API-to-RPC race for a new quiz submission. Once the attempt has
-- resolved its course, take the same user/course advisory lock used by Stripe
-- before touching the enrollment row. The attempt row may be locked first:
-- payment paths never lock quiz attempts, and completion evidence only reads
-- them without a row lock. The advisory lock is re-entrant when the optional
-- completion snapshot is recorded later in this transaction.
create or replace function public.submit_quiz_attempt(
  submitting_user_id uuid,
  target_attempt_id uuid,
  submitted_answers jsonb
)
returns table(score smallint, passed boolean, already_submitted boolean, course_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_attempt public.quiz_attempts%rowtype;
  locked_enrollment public.enrollments%rowtype;
  answer_count integer;
  correct_count integer;
  completed_now boolean;
  attempt_course_id uuid;
  current_course_version text;
  current_progress public.lesson_progress%rowtype;
begin
  select * into locked_attempt
  from public.quiz_attempts
  where id = target_attempt_id
  for update;

  if locked_attempt.id is null or locked_attempt.user_id <> submitting_user_id then
    raise exception 'Quiz attempt not found' using errcode = 'P0002';
  end if;

  select lesson.course_id, course.version
    into strict attempt_course_id, current_course_version
  from public.lessons lesson
  join public.courses course on course.id = lesson.course_id
  where lesson.id = locked_attempt.lesson_id
  for share of course;

  perform pg_advisory_xact_lock(
    hashtextextended(submitting_user_id::text || ':' || attempt_course_id::text, 0)
  );

  select * into locked_enrollment
  from public.enrollments enrollment
  where enrollment.user_id = submitting_user_id
    and enrollment.course_id = attempt_course_id
    and enrollment.status in ('active', 'completed')
  order by enrollment.created_at desc
  limit 1
  for update;

  if locked_enrollment.id is null then
    raise exception 'Active enrollment is required' using errcode = '42501';
  end if;

  -- A retry of the exact attempt is read-only and remains idempotent after
  -- course completion or a later editorial course-version change.
  if locked_attempt.submitted_at is not null then
    select exists (
      select 1
      from public.course_completion_snapshots snapshot
      where snapshot.user_id = submitting_user_id
        and snapshot.course_id = attempt_course_id
    ) into completed_now;
    return query
    select locked_attempt.score, locked_attempt.passed, true, completed_now;
    return;
  end if;

  if locked_enrollment.status <> 'active'
     or locked_enrollment.completed_course_version is not null
     or exists (
       select 1
       from public.course_completion_snapshots snapshot
       where snapshot.user_id = submitting_user_id
         and snapshot.course_id = attempt_course_id
     ) then
    raise exception 'Course completion is immutable' using errcode = '23514';
  end if;

  if locked_attempt.course_version is distinct from current_course_version then
    raise exception 'Quiz attempt belongs to another course version' using errcode = '23514';
  end if;

  select progress.* into current_progress
  from public.lesson_progress progress
  where progress.user_id = submitting_user_id
    and progress.lesson_id = locked_attempt.lesson_id
  for update;
  if current_progress.id is null
     or current_progress.course_version is distinct from current_course_version
     or not current_progress.video_completed then
    raise exception 'Current-version video evidence is required' using errcode = '23514';
  end if;

  if jsonb_typeof(submitted_answers) <> 'array' then
    raise exception 'Answers must be an array' using errcode = '22023';
  end if;

  with answers as (
    select (value ->> 'questionId')::uuid as question_id,
           (value ->> 'optionId')::uuid as option_id
    from jsonb_array_elements(submitted_answers)
  )
  select count(*), count(distinct question_id)
    into answer_count, correct_count
  from answers;

  if answer_count <> 5 or correct_count <> 5 then
    raise exception 'Exactly five distinct answers are required' using errcode = '22023';
  end if;

  if exists (
    with answers as (
      select (value ->> 'questionId')::uuid as question_id,
             (value ->> 'optionId')::uuid as option_id
      from jsonb_array_elements(submitted_answers)
    )
    select 1 from answers answer
    left join public.quiz_options option
      on option.id = answer.option_id and option.question_id = answer.question_id
    where option.id is null
       or not (answer.question_id = any(locked_attempt.question_order))
       or not coalesce(
         (locked_attempt.option_order -> (answer.question_id::text)) @> to_jsonb(answer.option_id::text),
         false
       )
  ) then
    raise exception 'An answer does not belong to this attempt' using errcode = '22023';
  end if;

  insert into public.quiz_responses(
    attempt_id, question_id, selected_option_id, is_correct_snapshot
  )
  select locked_attempt.id, answer.question_id, answer.option_id,
         locked_attempt.answer_key ->> answer.question_id::text = answer.option_id::text
  from (
    select (value ->> 'questionId')::uuid as question_id,
           (value ->> 'optionId')::uuid as option_id
    from jsonb_array_elements(submitted_answers)
  ) answer
  join public.quiz_options option
    on option.id = answer.option_id and option.question_id = answer.question_id;

  select count(*) filter (where is_correct_snapshot)::smallint into correct_count
  from public.quiz_responses
  where attempt_id = locked_attempt.id;

  update public.quiz_attempts
  set submitted_at = timezone('utc', now()),
      score = correct_count,
      passed = correct_count >= 4
  where id = locked_attempt.id;

  update public.lesson_progress
  set quiz_passed = quiz_passed or correct_count >= 4,
      completed_at = case
        when video_completed and (quiz_passed or correct_count >= 4)
          then coalesce(completed_at, timezone('utc', now()))
        else completed_at
      end
  where user_id = submitting_user_id
    and lesson_id = locked_attempt.lesson_id
    and course_version = current_course_version;

  completed_now := public.certificate_evidence_eligibility(
    submitting_user_id,
    attempt_course_id,
    current_course_version
  );

  if completed_now then
    perform public.record_course_completion_snapshot(
      submitting_user_id,
      attempt_course_id,
      current_course_version
    );
  end if;

  return query
  select correct_count::smallint, correct_count >= 4, false, completed_now;
end;
$$;

revoke execute on function public.lesson_is_unlocked(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.lesson_is_unlocked(uuid, uuid)
to service_role;

revoke execute on function public.submit_quiz_attempt(uuid, uuid, jsonb)
from public, anon, authenticated;
grant execute on function public.submit_quiz_attempt(uuid, uuid, jsonb)
to service_role;

comment on function public.lesson_is_unlocked(uuid, uuid) is
  'Enforces sequential learning until completion; a durable completion snapshot permanently unlocks published lesson replay.';

commit;
