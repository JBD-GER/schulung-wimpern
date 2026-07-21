"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileText,
  FileUp,
  LoaderCircle,
  Save,
  Video,
} from "lucide-react";
import { AdminError, AdminLoading } from "@/components/admin/admin-state";
import { Button } from "@/components/ui/button";

type AdminLesson = {
  id: string;
  position: number;
  title: string;
  description: string;
  durationSeconds: number;
  streamVideoUid: string;
  status: string;
  materials: AdminMaterial[];
};

type AdminMaterial = {
  id: string;
  title: string;
  mimeType: string;
  position: number;
  status: "draft" | "published" | "archived";
};

type AdminCourse = {
  id: string;
  title: string;
  description: string;
  version: string;
  status: string;
  lessons: AdminLesson[];
};

function string(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseMaterial(value: unknown): AdminMaterial | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = string(item.id);
  if (!id) return null;
  const status = string(item.status);
  return {
    id,
    title: string(item.title),
    mimeType: string(item.mimeType ?? item.mime_type),
    position: numeric(item.position),
    status: status === "published" || status === "archived" ? status : "draft",
  };
}

function parseCourse(value: unknown): AdminCourse | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const courseRecord =
    root.course && typeof root.course === "object"
      ? (root.course as Record<string, unknown>)
      : root;
  const id = string(courseRecord.id);
  const lessonValues = Array.isArray(root.lessons)
    ? root.lessons
    : Array.isArray(courseRecord.lessons)
      ? courseRecord.lessons
      : [];
  if (!id) return null;
  const lessons = lessonValues
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const lesson = value as Record<string, unknown>;
      const lessonId = string(lesson.id);
      if (!lessonId) return [];
      return [
        {
          id: lessonId,
          position: numeric(lesson.position),
          title: string(lesson.title),
          description: string(lesson.description),
          durationSeconds: numeric(
            lesson.durationSeconds ?? lesson.duration_seconds,
          ),
          streamVideoUid: string(
            lesson.streamVideoUid ?? lesson.stream_video_uid,
          ),
          status: string(lesson.status) || "draft",
          materials: (Array.isArray(lesson.materials) ? lesson.materials : [])
            .map(parseMaterial)
            .filter((item): item is AdminMaterial => item !== null)
            .sort((a, b) => a.position - b.position),
        },
      ];
    })
    .sort((a, b) => a.position - b.position);
  return {
    id,
    title: string(courseRecord.title),
    description: string(courseRecord.description),
    version: string(courseRecord.version),
    status: string(courseRecord.status) || "draft",
    lessons,
  };
}

const inputStyles =
  "mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-navy focus:outline-none";

function responseMessage(body: unknown, fallback: string) {
  return body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).message === "string"
    ? String((body as Record<string, unknown>).message)
    : fallback;
}

function courseSaveValidationMessage(course: AdminCourse): string | null {
  const publishedWithoutVideo = course.lessons.find(
    (lesson) => lesson.status === "published" && !lesson.streamVideoUid.trim(),
  );
  if (publishedWithoutVideo) {
    return `Lektion ${publishedWithoutVideo.position} kann ohne Cloudflare Stream UID nicht veröffentlicht werden. Stelle sie während der Einrichtung auf „Entwurf“.`;
  }

  if (course.status !== "published") return null;
  if (course.lessons.some((lesson) => lesson.status !== "published")) {
    return "Für einen veröffentlichten Kurs müssen alle sieben Lektionen veröffentlicht sein.";
  }

  const videoUids = course.lessons
    .map((lesson) => lesson.streamVideoUid.trim())
    .filter(Boolean);
  if (videoUids.length !== 7 || new Set(videoUids).size !== 7) {
    return "Für einen veröffentlichten Kurs werden sieben unterschiedliche Cloudflare Stream UIDs benötigt.";
  }

  return null;
}

