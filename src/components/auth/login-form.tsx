"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";

const schema = z.object({
  email: z.email("Bitte gib eine gültige E-Mail-Adresse ein."),
  password: z.string().min(1, "Bitte gib dein Passwort ein."),
});

type Values = z.infer<typeof schema>;

const protectedDestinations = [
  "/dashboard",
  "/schulung",
  "/zertifikat",
  "/profil",
  "/admin",
];

function safeNextDestination(value: string | null): string {
  if (!value) return "/dashboard";
  try {
    const destination = new URL(value, window.location.origin);
    const allowed = protectedDestinations.some(
      (prefix) =>
        destination.pathname === prefix ||
        destination.pathname.startsWith(`${prefix}/`),
    );
    if (destination.origin !== window.location.origin || !allowed)
      return "/dashboard";
    return `${destination.pathname}${destination.search}`;
  } catch {
    return "/dashboard";
  }
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setMessage(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setMessage(
        data.message ??
          "Die Anmeldung war nicht möglich. Prüfe deine Eingaben und versuche es erneut.",
      );
      return;
    }
    router.replace(safeNextDestination(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <Field
        label="E-Mail-Adresse"
        type="email"
        autoComplete="email"
        required
        error={errors.email?.message}
        {...register("email")}
      />
      <Field
        label="Passwort"
        type="password"
        autoComplete="current-password"
        required
        error={errors.password?.message}
        {...register("password")}
      />
      <div className="flex justify-end">
        <Link
          href="/passwort-vergessen"
          className="text-sm font-bold text-navy underline decoration-gold/60 underline-offset-4 hover:decoration-gold"
        >
          Passwort vergessen?
        </Link>
      </div>
      {message && (
        <div
          className="rounded-xl border border-danger/25 bg-danger/5 p-4 text-sm leading-6 text-danger"
          role="alert"
        >
          {message}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <>
            Sicher anmelden <ArrowRight className="size-5" aria-hidden="true" />
          </>
        )}
      </Button>
      <p className="text-center text-sm leading-6 text-muted">
        Noch keinen Zugang?{" "}
        <Link
          href="/checkout"
          className="font-bold text-navy underline decoration-gold/60 underline-offset-4"
        >
          Schulungsplatz buchen
        </Link>
      </p>
    </form>
  );
}
