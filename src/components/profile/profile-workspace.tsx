"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProfileData } from "@/components/dashboard/data";
import { Button, buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SectionId =
  "personal" | "billing" | "security" | "orders" | "privacy" | "logout";

type ActiveSession = {
  id: string;
  current: boolean;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type SessionsState = {
  status: "idle" | "loading" | "success" | "error";
  items: ActiveSession[];
  message: string | null;
};

const sections: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "personal", label: "Persönliche Daten", icon: UserRound },
  { id: "billing", label: "Rechnungsdaten", icon: Building2 },
  { id: "security", label: "Login & Sicherheit", icon: KeyRound },
  { id: "orders", label: "Bestellungen & Rechnungen", icon: ReceiptText },
  { id: "privacy", label: "Datenschutz", icon: ShieldCheck },
  { id: "logout", label: "Abmelden", icon: LogOut },
];

const inputStyles =
  "mt-2 min-h-12 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink shadow-sm transition placeholder:text-muted/60 hover:border-navy/25 focus:border-navy focus:outline-none disabled:cursor-not-allowed disabled:bg-navy/[.035] disabled:text-muted";

function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  autoComplete,
  optional,
  disabled,
  description,
  required,
}: {
  label: string;
  name: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  autoComplete?: string;
  optional?: boolean;
  disabled?: boolean;
  description?: string;
  required?: boolean;
}) {
  const descriptionId = description ? `${name}-description` : undefined;
  return (
    <div className="block">
      <label
        htmlFor={name}
        className="flex items-center justify-between gap-3 text-sm font-bold text-navy"
      >
        {label}
        {optional ? (
          <span className="text-xs font-medium text-muted">optional</span>
        ) : null}
      </label>
      <input
        className={inputStyles}
        id={name}
        name={name}
        value={value}
        type={type}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        aria-describedby={descriptionId}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
      />
      {description ? (
        <p
          id={descriptionId}
          className="mt-2 block text-xs leading-5 font-medium text-muted"
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

async function fetchActiveSessions(signal?: AbortSignal) {
  const response = await fetch("/api/auth/sessions", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  const body = (await response.json().catch(() => null)) as {
    sessions?: unknown;
    message?: unknown;
  } | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.message === "string"
        ? body.message
        : "Die aktiven Sitzungen konnten nicht geladen werden.",
    );
  }
  if (!Array.isArray(body?.sessions)) {
    throw new Error("Die Sitzungsdaten sind unvollständig.");
  }

  return body.sessions.map((value): ActiveSession => {
    if (!value || typeof value !== "object") {
      throw new Error("Die Sitzungsdaten sind unvollständig.");
    }
    const session = value as Record<string, unknown>;
    if (
      typeof session.id !== "string" ||
      typeof session.current !== "boolean" ||
      (typeof session.userAgent !== "string" && session.userAgent !== null) ||
      typeof session.firstSeenAt !== "string" ||
      typeof session.lastSeenAt !== "string"
    ) {
      throw new Error("Die Sitzungsdaten sind unvollständig.");
    }
    return {
      id: session.id,
      current: session.current,
      userAgent: session.userAgent,
      firstSeenAt: session.firstSeenAt,
      lastSeenAt: session.lastSeenAt,
    };
  });
}

const sessionDateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSessionDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Zeitpunkt nicht verfügbar"
    : sessionDateFormatter.format(date);
}

function SaveStatus({
  state,
  message,
}: {
  state: "idle" | "saving" | "success" | "error";
  message: string | null;
}) {
  if (state === "idle" || state === "saving") return null;
  return (
    <p
      className={cn(
        "mt-4 flex items-start gap-2 text-sm",
        state === "success" ? "text-success" : "text-danger",
      )}
      role={state === "error" ? "alert" : "status"}
    >
      {state === "success" ? (
        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      ) : (
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      {message}
    </p>
  );
}

function statusLabel(value: string | null) {
  switch (value?.toLowerCase()) {
    case "paid":
    case "succeeded":
      return "Bezahlt";
    case "pending":
    case "processing":
      return "In Bearbeitung";
    case "refunded":
      return "Erstattet";
    case "failed":
      return "Fehlgeschlagen";
    default:
      return value ?? "Nicht verfügbar";
  }
}

function certificateIdentity(profile: {
  firstName: string;
  lastName: string;
  certificateName: string;
}) {
  return (
    profile.certificateName.trim() ||
    `${profile.firstName} ${profile.lastName}`.trim()
  );
}

export function ProfileWorkspace({
  data,
  initialSection,
}: {
  data: ProfileData;
  initialSection: SectionId;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionId>(initialSection);
  const [profile, setProfile] = useState(data.profile);
  const [savedCertificateIdentity, setSavedCertificateIdentity] = useState(() =>
    certificateIdentity(data.profile),
  );
  const [certificateCurrentPassword, setCertificateCurrentPassword] =
    useState("");
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [remoteAction, setRemoteAction] = useState<{
    key: "sessions" | "deletion";
    status: "loading" | "success" | "error";
    message: string;
  } | null>(null);
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const [logoutState, setLogoutState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const [marketingConsent, setMarketingConsent] = useState<{
    loading: boolean;
    granted: boolean | null;
    error: string | null;
  }>({ loading: true, granted: null, error: null });
  const [emailChange, setEmailChange] = useState({
    email: "",
    currentPassword: "",
  });
  const [emailChangeState, setEmailChangeState] = useState<{
    status: "idle" | "loading" | "success" | "error";
    message: string | null;
  }>({ status: "idle", message: null });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionsState>({
    status: "idle",
    items: [],
    message: null,
  });
  const [sessionAction, setSessionAction] = useState<{
    status: "idle" | "loading" | "success" | "error";
    message: string | null;
  }>({ status: "idle", message: null });
  const certificateIdentityChanged =
    certificateIdentity(profile) !== savedCertificateIdentity;

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account/marketing-consent", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          granted?: unknown;
          message?: unknown;
        } | null;
        if (!response.ok) {
          throw new Error(
            typeof body?.message === "string"
              ? body.message
              : "Der Einwilligungsstatus konnte nicht geladen werden.",
          );
        }
        if (typeof body?.granted !== "boolean") {
          throw new Error("Der Einwilligungsstatus ist unvollständig.");
        }
        setMarketingConsent({
          loading: false,
          granted: body.granted,
          error: null,
        });
      })
      .catch((consentError: unknown) => {
        if (!controller.signal.aborted) {
          setMarketingConsent({
            loading: false,
            granted: null,
            error:
              consentError instanceof Error
                ? consentError.message
                : "Der Einwilligungsstatus konnte nicht geladen werden.",
          });
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (section !== "security" || sessions.status !== "idle") return;
    const controller = new AbortController();
    void fetchActiveSessions(controller.signal)
      .then((items) => {
        setSessions({ status: "success", items, message: null });
      })
      .catch((sessionError: unknown) => {
        if (!controller.signal.aborted) {
          setSessions({
            status: "error",
            items: [],
            message:
              sessionError instanceof Error
                ? sessionError.message
                : "Die aktiven Sitzungen konnten nicht geladen werden.",
          });
        }
      });
    return () => controller.abort();
  }, [section, sessions.status]);

  function update<K extends keyof ProfileData["profile"]>(
    key: K,
    value: ProfileData["profile"][K],
  ) {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaveState("idle");
    setSaveMessage(null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.loadFailed) return;
    if (
      profile.firstName.trim().length < 2 ||
      profile.lastName.trim().length < 2
    ) {
      setSaveState("error");
      setSaveMessage(
        "Vorname und Nachname müssen jeweils mindestens zwei Zeichen enthalten.",
      );
      return;
    }
    const hasAddress = Boolean(
      profile.billingStreet ||
      profile.billingPostalCode ||
      profile.billingCity ||
      profile.billingCountry,
    );
    if (
      section === "billing" &&
      hasAddress &&
      (!profile.billingStreet.trim() ||
        !profile.billingPostalCode.trim() ||
        !profile.billingCity.trim() ||
        profile.billingCountry.trim().length !== 2)
    ) {
      setSaveState("error");
      setSaveMessage(
        "Bitte fülle Straße, Postleitzahl, Ort und einen zweistelligen Ländercode vollständig aus.",
      );
      return;
    }
    setSaveState("saving");
    setSaveMessage(null);
    try {
      const payload =
        section === "billing"
          ? {
              firstName: profile.firstName,
              lastName: profile.lastName,
              billingType:
                profile.billingType === "company" ? "business" : "private",
              companyName:
                profile.billingType === "company"
                  ? profile.companyName || undefined
                  : undefined,
              contactPerson:
                profile.billingType === "company"
                  ? profile.contactPerson || undefined
                  : undefined,
              billingAddress: hasAddress
                ? {
                    street: profile.billingStreet,
                    postalCode: profile.billingPostalCode,
                    city: profile.billingCity,
                    country: profile.billingCountry,
                  }
                : undefined,
              taxId:
                profile.billingType === "company"
                  ? profile.taxId || undefined
                  : undefined,
            }
          : {
              firstName: profile.firstName,
              lastName: profile.lastName,
              phone: profile.phone || null,
              certificateName: profile.certificateName || null,
              currentPassword: certificateIdentityChanged
                ? certificateCurrentPassword
                : undefined,
            };
      const response = await fetch("/api/account/update", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        const apiMessage =
          typeof responseBody?.message === "string"
            ? responseBody.message
            : null;
        throw new Error(
          apiMessage ?? "Deine Daten konnten nicht gespeichert werden.",
        );
      }
      if (section === "personal") {
        setSavedCertificateIdentity(certificateIdentity(profile));
        setCertificateCurrentPassword("");
      }
      setSaveState("success");
      setSaveMessage("Deine Änderungen wurden gespeichert.");
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error
          ? error.message
          : "Deine Daten konnten nicht gespeichert werden.",
      );
    }
  }

  async function runRemoteAction(
    key: "sessions" | "deletion",
    endpoint: string,
    successMessage: string,
  ) {
    setRemoteAction({
      key,
      status: "loading",
      message: "Anfrage wird verarbeitet …",
    });
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key === "deletion" ? { type: "deletion" } : {}),
      });
      const responseBody = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof responseBody?.message === "string"
            ? responseBody.message
            : "Die Anfrage konnte nicht verarbeitet werden.",
        );
      }
      setRemoteAction({ key, status: "success", message: successMessage });
      if (key === "deletion") setConfirmDeletion(false);
    } catch (error) {
      setRemoteAction({
        key,
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Die Anfrage konnte nicht verarbeitet werden.",
      });
    }
  }

  async function logout() {
    setLogoutState("loading");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutState("error");
    }
  }

  async function requestEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.loadFailed || emailChangeState.status === "loading") return;
    const newEmail = emailChange.email.trim().toLowerCase();
    if (newEmail === profile.email.trim().toLowerCase()) {
      setEmailChangeState({
        status: "error",
        message:
          "Die neue E-Mail-Adresse entspricht deiner bisherigen Adresse.",
      });
      return;
    }
    setEmailChangeState({ status: "loading", message: null });
    try {
      const response = await fetch("/api/auth/email-change", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          currentPassword: emailChange.currentPassword,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        verificationRequired?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "Die E-Mail-Änderung konnte nicht gestartet werden.",
        );
      }
      if (body?.verificationRequired !== true) {
        throw new Error(
          "Die erforderliche E-Mail-Verifizierung wurde nicht bestätigt.",
        );
      }
      setPendingEmail(newEmail);
      setEmailChange((current) => ({ ...current, currentPassword: "" }));
      setEmailChangeState({
        status: "success",
        message:
          typeof body.message === "string"
            ? body.message
            : "Die Verifizierungs-E-Mails wurden versendet.",
      });
    } catch (emailError) {
      setEmailChangeState({
        status: "error",
        message:
          emailError instanceof Error
            ? emailError.message
            : "Die E-Mail-Änderung konnte nicht gestartet werden.",
      });
    }
  }

  async function logoutOtherSessions() {
    if (sessionAction.status === "loading") return;
    let refreshingSessions = false;
    setSessionAction({
      status: "loading",
      message: "Andere Sitzungen werden abgemeldet …",
    });
    try {
      const response = await fetch("/api/auth/logout-others", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      if (!response.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "Die anderen Sitzungen konnten nicht abgemeldet werden.",
        );
      }
      refreshingSessions = true;
      setSessions((current) => ({ ...current, status: "loading" }));
      const items = await fetchActiveSessions();
      setSessions({ status: "success", items, message: null });
      setSessionAction({
        status: "success",
        message: "Andere aktive Sitzungen wurden abgemeldet.",
      });
    } catch (sessionError) {
      const message =
        sessionError instanceof Error
          ? sessionError.message
          : "Die anderen Sitzungen konnten nicht abgemeldet werden.";
      if (refreshingSessions) {
        setSessions({ status: "error", items: [], message });
      }
      setSessionAction({
        status: "error",
        message,
      });
    }
  }

  async function updateMarketingConsent() {
    if (marketingConsent.granted === null) return;
    const nextValue = !marketingConsent.granted;
    setMarketingConsent((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    try {
      const response = await fetch("/api/account/marketing-consent", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ granted: nextValue }),
      });
      const body = (await response.json().catch(() => null)) as {
        granted?: unknown;
        message?: unknown;
      } | null;
      if (!response.ok || typeof body?.granted !== "boolean") {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "Die Einwilligung konnte nicht gespeichert werden.",
        );
      }
      setMarketingConsent({
        loading: false,
        granted: body.granted,
        error: null,
      });
    } catch (consentError) {
      setMarketingConsent((current) => ({
        ...current,
        loading: false,
        error:
          consentError instanceof Error
            ? consentError.message
            : "Die Einwilligung konnte nicht gespeichert werden.",
      }));
    }
  }

  const currentSection =
    sections.find((item) => item.id === section) ?? sections[0];
  const CurrentIcon = currentSection.icon;

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <nav
        aria-label="Profilbereiche"
        className="rounded-2xl border border-line bg-white p-2 shadow-card lg:self-start"
      >
        <div
          role="tablist"
          aria-orientation="vertical"
          onKeyDown={(event) => {
            const buttons = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            let next = index;
            if (event.key === "ArrowDown")
              next = Math.min(buttons.length - 1, index + 1);
            else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = buttons.length - 1;
            else return;
            event.preventDefault();
            buttons[next]?.focus();
            setSection(sections[next].id);
          }}
        >
          {sections.map((item) => {
            const active = section === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`profile-tab-${item.id}`}
                aria-controls={`profile-panel-${item.id}`}
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold transition-colors",
                  active ? "bg-navy text-white" : "text-navy hover:bg-ivory",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "size-4.5 shrink-0",
                    active ? "text-[#dfc79f]" : "text-muted",
                  )}
                />
                <span className="min-w-0 flex-1">{item.label}</span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn(
                    "size-4",
                    active ? "text-white/50" : "text-muted/50",
                  )}
                />
              </button>
            );
          })}
        </div>
      </nav>

      <section
        role="tabpanel"
        id={`profile-panel-${section}`}
        aria-labelledby={`profile-tab-${section}`}
        tabIndex={0}
        className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card focus:outline-none sm:p-8"
      >
        <div className="flex items-start gap-4 border-b border-line pb-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-navy/5 text-navy">
            <CurrentIcon aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-semibold text-navy">
              {currentSection.label}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              {section === "personal" &&
                "Verwalte deine Kontaktdaten und den Namen für dein Zertifikat."}
              {section === "billing" &&
                "Diese Änderungen gelten nur für zukünftige Vorgänge."}
              {section === "security" &&
                "Schütze dein Konto und prüfe verfügbare Sicherheitsoptionen."}
              {section === "orders" &&
                "Hier erscheinen ausschließlich tatsächlich hinterlegte Käufe und Rechnungen."}
              {section === "privacy" &&
                "Verwalte deine Datenschutzanfragen und Einwilligungen."}
              {section === "logout" &&
                "Beende deine aktuelle Sitzung auf diesem Gerät."}
            </p>
          </div>
        </div>

        {data.loadFailed ? (
          <p
            className="mt-5 flex items-start gap-2 rounded-xl border border-[#dbbf93] bg-[#fffaf2] p-4 text-sm leading-6 text-[#654d2d]"
            role="status"
          >
            <AlertCircle aria-hidden="true" className="mt-1 size-4 shrink-0" />
            Deine gespeicherten Profildaten konnten gerade nicht vollständig
            geladen werden. Änderungen sind bis zum erneuten Laden deaktiviert.
          </p>
        ) : null}

        {section === "personal" ? (
          <form onSubmit={saveProfile} className="mt-7">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Vorname"
                name="firstName"
                value={profile.firstName}
                autoComplete="given-name"
                disabled={data.loadFailed}
                onChange={(value) => update("firstName", value)}
              />
              <Field
                label="Nachname"
                name="lastName"
                value={profile.lastName}
                autoComplete="family-name"
                disabled={data.loadFailed}
                onChange={(value) => update("lastName", value)}
              />
              <Field
                label="E-Mail-Adresse"
                name="email"
                value={profile.email}
                type="email"
                autoComplete="email"
                disabled
                description="Eine E-Mail-Änderung erfordert eine erneute Verifizierung und kann hier nicht unbestätigt vorgenommen werden."
              />
              <Field
                label="Telefonnummer"
                name="phone"
                value={profile.phone}
                autoComplete="tel"
                optional
                disabled={data.loadFailed}
                onChange={(value) => update("phone", value)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Name auf dem Zertifikat"
                  name="certificateName"
                  value={profile.certificateName}
                  disabled={data.loadFailed}
                  onChange={(value) => update("certificateName", value)}
                  description="Prüfe die Schreibweise vor dem Kursabschluss sorgfältig. Nach der Ausstellung ist eine sichere Bestätigung für Änderungen erforderlich."
                />
              </div>
              {certificateIdentityChanged ? (
                <div className="sm:col-span-2">
                  <Field
                    label="Aktuelles Passwort bestätigen"
                    name="certificateCurrentPassword"
                    value={certificateCurrentPassword}
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={data.loadFailed || saveState === "saving"}
                    onChange={setCertificateCurrentPassword}
                    description="Der Name ist Bestandteil eines verifizierbaren Zertifikats. Deshalb bestätigen wir diese Änderung erneut."
                  />
                </div>
              ) : null}
            </div>
            <div className="mt-7 border-t border-line pt-6">
              <Button
                type="submit"
                disabled={data.loadFailed || saveState === "saving"}
              >
                {saveState === "saving" ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                )}
                {saveState === "saving"
                  ? "Wird gespeichert …"
                  : "Änderungen speichern"}
              </Button>
              <SaveStatus state={saveState} message={saveMessage} />
            </div>
          </form>
        ) : null}

        {section === "billing" ? (
          <form onSubmit={saveProfile} className="mt-7">
            <fieldset>
              <legend className="text-sm font-bold text-navy">
                Rechnungstyp
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {(["private", "company"] as const).map((type) => (
                  <label
                    key={type}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-bold transition-colors",
                      profile.billingType === type
                        ? "border-navy bg-navy/[.045] text-navy"
                        : "border-line text-muted hover:border-navy/30",
                    )}
                  >
                    <input
                      type="radio"
                      name="billingType"
                      value={type}
                      checked={profile.billingType === type}
                      disabled={data.loadFailed}
                      onChange={() => update("billingType", type)}
                      className="size-4 accent-[#1d2733]"
                    />
                    {type === "private" ? "Privatperson" : "Unternehmen"}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {profile.billingType === "company" ? (
                <>
                  <Field
                    label="Firmenname"
                    name="companyName"
                    value={profile.companyName}
                    autoComplete="organization"
                    disabled={data.loadFailed}
                    onChange={(value) => update("companyName", value)}
                  />
                  <Field
                    label="Ansprechpartner"
                    name="contactPerson"
                    value={profile.contactPerson}
                    autoComplete="name"
                    disabled={data.loadFailed}
                    onChange={(value) => update("contactPerson", value)}
                  />
                  <Field
                    label="Umsatzsteuer-ID"
                    name="taxId"
                    value={profile.taxId}
                    optional
                    disabled={data.loadFailed}
                    onChange={(value) => update("taxId", value)}
                  />
                </>
              ) : null}
              <div className="sm:col-span-2">
                <Field
                  label="Straße und Hausnummer"
                  name="billingStreet"
                  value={profile.billingStreet}
                  autoComplete="street-address"
                  disabled={data.loadFailed}
                  onChange={(value) => update("billingStreet", value)}
                />
              </div>
              <Field
                label="Postleitzahl"
                name="billingPostalCode"
                value={profile.billingPostalCode}
                autoComplete="postal-code"
                disabled={data.loadFailed}
                onChange={(value) => update("billingPostalCode", value)}
              />
              <Field
                label="Ort"
                name="billingCity"
                value={profile.billingCity}
                autoComplete="address-level2"
                disabled={data.loadFailed}
                onChange={(value) => update("billingCity", value)}
              />
              <div className="sm:col-span-2">
                <Field
                  label="Land / Ländercode"
                  name="billingCountry"
                  value={profile.billingCountry}
                  autoComplete="country-name"
                  disabled={data.loadFailed}
                  onChange={(value) => update("billingCountry", value)}
                  description="Verwende zum Beispiel DE für Deutschland."
                />
              </div>
            </div>
            <p className="mt-5 rounded-xl bg-ivory p-4 text-xs leading-5 text-muted">
              Bestehende Stripe-Rechnungen werden durch Profiländerungen nicht
              nachträglich verändert.
            </p>
            <div className="mt-7 border-t border-line pt-6">
              <Button
                type="submit"
                disabled={data.loadFailed || saveState === "saving"}
              >
                {saveState === "saving" ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                )}
                {saveState === "saving"
                  ? "Wird gespeichert …"
                  : "Rechnungsdaten speichern"}
              </Button>
              <SaveStatus state={saveState} message={saveMessage} />
            </div>
          </form>
        ) : null}

        {section === "security" ? (
          <div className="mt-7 space-y-4">
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-line p-5 sm:flex-row sm:items-center">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy/5 text-navy">
                  <LockKeyhole aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Passwort ändern
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Fordere einen sicheren Link an deine bestätigte
                    E-Mail-Adresse an.
                  </p>
                </div>
              </div>
              <Link
                href="/passwort-vergessen"
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className: "shrink-0",
                })}
              >
                Passwort-Link anfordern
              </Link>
            </div>

            <form
              onSubmit={requestEmailChange}
              className="rounded-xl border border-line p-5"
              aria-labelledby="email-change-heading"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy/5 text-navy">
                  <Mail aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3
                    id="email-change-heading"
                    className="text-sm font-bold text-navy"
                  >
                    E-Mail-Adresse ändern
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Zur Sicherheit brauchst du dein aktuelles Passwort. Die
                    Änderung wird erst nach der E-Mail-Verifizierung übernommen.
                  </p>
                </div>
              </div>
              <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-2">
                <Field
                  label="Bisherige E-Mail-Adresse"
                  name="currentEmail"
                  value={profile.email}
                  type="email"
                  autoComplete="email"
                  disabled
                  description="Diese Adresse bleibt im Profil sichtbar, bis die Änderung bestätigt und übernommen wurde."
                />
                <Field
                  label="Neue E-Mail-Adresse"
                  name="newEmail"
                  value={emailChange.email}
                  type="email"
                  autoComplete="email"
                  required
                  disabled={
                    data.loadFailed || emailChangeState.status === "loading"
                  }
                  onChange={(value) => {
                    setEmailChange((current) => ({ ...current, email: value }));
                    if (emailChangeState.status === "error") {
                      setEmailChangeState({ status: "idle", message: null });
                    }
                  }}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Aktuelles Passwort"
                    name="emailChangeCurrentPassword"
                    value={emailChange.currentPassword}
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={
                      data.loadFailed || emailChangeState.status === "loading"
                    }
                    onChange={(value) => {
                      setEmailChange((current) => ({
                        ...current,
                        currentPassword: value,
                      }));
                      if (emailChangeState.status === "error") {
                        setEmailChangeState({ status: "idle", message: null });
                      }
                    }}
                  />
                </div>
              </div>
              {pendingEmail ? (
                <div
                  className="mt-5 rounded-xl border border-[#b8d1c5] bg-[#f3faf6] p-4 text-sm leading-6 text-[#245943]"
                  role="status"
                >
                  <p className="font-bold">
                    Erneute Verifizierung erforderlich
                  </p>
                  <p className="mt-1 break-words">
                    Bestätige die versendeten E-Mails für {pendingEmail}. Bis
                    zum Abschluss bleibt {profile.email} deine im Profil
                    angezeigte Adresse.
                  </p>
                </div>
              ) : null}
              <div className="mt-5 flex flex-col items-start gap-3 border-t border-line pt-5 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    data.loadFailed || emailChangeState.status === "loading"
                  }
                >
                  {emailChangeState.status === "loading" ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin"
                    />
                  ) : (
                    <Mail aria-hidden="true" className="size-4" />
                  )}
                  {emailChangeState.status === "loading"
                    ? "Änderung wird gestartet …"
                    : "Verifizierung anfordern"}
                </Button>
                {emailChangeState.message ? (
                  <p
                    className={cn(
                      "text-xs leading-5",
                      emailChangeState.status === "error"
                        ? "text-danger"
                        : "text-success",
                    )}
                    role={
                      emailChangeState.status === "error" ? "alert" : "status"
                    }
                  >
                    {emailChangeState.message}
                  </p>
                ) : null}
              </div>
            </form>

            <div className="rounded-xl border border-line p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-navy/5 text-navy">
                  <ShieldCheck aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Aktive Sitzungen
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Angezeigt werden nur vom Konto registrierte Sitzungen. Der
                    User-Agent wird unverändert wiedergegeben; Geräte oder
                    Standorte werden daraus nicht abgeleitet.
                  </p>
                </div>
              </div>

              {sessions.status === "idle" || sessions.status === "loading" ? (
                <p
                  className="mt-5 flex items-center gap-2 text-xs text-muted"
                  role="status"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Aktive Sitzungen werden geladen …
                </p>
              ) : null}

              {sessions.status === "error" ? (
                <div className="mt-5" role="alert">
                  <p className="flex items-start gap-2 text-xs leading-5 text-danger">
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    {sessions.message}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() =>
                      setSessions({ status: "idle", items: [], message: null })
                    }
                  >
                    Erneut laden
                  </Button>
                </div>
              ) : null}

              {sessions.status === "success" && sessions.items.length === 0 ? (
                <p className="mt-5 text-xs leading-5 text-muted" role="status">
                  Die API hat aktuell keine aktiven Sitzungen zurückgegeben.
                </p>
              ) : null}

              {sessions.items.length > 0 ? (
                <ul
                  className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line"
                  aria-label="Aktive Sitzungen"
                >
                  {sessions.items.map((activeSession) => (
                    <li key={activeSession.id} className="min-w-0 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-navy">
                          Registrierte Sitzung
                        </p>
                        {activeSession.current ? (
                          <span className="rounded-full bg-success/10 px-2.5 py-1 text-[0.65rem] font-extrabold text-success">
                            Aktuelle Sitzung
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2">
                        <div className="min-w-0 sm:col-span-2">
                          <dt className="font-bold text-muted">
                            Übermittelter User-Agent
                          </dt>
                          <dd className="mt-1 break-all whitespace-pre-wrap leading-5 text-ink">
                            {activeSession.userAgent || "Nicht übermittelt"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-muted">
                            Erstmals gesehen
                          </dt>
                          <dd className="mt-1 text-ink">
                            <time dateTime={activeSession.firstSeenAt}>
                              {formatSessionDate(activeSession.firstSeenAt)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt className="font-bold text-muted">
                            Zuletzt gesehen
                          </dt>
                          <dd className="mt-1 text-ink">
                            <time dateTime={activeSession.lastSeenAt}>
                              {formatSessionDate(activeSession.lastSeenAt)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                disabled={
                  sessionAction.status === "loading" ||
                  sessions.status !== "success" ||
                  !sessions.items.some(
                    (activeSession) => !activeSession.current,
                  )
                }
                onClick={() => void logoutOtherSessions()}
              >
                {sessionAction.status === "loading" ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <LogOut aria-hidden="true" className="size-4" />
                )}
                Andere Sitzungen abmelden
              </Button>
              {sessionAction.message ? (
                <p
                  className={cn(
                    "mt-3 text-xs leading-5",
                    sessionAction.status === "error"
                      ? "text-danger"
                      : sessionAction.status === "success"
                        ? "text-success"
                        : "text-muted",
                  )}
                  role={sessionAction.status === "error" ? "alert" : "status"}
                >
                  {sessionAction.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {section === "orders" ? (
          <div className="mt-7">
            {data.orders.length ? (
              <div className="overflow-hidden rounded-xl border border-line">
                <div className="hidden grid-cols-[1.5fr_.8fr_.7fr_.8fr_auto] gap-4 bg-ivory px-5 py-3 text-[0.65rem] font-extrabold tracking-[0.1em] text-muted uppercase md:grid">
                  <span>Produkt</span>
                  <span>Kaufdatum</span>
                  <span>Betrag</span>
                  <span>Status</span>
                  <span>Rechnung</span>
                </div>
                <ul className="divide-y divide-line">
                  {data.orders.map((order) => (
                    <li
                      key={order.id}
                      className="grid gap-3 p-5 md:grid-cols-[1.5fr_.8fr_.7fr_.8fr_auto] md:items-center md:gap-4"
                    >
                      <div>
                        <span className="text-[0.65rem] font-bold text-muted md:hidden">
                          Produkt
                        </span>
                        <p className="mt-1 text-sm font-bold text-navy md:mt-0">
                          {order.productName ?? "Produktname nicht verfügbar"}
                        </p>
                        {order.invoiceNumber ? (
                          <p className="mt-1 text-xs text-muted">
                            Rechnung {order.invoiceNumber}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <span className="text-[0.65rem] font-bold text-muted md:hidden">
                          Kaufdatum
                        </span>
                        <p className="mt-1 text-sm text-ink md:mt-0">
                          {order.purchasedAt ?? "–"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[0.65rem] font-bold text-muted md:hidden">
                          Betrag
                        </span>
                        <p className="mt-1 text-sm font-bold text-navy md:mt-0">
                          {order.amount ?? "–"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[0.65rem] font-bold text-muted md:hidden">
                          Status
                        </span>
                        <p className="mt-1 text-xs font-bold text-muted md:mt-0">
                          {statusLabel(order.status)}
                        </p>
                      </div>
                      <div>
                        {order.invoiceUrl ? (
                          <a
                            href={order.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={buttonStyles({
                              variant: "secondary",
                              size: "sm",
                            })}
                          >
                            <Download aria-hidden="true" className="size-4" />
                            PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted">
                            Nicht verfügbar
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-line p-8 text-center">
                <FileText
                  aria-hidden="true"
                  className="mx-auto size-8 text-muted/60"
                />
                <h3 className="mt-4 font-bold text-navy">
                  Keine Bestellungen verfügbar
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  Für dieses Konto wurden keine abrufbaren Bestell- oder
                  Rechnungsdaten zurückgegeben.
                </p>
              </div>
            )}
          </div>
        ) : null}

        {section === "privacy" ? (
          <div className="mt-7 space-y-4">
            <div className="rounded-xl border border-line p-5">
              <div className="flex items-start gap-3">
                <Download
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-gold"
                />
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Profildaten exportieren
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Lade die aktuell zu deinem Konto gespeicherten Profildaten
                    sicher herunter.
                  </p>
                </div>
              </div>
              <a
                href="/api/account/export"
                className={buttonStyles({
                  variant: "secondary",
                  size: "sm",
                  className: "mt-4",
                })}
              >
                <Download aria-hidden="true" className="size-4" />
                Export herunterladen
              </a>
            </div>
            <div className="rounded-xl border border-line p-5">
              <div className="flex items-start gap-3">
                <Mail
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-gold"
                />
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Marketing-Einwilligung
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Optionale Informationen und Angebote per E-Mail.
                    Transaktionale Kurs-, Konto- und Zertifikatsnachrichten
                    bleiben davon unberührt.
                  </p>
                </div>
              </div>
              {marketingConsent.loading && marketingConsent.granted === null ? (
                <p
                  className="mt-4 inline-flex items-center gap-2 text-xs text-muted"
                  role="status"
                >
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Einwilligungsstatus wird geladen …
                </p>
              ) : null}
              {marketingConsent.granted !== null ? (
                <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${marketingConsent.granted ? "bg-success/10 text-success" : "bg-navy/5 text-muted"}`}
                  >
                    {marketingConsent.granted ? (
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                    ) : (
                      <Mail aria-hidden="true" className="size-4" />
                    )}
                    {marketingConsent.granted
                      ? "Einwilligung erteilt"
                      : "Keine Einwilligung gespeichert"}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void updateMarketingConsent()}
                    disabled={marketingConsent.loading}
                  >
                    {marketingConsent.loading ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : null}
                    {marketingConsent.granted
                      ? "Einwilligung widerrufen"
                      : "E-Mail-Informationen erlauben"}
                  </Button>
                </div>
              ) : null}
              {marketingConsent.error ? (
                <p className="mt-3 text-xs leading-5 text-danger" role="alert">
                  {marketingConsent.error}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-danger/20 bg-danger/[.035] p-5">
              <div className="flex items-start gap-3">
                <Trash2
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-danger"
                />
                <div>
                  <h3 className="text-sm font-bold text-navy">
                    Löschanfrage stellen
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Gesetzliche Aufbewahrungspflichten können einer
                    vollständigen sofortigen Löschung einzelner Daten
                    entgegenstehen. Deine Anfrage wird deshalb geprüft und nicht
                    als sofortige Löschung ausgeführt.
                  </p>
                </div>
              </div>
              {!confirmDeletion ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => setConfirmDeletion(true)}
                >
                  Löschanfrage vorbereiten
                </Button>
              ) : (
                <div
                  className="mt-4 rounded-xl border border-danger/20 bg-white p-4"
                  role="region"
                  aria-labelledby="deletion-confirm-title"
                >
                  <h4
                    id="deletion-confirm-title"
                    className="text-sm font-bold text-navy"
                  >
                    Löschanfrage wirklich übermitteln?
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Die Anfrage wird als personenbezogene Datenschutzanfrage zur
                    sicheren Prüfung gespeichert.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setConfirmDeletion(false)}
                      disabled={
                        remoteAction?.key === "deletion" &&
                        remoteAction.status === "loading"
                      }
                    >
                      Abbrechen
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        void runRemoteAction(
                          "deletion",
                          "/api/account/data-request",
                          "Deine Löschanfrage wurde zur sicheren Prüfung übermittelt.",
                        )
                      }
                      disabled={
                        remoteAction?.key === "deletion" &&
                        remoteAction.status === "loading"
                      }
                    >
                      {remoteAction?.key === "deletion" &&
                      remoteAction.status === "loading" ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <Trash2 aria-hidden="true" className="size-4" />
                      )}
                      Anfrage übermitteln
                    </Button>
                  </div>
                </div>
              )}
              {remoteAction?.key === "deletion" &&
              remoteAction.status !== "loading" ? (
                <p
                  className={cn(
                    "mt-3 text-xs leading-5",
                    remoteAction.status === "error"
                      ? "text-danger"
                      : "text-success",
                  )}
                  role={remoteAction.status === "error" ? "alert" : "status"}
                >
                  {remoteAction.message}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {section === "logout" ? (
          <div className="mt-7 rounded-xl border border-line p-6">
            <LogOut aria-hidden="true" className="size-8 text-gold" />
            <h3 className="mt-4 font-serif text-xl font-semibold text-navy">
              Sitzung beenden
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              Melde dich ab, wenn du ein gemeinsam genutztes Gerät verwendest.
              Dein gespeicherter Lernfortschritt bleibt erhalten.
            </p>
            <Button
              type="button"
              variant="danger"
              className="mt-5"
              onClick={() => void logout()}
              disabled={logoutState === "loading"}
            >
              {logoutState === "loading" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
              ) : (
                <LogOut aria-hidden="true" className="size-4" />
              )}
              {logoutState === "loading"
                ? "Wird abgemeldet …"
                : "Jetzt abmelden"}
            </Button>
            {logoutState === "error" ? (
              <p className="mt-3 text-sm text-danger" role="alert">
                Die Sitzung konnte nicht beendet werden. Bitte versuche es
                erneut.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export type { SectionId };
