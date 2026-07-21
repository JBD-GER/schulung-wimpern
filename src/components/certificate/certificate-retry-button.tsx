"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const RETRY_REQUEST_TIMEOUT_MS = 15_000;

export function CertificateRetryButton({ className }: { className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setState("loading");
    setMessage(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      RETRY_REQUEST_TIMEOUT_MS,
    );
    try {
      const response = await fetch("/api/certificate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
        state?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "Die Zertifikatserstellung konnte nicht erneut gestartet werden.",
        );
      }
      setState("success");
      setMessage(
        body?.state === "valid"
          ? "Dein Zertifikat ist bereit."
          : "Die sichere Erstellung wurde erneut angestoßen.",
      );
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "Die Anfrage hat zu lange gedauert. Bitte versuche es erneut."
          : error instanceof Error
            ? error.message
            : "Die Zertifikatserstellung konnte nicht erneut gestartet werden.",
      );
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  return (
    <div className={className}>
      <Button type="button" onClick={retry} disabled={state === "loading"}>
        {state === "loading" ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <RotateCcw aria-hidden="true" className="size-4" />
        )}
        {state === "loading"
          ? "Wird erneut geprüft …"
          : "Erstellung erneut versuchen"}
      </Button>
      {message ? (
        <p
          className={`mt-3 text-sm leading-6 ${state === "error" ? "text-danger" : "text-success"}`}
          role={state === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