function MaterialManager({
  lesson,
  onChange,
}: {
  lesson: AdminLesson;
  onChange: (materials: AdminMaterial[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadStatus, setUploadStatus] = useState<"draft" | "published">(
    "draft",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminMaterial | null>(
    null,
  );
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );

  function replaceMaterial(material: AdminMaterial) {
    onChange(
      lesson.materials.map((item) =>
        item.id === material.id ? material : item,
      ),
    );
  }

  async function uploadMaterial() {
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, message: "Bitte wähle zuerst eine Datei aus." });
      return;
    }
    setBusy("upload");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("title", uploadTitle.trim() || file.name);
      form.set("status", uploadStatus);
      const response = await fetch(
        `/api/admin/lessons/${encodeURIComponent(lesson.id)}/materials`,
        {
          method: "POST",
          credentials: "same-origin",
          body: form,
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          responseMessage(
            body,
            "Das Material konnte nicht hochgeladen werden.",
          ),
        );
      const material = parseMaterial(
        body && typeof body === "object"
          ? (body as Record<string, unknown>).material
          : null,
      );
      if (!material) throw new Error("Die Materialantwort ist unvollständig.");
      onChange(
        [...lesson.materials, material].sort((a, b) => a.position - b.position),
      );
      setUploadTitle("");
      if (fileInput.current) fileInput.current.value = "";
      setResult({ ok: true, message: "Das Material wurde hochgeladen." });
    } catch (uploadError) {
      setResult({
        ok: false,
        message:
          uploadError instanceof Error
            ? uploadError.message
            : "Das Material konnte nicht hochgeladen werden.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function saveMaterial(material: AdminMaterial, archive = false) {
    setBusy(material.id);
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/materials/${encodeURIComponent(material.id)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: material.title,
            status: archive ? "archived" : material.status,
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          responseMessage(
            body,
            "Das Material konnte nicht gespeichert werden.",
          ),
        );
      const updated = parseMaterial(
        body && typeof body === "object"
          ? (body as Record<string, unknown>).material
          : null,
      );
      if (!updated) throw new Error("Die Materialantwort ist unvollständig.");
      replaceMaterial(updated);
      setArchiveTarget(null);
      setResult({
        ok: true,
        message: archive
          ? "Das Material wurde archiviert."
          : "Das Material wurde gespeichert.",
      });
    } catch (saveError) {
      setResult({
        ok: false,
        message:
          saveError instanceof Error
            ? saveError.message
            : "Das Material konnte nicht gespeichert werden.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function moveMaterial(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lesson.materials.length) return;
    const reordered = [...lesson.materials];
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    const positioned = reordered.map((item, itemIndex) => ({
      ...item,
      position: itemIndex + 1,
    }));
    setBusy("order");
    setResult(null);
    try {
      const response = await fetch(
        `/api/admin/lessons/${encodeURIComponent(lesson.id)}/materials/order`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            materialIds: positioned.map((item) => item.id),
          }),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          responseMessage(
            body,
            "Die Materialreihenfolge konnte nicht gespeichert werden.",
          ),
        );
      onChange(positioned);
      setResult({
        ok: true,
        message: "Die Materialreihenfolge wurde gespeichert.",
      });
    } catch (moveError) {
      setResult({
        ok: false,
        message:
          moveError instanceof Error
            ? moveError.message
            : "Die Materialreihenfolge konnte nicht gespeichert werden.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className="mt-5 rounded-xl bg-ivory p-4"
      aria-labelledby={`materials-${lesson.id}`}
    >
      <div className="flex items-start gap-2">
        <FileText
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-gold"
        />
        <div>
          <h4
            id={`materials-${lesson.id}`}
            className="text-sm font-bold text-navy"
          >
            Materialien
          </h4>
          <p className="mt-1 text-xs leading-5 text-muted">
            PDF, PNG, JPG, WebP oder Textdatei, maximal 20 MB.
          </p>
        </div>
      </div>
      {lesson.materials.length ? (
        <ol className="mt-4 space-y-3">
          {lesson.materials.map((material, index) => (
            <li
              key={material.id}
              className="rounded-xl border border-line bg-white p-3"
            >
              <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_10rem_auto] md:items-end">
                <label className="min-w-0 text-xs font-bold text-navy">
                  Titel
                  <input
                    className={inputStyles}
                    value={material.title}
                    onChange={(event) =>
                      replaceMaterial({
                        ...material,
                        title: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="text-xs font-bold text-navy">
                  Status
                  <select
                    className={inputStyles}
                    value={material.status}
                    onChange={(event) =>
                      replaceMaterial({
                        ...material,
                        status: event.target.value as AdminMaterial["status"],
                      })
                    }
                  >
                    <option value="draft">Entwurf</option>
                    <option value="published">Veröffentlicht</option>
                    <option value="archived">Archiviert</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void saveMaterial(material)}
                    disabled={busy !== null}
                  >
                    <Save aria-hidden="true" className="size-3.5" />
                    Speichern
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`${material.title} nach oben verschieben`}
                    title="Nach oben"
                    onClick={() => void moveMaterial(index, -1)}
                    disabled={busy !== null || index === 0}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`${material.title} nach unten verschieben`}
                    title="Nach unten"
                    onClick={() => void moveMaterial(index, 1)}
                    disabled={
                      busy !== null || index === lesson.materials.length - 1
                    }
                  >
                    <ArrowDown aria-hidden="true" className="size-4" />
                  </Button>
                  {material.status !== "archived" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`${material.title} archivieren`}
                      onClick={() => setArchiveTarget(material)}
                      disabled={busy !== null}
                    >
                      <Archive aria-hidden="true" className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-[0.7rem] text-muted">
                Position {material.position} ·{" "}
                {material.mimeType || "Dateityp nicht verfügbar"}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line bg-white p-4 text-center text-xs text-muted">
          Für diese Lektion sind noch keine Materialien hinterlegt.
        </p>
      )}
      <div className="mt-4 grid gap-3 rounded-xl border border-line bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto] md:items-end">
        <label className="min-w-0 text-xs font-bold text-navy">
          Datei
          <input
            ref={fileInput}
            className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-line bg-white p-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:font-bold file:text-white"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain"
          />
        </label>
        <label className="min-w-0 text-xs font-bold text-navy">
          Titel <span className="font-medium text-muted">(optional)</span>
          <input
            className={inputStyles}
            value={uploadTitle}
            onChange={(event) => setUploadTitle(event.target.value)}
            placeholder="Standard: Dateiname"
          />
        </label>
        <label className="text-xs font-bold text-navy">
          Status
          <select
            className={inputStyles}
            value={uploadStatus}
            onChange={(event) =>
              setUploadStatus(
                event.target.value === "published" ? "published" : "draft",
              )
            }
          >
            <option value="draft">Entwurf</option>
            <option value="published">Veröffentlicht</option>
          </select>
        </label>
        <Button
          type="button"
          size="sm"
          onClick={() => void uploadMaterial()}
          disabled={busy !== null}
        >
          {busy === "upload" ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <FileUp aria-hidden="true" className="size-4" />
          )}
          {busy === "upload" ? "Lädt hoch …" : "Hochladen"}
        </Button>
      </div>
      {result ? (
        <p
          className={`mt-3 flex items-start gap-2 text-xs ${result.ok ? "text-success" : "text-danger"}`}
          role={result.ok ? "status" : "alert"}
        >
          {result.ok ? (
            <CheckCircle2
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          ) : (
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
          )}
          {result.message}
        </p>
      ) : null}
      <Dialog.Root
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setArchiveTarget(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <Archive aria-hidden="true" className="size-7 text-gold" />
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              Material archivieren?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              „{archiveTarget?.title}“ ist danach für Teilnehmerinnen nicht mehr
              verfügbar. Der Datensatz bleibt für die Dokumentation erhalten.
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy !== null}
                >
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                variant="danger"
                onClick={() =>
                  archiveTarget && void saveMaterial(archiveTarget, true)
                }
                disabled={busy !== null}
              >
                {busy ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Archive aria-hidden="true" className="size-4" />
                )}
                {busy ? "Wird archiviert …" : "Archivieren"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

export function CourseManager() {
  const [course, setCourse] = useState<AdminCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/course", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            body && typeof body.message === "string"
              ? body.message
              : "Kursdaten konnten nicht geladen werden.",
          );
        const parsed = parseCourse(body);
        if (!parsed) throw new Error("Die Kursdaten sind unvollständig.");
        setCourse(parsed);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Kursdaten konnten nicht geladen werden.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  function requestSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveResult(null);
    if (!course) return;
    const validationMessage = courseSaveValidationMessage(course);
    if (validationMessage) {
      setSaveResult({ ok: false, message: validationMessage });
      setConfirming(false);
      return;
    }
    setConfirming(true);
  }

  async function saveCourse() {
    if (!course) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const response = await fetch("/api/admin/course", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course: {
            title: course.title,
            description: course.description,
            version: course.version,
            status: course.status,
          },
          lessons: course.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            description: lesson.description,
            durationSeconds: lesson.durationSeconds,
            streamVideoUid: lesson.streamVideoUid || null,
            status: lesson.status,
          })),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          body && typeof body.message === "string"
            ? body.message
            : "Die Kursdaten konnten nicht gespeichert werden.",
        );
      const updated = parseCourse(body);
      if (updated) setCourse(updated);
      setConfirming(false);
      setSaveResult({
        ok: true,
        message: "Die Kursänderungen wurden gespeichert und protokolliert.",
      });
    } catch (saveError) {
      setSaveResult({
        ok: false,
        message:
          saveError instanceof Error
            ? saveError.message
            : "Die Kursdaten konnten nicht gespeichert werden.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="mt-8 rounded-2xl border border-line bg-white p-6 shadow-card">
        <AdminLoading label="Kursdaten werden geladen" />
      </div>
    );
  if (error)
    return (
      <div className="mt-8">
        <AdminError message={error} />
      </div>
    );
  if (!course)
    return (
      <div className="mt-8">
        <AdminError message="Es wurden keine bearbeitbaren Kursdaten zurückgegeben." />
      </div>
    );

  function moveLesson(index: number, direction: -1 | 1) {
    setCourse((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.lessons.length) return current;
      const lessons = [...current.lessons];
      [lessons[index], lessons[target]] = [lessons[target], lessons[index]];
      return {
        ...current,
        lessons: lessons.map((lesson, lessonIndex) => ({
          ...lesson,
          position: lessonIndex + 1,
        })),
      };
    });
    setSaveResult(null);
  }

  function updateLesson(index: number, updates: Partial<AdminLesson>) {
    setCourse((current) =>
      current
        ? {
            ...current,
            lessons: current.lessons.map((lesson, lessonIndex) =>
              lessonIndex === index ? { ...lesson, ...updates } : lesson,
            ),
          }
        : current,
    );
    setSaveResult(null);
  }

  return (
    <form onSubmit={requestSave} className="mt-8 space-y-6">
      <section
        className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7"
        aria-labelledby="course-settings-title"
      >
        <div className="flex items-start gap-3 border-b border-line pb-5">
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <BookOpenCheck aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              id="course-settings-title"
              className="font-serif text-xl font-semibold text-navy"
            >
              Kurseinstellungen
            </h2>
            <p className="mt-1 text-xs text-muted">
              Produkt- und Zahlungsdaten werden hier nicht bearbeitet.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold text-navy sm:col-span-2">
            Kurstitel
            <input
              className={inputStyles}
              value={course.title}
              onChange={(event) =>
                setCourse({ ...course, title: event.target.value })
              }
            />
          </label>
          <label className="text-sm font-bold text-navy">
            Kursversion
            <input
              className={inputStyles}
              value={course.version}
              onChange={(event) =>
                setCourse({ ...course, version: event.target.value })
              }
              pattern="[0-9]{4}\.[0-9]+"
              placeholder="2026.1"
              aria-describedby="course-version-note"
            />
            <span
              id="course-version-note"
              className="mt-1.5 block text-xs leading-5 font-medium text-muted"
            >
              Format: Jahr und fortlaufende Nummer, zum Beispiel 2026.2.
            </span>
          </label>
          <label className="text-sm font-bold text-navy">
            Veröffentlichungsstatus
            <select
              className={inputStyles}
              value={course.status}
              onChange={(event) =>
                setCourse({ ...course, status: event.target.value })
              }
            >
              <option value="draft">Entwurf</option>
              <option value="published">Veröffentlicht</option>
            </select>
          </label>
          <label className="text-sm font-bold text-navy sm:col-span-2">
            Beschreibung
            <textarea
              className={`${inputStyles} resize-y py-3`}
              rows={4}
              value={course.description}
              onChange={(event) =>
                setCourse({ ...course, description: event.target.value })
              }
            />
          </label>
        </div>
        <p className="mt-5 rounded-xl border border-gold/25 bg-ivory px-4 py-3 text-xs leading-5 text-muted">
          Während der Einrichtung bleiben Kurs und Lektionen auf „Entwurf“.
          Veröffentlichen ist erst mit sieben unterschiedlichen Video-UIDs und
          35 fachlich geprüften Quizfragen möglich.
        </p>
      </section>

      <section
        className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-7"
        aria-labelledby="admin-lessons-title"
      >
        <div className="flex items-start gap-3 border-b border-line pb-5">
          <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
            <Video aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2
              id="admin-lessons-title"
              className="font-serif text-xl font-semibold text-navy"
            >
              Lektionen & private Videos
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Stream-UIDs werden ausschließlich im rollenbasiert geschützten
              Adminbereich angezeigt.
            </p>
          </div>
        </div>
        {course.lessons.length ? (
          <ol className="mt-6 space-y-4">
            {course.lessons.map((lesson, index) => (
              <li
                key={lesson.id}
                className="rounded-xl border border-line p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ivory font-serif font-bold text-navy">
                      {lesson.position}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-navy">
                        Lektion {lesson.position}
                      </h3>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                        <Clock3 aria-hidden="true" className="size-3" />
                        {lesson.durationSeconds
                          ? `${Math.floor(lesson.durationSeconds / 60)}:${String(lesson.durationSeconds % 60).padStart(2, "0")}`
                          : "Laufzeit nicht verfügbar"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 rounded-full bg-navy/5 px-2.5 py-1 text-[0.65rem] font-bold text-muted">
                      {lesson.status === "published"
                        ? "Veröffentlicht"
                        : "Entwurf"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Lektion ${lesson.position} nach oben verschieben`}
                      title="Nach oben"
                      onClick={() => moveLesson(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Lektion ${lesson.position} nach unten verschieben`}
                      title="Nach unten"
                      onClick={() => moveLesson(index, 1)}
                      disabled={index === course.lessons.length - 1}
                    >
                      <ArrowDown aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-bold text-navy sm:col-span-2">
                    Titel
                    <input
                      className={inputStyles}
                      value={lesson.title}
                      onChange={(event) =>
                        updateLesson(index, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold text-navy sm:col-span-2">
                    Beschreibung
                    <textarea
                      rows={3}
                      className={`${inputStyles} resize-y py-3`}
                      value={lesson.description}
                      onChange={(event) =>
                        updateLesson(index, { description: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold text-navy sm:col-span-2">
                    Cloudflare Stream UID
                    <input
                      className={`${inputStyles} font-mono text-xs`}
                      value={lesson.streamVideoUid}
                      onChange={(event) =>
                        updateLesson(index, {
                          streamVideoUid: event.target.value,
                        })
                      }
                      placeholder="Nicht hinterlegt"
                    />
                  </label>
                  <label className="text-xs font-bold text-navy">
                    Laufzeit (Sek.)
                    <input
                      className={inputStyles}
                      type="number"
                      min={1}
                      step={1}
                      value={lesson.durationSeconds || ""}
                      onChange={(event) =>
                        updateLesson(index, {
                          durationSeconds: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <label className="text-xs font-bold text-navy">
                    Status
                    <select
                      className={inputStyles}
                      value={lesson.status}
                      onChange={(event) =>
                        updateLesson(index, { status: event.target.value })
                      }
                    >
                      <option value="draft">Entwurf</option>
                      <option value="published">Veröffentlicht</option>
                    </select>
                  </label>
                </div>
                <MaterialManager
                  lesson={lesson}
                  onChange={(materials) => updateLesson(index, { materials })}
                />
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
            Keine Lektionen aus der Admin-API verfügbar.
          </p>
        )}
      </section>

      <div className="sticky bottom-20 z-20 flex flex-col justify-between gap-4 rounded-2xl border border-line bg-white/95 p-4 shadow-[0_14px_40px_rgba(29,39,51,.14)] backdrop-blur sm:flex-row sm:items-center lg:bottom-5">
        <div>
          {saveResult && !confirming ? (
            <p
              className={`flex items-start gap-2 text-sm ${saveResult.ok ? "text-success" : "text-danger"}`}
              role={saveResult.ok ? "status" : "alert"}
            >
              {saveResult.ok ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              ) : (
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
              )}
              {saveResult.message}
            </p>
          ) : (
            <p className="text-xs text-muted">
              Änderungen werden erst nach deiner Bestätigung übertragen.
            </p>
          )}
        </div>
        <Button type="submit">
          <Save aria-hidden="true" className="size-4" />
          Änderungen prüfen
        </Button>
      </div>

      <Dialog.Root
        open={confirming}
        onOpenChange={(open) => {
          if (!saving) setConfirming(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[80] bg-navy/55 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-[81] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl focus:outline-none">
            <BookOpenCheck aria-hidden="true" className="size-7 text-gold" />
            <Dialog.Title className="mt-4 font-serif text-2xl font-semibold text-navy">
              Kursänderungen speichern?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-6 text-muted">
              Titel, Version, Reihenfolge, Status, Laufzeiten und Stream-UIDs
              können den aktiven Lernbereich unmittelbar beeinflussen. Die
              Änderung wird protokolliert. Materialien werden über ihre eigenen
              Speichern- und Hochladen-Schaltflächen verwaltet.
            </Dialog.Description>
            {saveResult && !saveResult.ok ? (
              <p
                className="mt-4 flex items-start gap-2 rounded-xl border border-danger/25 bg-danger/5 p-3 text-sm leading-6 text-danger"
                role="alert"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                {saveResult.message}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Dialog.Close asChild>
                <Button type="button" variant="secondary" disabled={saving}>
                  Abbrechen
                </Button>
              </Dialog.Close>
              <Button
                type="button"
                onClick={() => void saveCourse()}
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Save aria-hidden="true" className="size-4" />
                )}
                {saving ? "Wird gespeichert …" : "Verbindlich speichern"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}
