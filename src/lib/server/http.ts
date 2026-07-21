import "server-only";

import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "request_error",
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json(
      { ok: false, error: error.code, message: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        ok: false,
        error: "validation_error",
        message: "Bitte prüfe deine Eingaben.",
        fields: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  return Response.json(
    {
      ok: false,
      error: "internal_error",
      message:
        "Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versuche es erneut.",
    },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(
      415,
      "Bitte sende die Daten als JSON.",
      "unsupported_media_type",
    );
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(
      400,
      "Die Anfrage enthält kein gültiges JSON.",
      "invalid_json",
    );
  }
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestOrigin = new URL(request.url).origin;
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new HttpError(
      403,
      "Die Anfrage wurde aus Sicherheitsgründen abgelehnt.",
      "csrf_rejected",
    );
  }
  if (origin && origin !== requestOrigin) {
    throw new HttpError(
      403,
      "Die Anfrage wurde aus Sicherheitsgründen abgelehnt.",
      "csrf_rejected",
    );
  }
}

export function noStoreHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  return headers;
}
