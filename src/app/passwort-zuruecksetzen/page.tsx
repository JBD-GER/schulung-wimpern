import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export const metadata: Metadata = {
  title: "Neues Passwort festlegen",
  robots: { index: false, follow: false },
};

export default function UpdatePasswordPage() {
  return (
    <AuthShell
      eyebrow="Login & Sicherheit"
      title="Neues Passwort festlegen"
      description="Wähle ein starkes Passwort, das du nicht für andere Dienste verwendest."
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
