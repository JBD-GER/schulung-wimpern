export type VersionedLearningProgress = {
  course_version: string | null;
  watched_seconds: number;
  video_completed: boolean;
  quiz_passed: boolean;
  legacy_completed: boolean;
};

export function progressForCourseVersion<T extends VersionedLearningProgress>(
  progress: T | null | undefined,
  currentCourseVersion: string,
): T | null {
  if (!progress) return null;
  if (progress.course_version === currentCourseVersion) return progress;
  if (!progress.legacy_completed) return null;

  return {
    ...progress,
    course_version: null,
    watched_seconds: 0,
    video_completed: false,
    quiz_passed: false,
    legacy_completed: true,
  };
}
