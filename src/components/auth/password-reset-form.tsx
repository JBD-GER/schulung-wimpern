"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button, buttonStyles } from "@/components/ui/button";

const schema = z.object({
  email: z.email("Bitte gib eine gültige E-Mail-Adresse ein."),
});
type Values = z.infer<typeof schema>;

export function PasswordResetForm() {
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  async function onSubmit(values: Values) {
    setMessage("");
    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!response.ok) {
      setMessage(
        "Der sichere Link konnte gerade nicht versendet werden. Bitte versuche es später erneut.",
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-success/20 bg-success/5 p-6 text-center">
        <CheckCircle2
          className="mx-auto size-8 text-success"
          aria-hidden="true"
        />
        <p className="mt-4 font-bold text-navy">Prüfe jetzt dein Postfach</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Wenn ein Konto zu dieser Adresse besteht, erhältst du einen sicheren
          Link zum Zurücksetzen deines Passworts.
        </p>
        <Link
          href="/login"
          className={buttonStyles({
            variant: "secondary",
            className: "mt-6 w-full",
          })}
        >
          Zurück zum Login
        </Link>
      </div>
    );
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
      {message && (
        <p
          className="rounded-xl bg-danger/5 p-4 text-sm text-danger"
          role="alert"
        >
          {message}
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting && (
          <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
        )}
        Link zum Zurücksetzen senden
      </Button>
      <Link
        href="/login"
        className={buttonStyles({ variant: "ghost", className: "w-full" })}
      >
        Zurück zum Login
      </Link>
    </form>
  );
}
