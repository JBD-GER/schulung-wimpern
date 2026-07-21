import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordResetForm } from "@/components/auth/password-reset-form";

export const metadata: Metadata = {
  title: "Passwort zurücksetzen",
  robots: { index: false, follow: false },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <AuthShell
      eyebrow="Login & Sicherheit"
      title="Passwort zurücksetzen"
      description={
        reason === "setup_retry"
          ? "Die erste Aktivierung konnte technisch nicht abgeschlossen werden. Fordere hier einen neuen, einmal verwendbaren Passwort-Link an."
          : "Wir senden dir einen einmal verwendbaren Link an deine hinterlegte E-Mail-Adresse."
      }
    >
      <PasswordResetForm />
    </AuthShell>
  );
}
