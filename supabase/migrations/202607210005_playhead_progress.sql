-- Seeking is intentionally allowed. Learning progress therefore represents the
-- furthest playhead position reached for the current course version.

begin;

drop function if exists public.record_video_progress(uuid, uuid, uuid, jsonb, integer, numeric);

create or replace function public.record_video_progress(
  progressing_user_id uuid,
  access_session_id uuid,
  target_lesson_id uuid,
  reported_position numeric
)
returns table(watched_seconds integer, video_completed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_session public.video_access_sessions%rowtype;
  target_lesson public.lessons%rowtype;
  prior_progress public.lesson_progress%rowtype;
  current_course_version text;
  furthest_position integer;
  completed boolean;
  normalized_ranges jsonb;
begin
  select * into locked_session
  from public.video_access_sessions
  where id = access_session_id
  for update;

  if locked_session.id is null
     or locked_session.user_id <> progressing_user_id
     or locked_session.lesson_id <> target_lesson_id
     or locked_session.revoked_at is not null
     or locked_session.expires_at <= timezone('utc', now()) then
    raise exception 'Video access session is invalid' using errcode = '42501';
  end if;

  select course.version into strict current_course_version
  from public.courses course
  join public.lessons lesson on lesson.course_id = course.id
  where lesson.id = target_lesson_id
  for share of course;

  select * into strict target_lesson
  from public.lessons
  where id = target_lesson_id;

  if locked_session.course_version is distinct from current_course_version
     or target_lesson.status <> 'published'
     or reported_position is null
     or reported_position < 0
     or reported_position > target_lesson.duration_seconds then
    raise exception 'Invalid progress values' using errcode = '22023';
  end if;

  -- Serialize both the initial insert and concurrent updates for this lesson.
  perform pg_advisory_xact_lock(
    hashtextextended(progressing_user_id::text || ':' || target_lesson_id::text, 0)
  );

  select * into prior_progress
  from public.lesson_progress
  where user_id = progressing_user_id and lesson_id = target_lesson_id
  for update;

  furthest_position := least(
    target_lesson.duration_seconds,
    greatest(
      case
        when prior_progress.id is not null
         and prior_progress.course_version = current_course_version
          then prior_progress.watched_seconds
        else 0
      end,
      ceil(reported_position)::integer
    )
  );
  completed := furthest_position::numeric / target_lesson.duration_seconds
    >= target_lesson.watch_threshold;
  normalized_ranges := case
    when furthest_position > 0 then jsonb_build_array(
      jsonb_build_object('start', 0, 'end', furthest_position)
    )
    else '[]'::jsonb
  end;

  insert into public.lesson_progress(
    user_id, lesson_id, course_version, watched_ranges, watched_seconds, video_completed
  ) values (
    progressing_user_id, target_lesson_id, current_course_version,
    normalized_ranges, furthest_position, completed
  )
  on conflict (user_id, lesson_id) do update set
    course_version = excluded.course_version,
    watched_ranges = excluded.watched_ranges,
    watched_seconds = excluded.watched_seconds,
    video_completed = (
      public.lesson_progress.course_version = excluded.course_version
      and public.lesson_progress.video_completed
    ) or excluded.video_completed,
    quiz_passed = case
      when public.lesson_progress.course_version = excluded.course_version
        then public.lesson_progress.quiz_passed
      else false
    end,
    completed_at = case
      when public.lesson_progress.course_version <> excluded.course_version
        or public.lesson_progress.course_version is null then null
      when public.lesson_progress.quiz_passed and excluded.video_completed
        then coalesce(public.lesson_progress.completed_at, timezone('utc', now()))
      else public.lesson_progress.completed_at
    end,
    started_at = case
      when public.lesson_progress.course_version = excluded.course_version
        then public.lesson_progress.started_at
      else timezone('utc', now())
    end;

  update public.video_access_sessions
  set reported_seconds = greatest(
        reported_seconds,
        greatest(furthest_position - watched_seconds_at_start, 0)
      ),
      last_reported_at = timezone('utc', now()),
      last_position = greatest(coalesce(last_position, 0), reported_position)
  where id = access_session_id;

  return query
  select progress.watched_seconds, progress.video_completed
  from public.lesson_progress progress
  where progress.user_id = progressing_user_id
    and progress.lesson_id = target_lesson_id;
end;
$$;

revoke all on function public.record_video_progress(uuid, uuid, uuid, numeric)
from public, anon, authenticated;
grant execute on function public.record_video_progress(uuid, uuid, uuid, numeric)
to service_role;

comment on function public.record_video_progress(uuid, uuid, uuid, numeric) is
  'Records the furthest playhead reached for a version-bound video session; seeking is allowed.';

commit;
