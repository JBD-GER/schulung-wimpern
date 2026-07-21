import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Login",
  description: "Melde dich in deinem persönlichen Teilnehmerbereich an.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Willkommen zurück"
      title="In deinen Lernbereich einloggen"
      description="Setze deine Schulung genau dort fort, wo du aufgehört hast."
    >
      <Suspense
        fallback={
          <div className="h-72 animate-pulse rounded-2xl bg-beige/40" />
        }
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
