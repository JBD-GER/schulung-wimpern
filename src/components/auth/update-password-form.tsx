"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Field } from "@/components/forms/field";
import { Button, buttonStyles } from "@/components/ui/button";

const schema = z
  .object({
    password: z
      .string()
      .min(12, "Das Passwort muss mindestens 12 Zeichen lang sein.")
      .max(128, "Das Passwort darf höchstens 128 Zeichen lang sein.")
      .regex(/\p{Ll}/u, "Mindestens ein Kleinbuchstabe fehlt.")
      .regex(/\p{Lu}/u, "Mindestens ein Großbuchstabe fehlt.")
      .regex(/\p{N}/u, "Mindestens eine Zahl fehlt.")
      .regex(/[^\p{L}\p{N}]/u, "Mindestens ein Sonderzeichen fehlt."),
    confirmation: z.string().max(128),
  })
  .refine((data) => data.password === data.confirmation, {
    path: ["confirmation"],
    message: "Die Passwörter stimmen nicht überein.",
  });
type Values = z.infer<typeof schema>;

export function UpdatePasswordForm() {
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmation: "" },
  });
  async function submit(values: Values) {
    setMessage("");
    const response = await fetch("/api/auth/password-update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: values.password }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    if (!response.ok) {
      setMessage(
        data.message ??
          "Das Passwort konnte nicht geändert werden. Fordere bitte einen neuen Link an.",
      );
      return;
    }
    setDone(true);
  }
  if (done)
    return (
      <div className="rounded-2xl border border-success/20 bg-success/5 p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-success" />
        <p className="mt-4 font-bold text-navy">
          Dein Passwort wurde geändert.
        </p>
        <Link
          href="/dashboard"
          className={buttonStyles({ className: "mt-6 w-full" })}
        >
          Zum Dashboard
        </Link>
      </div>
    );
  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(submit)} noValidate>
      <Field
        label="Neues Passwort"
        type="password"
        autoComplete="new-password"
        required
        hint="12 bis 128 Zeichen, Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen."
        error={form.formState.errors.password?.message}
        {...form.register("password")}
      />
      <Field
        label="Passwort bestätigen"
        type="password"
        autoComplete="new-password"
        required
        error={form.formState.errors.confirmation?.message}
        {...form.register("confirmation")}
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
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && (
          <LoaderCircle className="size-5 animate-spin" />
        )}
        Passwort sicher ändern
      </Button>
    </form>
  );
}
