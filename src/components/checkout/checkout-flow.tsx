"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loadStripe } from "@stripe/stripe-js";
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Checkbox, Field, SelectField } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { COURSE_ACCESS_LABEL } from "@/data/access-policy";
import { EARLY_ACCESS_ACCEPTANCE_TEXT } from "@/data/checkout-legal";
import { COURSE } from "@/data/course";
import { trackEvent } from "@/lib/client/analytics";
import { formatPrice } from "@/lib/utils";
import { checkoutPasswordSchema } from "@/lib/validation/checkout";

type PublicProduct = {
  name: string;
  unitAmount: number | null;
  currency: string;
  taxBehavior: string | null;
  available: boolean;
};

type CheckoutTotals =
  | {
      status: "pending";
      subtotal: null;
      tax: null;
      total: null;
      currency: string | null;
      taxBehavior: string | null;
      automaticTaxEnabled: boolean;
    }
  | {
      status: "ready";
      subtotal: number;
      tax: number;
      total: number;
      currency: string;
      taxBehavior: string | null;
      automaticTaxEnabled: boolean;
    };

function parseCheckoutTotals(value: unknown): CheckoutTotals | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const totals = value as Record<string, unknown>;
  const status = totals.status;
  const currency =
    typeof totals.currency === "string" && totals.currency.trim()
      ? totals.currency.toUpperCase()
      : null;
  const taxBehavior =
    typeof totals.taxBehavior === "string" ? totals.taxBehavior : null;
  const automaticTaxEnabled = totals.automaticTaxEnabled === true;
  if (status === "pending") {
    return {
      status,
      subtotal: null,
      tax: null,
      total: null,
      currency,
      taxBehavior,
      automaticTaxEnabled,
    };
  }
  const amounts = [totals.subtotal, totals.tax, totals.total];
  if (
    status !== "ready" ||
    currency === null ||
    amounts.some(
      (amount) =>
        typeof amount !== "number" ||
        !Number.isSafeInteger(amount) ||
        amount < 0,
    )
  ) {
    return null;
  }
  return {
    status,
    subtotal: totals.subtotal as number,
    tax: totals.tax as number,
    total: totals.total as number,
    currency,
    taxBehavior,
    automaticTaxEnabled,
  };
}

const accountSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "Bitte gib deinen Vornamen ein.")
      .max(80),
    lastName: z
      .string()
      .trim()
      .min(2, "Bitte gib deinen Nachnamen ein.")
      .max(80),
    email: z.email("Bitte gib eine gültige E-Mail-Adresse ein."),
    password: checkoutPasswordSchema,
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Die Passwörter stimmen nicht überein.",
  });

const loginSchema = z.object({
  email: z.email("Bitte gib eine gültige E-Mail-Adresse ein."),
  password: z.string().min(1, "Bitte gib dein Passwort ein."),
});

const billingSchema = z
  .object({
    billingType: z.enum(["private", "business"]),
    firstName: z.string().trim().min(2, "Bitte gib den Vornamen ein.").max(80),
    lastName: z.string().trim().min(2, "Bitte gib den Nachnamen ein.").max(80),
    companyName: z.string().trim().max(160).optional(),
    contactPerson: z.string().trim().max(140).optional(),
    legalForm: z.string().trim().max(100).optional(),
    companyCountry: z
      .string()
      .trim()
      .length(2, "Bitte wähle das Unternehmensland.")
      .optional(),
    street: z
      .string()
      .trim()
      .min(3, "Bitte gib Straße und Hausnummer ein.")
      .max(160),
    postalCode: z
      .string()
      .trim()
      .min(3, "Bitte gib die Postleitzahl ein.")
      .max(20),
    city: z.string().trim().min(2, "Bitte gib den Ort ein.").max(100),
    // `country` is intentionally unmounted for business purchases. Keep a
    // canonical form default so `shouldUnregister` cannot make the resolver
    // reject an otherwise complete company address.
    country: z
      .string()
      .trim()
      .length(2, "Bitte wähle ein Land.")
      .optional()
      .default("DE"),
    differentBillingAddress: z.boolean().optional().default(false),
    billingStreet: z.string().trim().max(160).optional(),
    billingPostalCode: z.string().trim().max(20).optional(),
    billingCity: z.string().trim().max(100).optional(),
    billingCountry: z
      .string()
      .trim()
      .length(2, "Bitte wähle das Rechnungsland.")
      .optional(),
    taxId: z.string().trim().max(32).optional(),
  })
  .superRefine((values, context) => {
    if (values.billingType === "business" && !values.companyName) {
      context.addIssue({
        code: "custom",
        path: ["companyName"],
        message: "Bitte gib den Firmennamen ein.",
      });
    }
    if (values.billingType === "business" && !values.companyCountry) {
      context.addIssue({
        code: "custom",
        path: ["companyCountry"],
        message: "Bitte wähle das Unternehmensland.",
      });
    }
    if (
      values.billingType === "business" &&
      `${values.companyName ?? ""} ${values.legalForm ?? ""}`.trim().length >
        255
    ) {
      context.addIssue({
        code: "custom",
        path: ["legalForm"],
        message:
          "Firmenname und Rechtsform dürfen zusammen höchstens 255 Zeichen lang sein.",
      });
    }
    if (values.billingType === "business" && values.differentBillingAddress) {
      if (!values.billingStreet || values.billingStreet.length < 3) {
        context.addIssue({
          code: "custom",
          path: ["billingStreet"],
          message: "Bitte gib Straße und Hausnummer der Rechnungsadresse ein.",
        });
      }
      if (!values.billingPostalCode || values.billingPostalCode.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["billingPostalCode"],
          message: "Bitte gib die Postleitzahl der Rechnungsadresse ein.",
        });
      }
      if (!values.billingCity || values.billingCity.length < 2) {
        context.addIssue({
          code: "custom",
          path: ["billingCity"],
          message: "Bitte gib den Ort der Rechnungsadresse ein.",
        });
      }
      if (!values.billingCountry) {
        context.addIssue({
          code: "custom",
          path: ["billingCountry"],
          message: "Bitte wähle das Land der Rechnungsadresse.",
        });
      }
    }
  });

type AccountValues = z.infer<typeof accountSchema>;
type LoginValues = z.infer<typeof loginSchema>;
type BillingFormValues = z.input<typeof billingSchema>;
export type BillingValues = z.output<typeof billingSchema>;

type AuthenticatedCheckoutUser = {
  firstName: string;
  lastName: string;
  email: string;
  emailVerified: boolean;
};

const countries = [["DE", "Deutschland"]] as const;

function CountryOptions() {
  return countries.map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function getBillingAddress(billing: BillingValues) {
  const usesDifferentAddress =
    billing.billingType === "business" && billing.differentBillingAddress;
  return {
    street: usesDifferentAddress ? billing.billingStreet! : billing.street,
    postalCode: usesDifferentAddress
      ? billing.billingPostalCode!
      : billing.postalCode,
    city: usesDifferentAddress ? billing.billingCity! : billing.city,
    country: usesDifferentAddress
      ? billing.billingCountry!
      : billing.billingType === "business"
        ? billing.companyCountry!
        : billing.country,
  };
}

function getInvoiceName(billing: BillingValues) {
  if (billing.billingType !== "business" || !billing.companyName) {
    return `${billing.firstName} ${billing.lastName}`;
  }
  const legalForm = billing.legalForm?.trim();
  return legalForm
    ? `${billing.companyName.trim()} ${legalForm}`
    : billing.companyName.trim();
}

function StepIndicator({ step }: { step: number }) {
  const steps = [
    { label: "Teilnehmerdaten", icon: UserRound },
    { label: "Rechnungsdaten", icon: FileCheck2 },
    { label: "Sicher bezahlen", icon: CreditCard },
  ];
  return (
    <ol className="grid min-w-0 grid-cols-3 gap-2" aria-label="Bestellschritte">
      {steps.map(({ label, icon: Icon }, index) => {
        const position = index + 1;
        const active = step >= position;
        return (
          <li key={label} className="relative min-w-0 text-center">
            {index > 0 && (
              <span
                className={`absolute top-5 right-1/2 h-px w-full ${step > index ? "bg-gold" : "bg-line"}`}
                aria-hidden="true"
              />
            )}
            <span
              className={`relative mx-auto grid size-10 place-items-center rounded-full border ${active ? "border-navy bg-navy text-white" : "border-line bg-white text-muted"}`}
            >
              {step > position ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Icon className="size-4" aria-hidden="true" />
              )}
            </span>
            <span
              className={`mt-2 block hyphens-auto text-[0.7rem] font-bold sm:text-xs ${active ? "text-navy" : "text-muted"}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function AccountStep({
  onComplete,
}: {
  onComplete: (identity: {
    firstName: string;
    lastName: string;
    email: string;
  }) => void;
}) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [message, setMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticatedUser, setAuthenticatedUser] =
    useState<AuthenticatedCheckoutUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const accountForm = useForm<AccountValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      passwordConfirmation: "",
    },
  });
  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function createIntent(values: {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
  }) {
    const response = await fetch("/api/checkout/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      const error = new Error(
        data.message ??
          "Die sichere Checkout-Sitzung konnte nicht vorbereitet werden.",
      );
      Object.assign(error, { code: data.error });
      throw error;
    }
    return data;
  }

  async function readAuthenticatedUser() {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as {
      authenticated?: boolean;
      emailVerified?: boolean;
      user?: { email?: string; firstName?: string; lastName?: string };
    };
    if (!response.ok || !data.authenticated || !data.user?.email) return null;
    return {
      firstName: data.user.firstName ?? "",
      lastName: data.user.lastName ?? "",
      email: data.user.email,
      emailVerified: Boolean(data.emailVerified),
    } satisfies AuthenticatedCheckoutUser;
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const intentResponse = await fetch("/api/checkout/intent/status", {
        cache: "no-store",
      });
      const intentData = (await intentResponse.json().catch(() => ({}))) as {
        ready?: boolean;
        identity?: { email?: string; firstName?: string; lastName?: string };
      };
      if (
        intentResponse.ok &&
        intentData.ready &&
        intentData.identity?.email &&
        intentData.identity.firstName &&
        intentData.identity.lastName
      ) {
        if (active) {
          onComplete({
            firstName: intentData.identity.firstName,
            lastName: intentData.identity.lastName,
            email: intentData.identity.email,
          });
        }
        return;
      }

      const currentUser = await readAuthenticatedUser();
      if (active) setAuthenticatedUser(currentUser);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
    // Die Prüfung soll nur beim Öffnen dieses Checkout-Schritts laufen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signup(values: AccountValues) {
    setMessage(null);
    try {
      await createIntent({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });
      accountForm.resetField("password");
      accountForm.resetField("passwordConfirmation");
      trackEvent("checkout_identity_completed");
      onComplete({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "checkout_login_required"
      ) {
        loginForm.setValue("email", values.email);
        accountForm.resetField("password");
        accountForm.resetField("passwordConfirmation");
        setMode("login");
      }
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "checkout_email_mismatch"
      ) {
        const currentUser = await readAuthenticatedUser().catch(() => null);
        if (currentUser) setAuthenticatedUser(currentUser);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Checkout-Sitzung konnte nicht angelegt werden.",
      );
    }
  }

  async function continueWithAuthenticatedUser() {
    if (!authenticatedUser) return;
    setMessage(null);
    try {
      await createIntent({
        firstName: authenticatedUser.firstName,
        lastName: authenticatedUser.lastName,
        email: authenticatedUser.email,
      });
      trackEvent("checkout_identity_completed");
      onComplete(authenticatedUser);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Checkout-Sitzung konnte nicht vorbereitet werden.",
      );
    }
  }

  async function logoutForNewBooking() {
    setLoggingOut(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      if (!response.ok) {
        setMessage(
          data.message ??
            "Die Abmeldung war nicht möglich. Bitte versuche es erneut.",
        );
        return;
      }
      setAuthenticatedUser(null);
      setMode("signup");
      accountForm.reset();
      loginForm.reset();
    } catch {
      setMessage(
        "Die Abmeldung war wegen einer Netzwerkstörung nicht möglich. Bitte versuche es erneut.",
      );
    } finally {
      setLoggingOut(false);
    }
  }

  async function login(values: LoginValues) {
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
          "Die Anmeldung war nicht möglich. Prüfe deine Eingaben.",
      );
      return;
    }
    const sessionResponse = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    const sessionData = (await sessionResponse.json().catch(() => ({}))) as {
      authenticated?: boolean;
      emailVerified?: boolean;
      user?: { firstName?: string; lastName?: string; email?: string };
    };
    const identity = {
      firstName: sessionData.user?.firstName ?? "",
      lastName: sessionData.user?.lastName ?? "",
      email: sessionData.user?.email ?? values.email,
    };
    if (
      !sessionResponse.ok ||
      !sessionData.authenticated ||
      !sessionData.emailVerified
    ) {
      setMessage(
        "Deine bestätigte Anmeldung konnte nicht geladen werden. Bitte versuche es erneut.",
      );
      return;
    }
    if (!identity.firstName || !identity.lastName) {
      setMessage(
        "Bitte ergänze zuerst Vor- und Nachnamen in deinem Profil oder nutze die neue Buchung.",
      );
      return;
    }
    try {
      await createIntent(identity);
      trackEvent("checkout_identity_completed");
      onComplete(identity);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Die Checkout-Sitzung konnte nicht vorbereitet werden.",
      );
    }
  }

  if (checkingSession) {
    return (
      <div className="grid min-h-48 place-items-center" role="status">
        <div className="text-center">
          <LoaderCircle
            className="mx-auto size-7 animate-spin text-gold"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-semibold text-muted">
            Sichere Sitzung wird geprüft …
          </p>
        </div>
      </div>
    );
  }

  if (authenticatedUser) {
    const canContinue =
      authenticatedUser.emailVerified &&
      Boolean(authenticatedUser.firstName) &&
      Boolean(authenticatedUser.lastName);
    const displayName =
      [authenticatedUser.firstName, authenticatedUser.lastName]
        .filter(Boolean)
        .join(" ") || "Angemeldetes Konto";

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-success/25 bg-success/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-success/10 text-success">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">
                Du bist bereits angemeldet
              </p>
              <p className="mt-1 font-semibold text-navy">{displayName}</p>
              <p className="break-all text-sm text-muted">
                {authenticatedUser.email}
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            Eine Buchung kann aus Sicherheitsgründen nur mit der E-Mail-Adresse
            des angemeldeten Kontos abgeschlossen werden.
          </p>
        </div>

        {!canContinue && (
          <p
            className="rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm leading-6 text-navy"
            role="status"
          >
            Dieses ältere Konto ist noch nicht vollständig eingerichtet. Melde
            dich bitte ab und starte die Buchung mit deinen vollständigen Daten
            neu.
          </p>
        )}
        {message && (
          <p
            className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm leading-6 text-danger"
            role="alert"
          >
            {message}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {canContinue && (
            <Button
              type="button"
              size="lg"
              onClick={() => void continueWithAuthenticatedUser()}
            >
              Mit diesem Konto fortfahren
              <ArrowRight className="size-5" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className={canContinue ? undefined : "sm:col-span-2"}
            disabled={loggingOut}
            onClick={() => void logoutForNewBooking()}
          >
            {loggingOut && (
              <LoaderCircle
                className="size-5 animate-spin"
                aria-hidden="true"
              />
            )}
            Abmelden und neu buchen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="mb-7 grid grid-cols-2 rounded-xl bg-beige/45 p-1"
        role="tablist"
        aria-label="Konto wählen"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "signup"}
          className={`min-h-11 rounded-lg px-3 text-sm font-bold ${mode === "signup" ? "bg-white text-navy shadow-sm" : "text-muted"}`}
          onClick={() => {
            setMode("signup");
            setMessage(null);
          }}
        >
          Neue Buchung
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={`min-h-11 rounded-lg px-3 text-sm font-bold ${mode === "login" ? "bg-white text-navy shadow-sm" : "text-muted"}`}
          onClick={() => {
            setMode("login");
            setMessage(null);
          }}
        >
          Ich habe ein Konto
        </button>
      </div>

      {mode === "signup" ? (
        <form
          onSubmit={accountForm.handleSubmit(signup)}
          className="space-y-5"
          noValidate
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Vorname"
              autoComplete="given-name"
              required
              error={accountForm.formState.errors.firstName?.message}
              {...accountForm.register("firstName")}
            />
            <Field
              label="Nachname"
              autoComplete="family-name"
              required
              error={accountForm.formState.errors.lastName?.message}
              {...accountForm.register("lastName")}
            />
          </div>
          <Field
            label="E-Mail-Adresse"
            type="email"
            autoComplete="email"
            required
            error={accountForm.formState.errors.email?.message}
            {...accountForm.register("email")}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Passwort festlegen"
              type="password"
              autoComplete="new-password"
              required
              hint="Mindestens 12 Zeichen mit Groß-/Kleinbuchstabe, Zahl und Sonderzeichen."
              error={accountForm.formState.errors.password?.message}
              {...accountForm.register("password")}
            />
            <Field
              label="Passwort wiederholen"
              type="password"
              autoComplete="new-password"
              required
              error={accountForm.formState.errors.passwordConfirmation?.message}
              {...accountForm.register("passwordConfirmation")}
            />
          </div>
          <p className="rounded-xl border border-line bg-ivory/60 p-4 text-sm leading-6 text-muted">
            Vor der Zahlung wird noch kein Konto erstellt. Nach bestätigter
            Zahlung richten wir deinen Teilnehmerzugang automatisch ein und
            melden dich sicher an. Prüfe deine E-Mail-Adresse bitte sorgfältig,
            da keine zusätzliche Bestätigungs-E-Mail erforderlich ist.
          </p>
          {message && (
            <p
              className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm leading-6 text-danger"
              role="alert"
            >
              {message}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={accountForm.formState.isSubmitting}
          >
            {accountForm.formState.isSubmitting ? (
              <LoaderCircle
                className="size-5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <>
                Weiter zu den Rechnungsdaten{" "}
                <ArrowRight className="size-5" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={loginForm.handleSubmit(login)}
          className="space-y-5"
          noValidate
        >
          <Field
            label="E-Mail-Adresse"
            type="email"
            autoComplete="email"
            required
            error={loginForm.formState.errors.email?.message}
            {...loginForm.register("email")}
          />
          <Field
            label="Passwort"
            type="password"
            autoComplete="current-password"
            required
            error={loginForm.formState.errors.password?.message}
            {...loginForm.register("password")}
          />
          <div className="text-right">
            <Link
              href="/passwort-vergessen"
              className="text-sm font-bold text-navy underline decoration-gold underline-offset-4"
            >
              Passwort vergessen?
            </Link>
          </div>
          {message && (
            <p
              className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm leading-6 text-danger"
              role="alert"
            >
              {message}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={loginForm.formState.isSubmitting}
          >
            {loginForm.formState.isSubmitting && (
              <LoaderCircle
                className="size-5 animate-spin"
                aria-hidden="true"
              />
            )}
            Sicher anmelden und fortfahren
          </Button>
        </form>
      )}
    </div>
  );
}

function BillingStep({
  identity,
  onBack,
  onComplete,
}: {
  identity: { firstName: string; lastName: string; email: string };
  onBack: () => void;
  onComplete: (values: BillingValues) => void;
}) {
  const form = useForm<BillingFormValues, unknown, BillingValues>({
    resolver: zodResolver(billingSchema),
    shouldUnregister: true,
    defaultValues: {
      billingType: "private",
      firstName: identity.firstName,
      lastName: identity.lastName,
      companyName: "",
      contactPerson: "",
      legalForm: "",
      companyCountry: "DE",
      street: "",
      postalCode: "",
      city: "",
      country: "DE",
      differentBillingAddress: false,
      billingStreet: "",
      billingPostalCode: "",
      billingCity: "",
      billingCountry: "DE",
      taxId: "",
    },
  });
  const billingType = useWatch({ control: form.control, name: "billingType" });
  const differentBillingAddress = useWatch({
    control: form.control,
    name: "differentBillingAddress",
  });
  const differentBillingAddressRegistration = form.register(
    "differentBillingAddress",
  );
  function complete(values: BillingValues) {
    onComplete({
      ...values,
      country:
        values.billingType === "business"
          ? values.companyCountry!
          : values.country,
    });
  }
  return (
    <form
      onSubmit={form.handleSubmit(complete)}
      className="space-y-6"
      noValidate
    >
      <fieldset>
        <legend className="mb-3 text-sm font-bold text-navy">
          Du buchst als
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(["private", "business"] as const).map((type) => (
            <label
              key={type}
              className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm font-bold ${billingType === type ? "border-navy bg-navy/5 text-navy" : "border-line bg-white text-muted"}`}
            >
              <input
                type="radio"
                value={type}
                className="accent-navy"
                {...form.register("billingType")}
              />
              {type === "private" ? (
                <UserRound className="size-5" aria-hidden="true" />
              ) : (
                <Building2 className="size-5" aria-hidden="true" />
              )}
              {type === "private" ? "Privatperson" : "Unternehmen"}
            </label>
          ))}
        </div>
      </fieldset>
      {billingType === "business" && (
        <div className="space-y-5 rounded-2xl border border-line bg-ivory/60 p-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Firmenname (ohne Rechtsform)"
              autoComplete="organization"
              required
              error={form.formState.errors.companyName?.message}
              {...form.register("companyName")}
            />
            <Field
              label="Rechtsform (optional)"
              autoComplete="off"
              error={form.formState.errors.legalForm?.message}
              hint="Zum Beispiel Einzelunternehmen, GmbH oder GbR."
              {...form.register("legalForm")}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Ansprechpartner (optional)"
              autoComplete="name"
              error={form.formState.errors.contactPerson?.message}
              {...form.register("contactPerson")}
            />
            <SelectField
              label="Unternehmensland"
              autoComplete="country"
              required
              error={form.formState.errors.companyCountry?.message}
              {...form.register("companyCountry")}
            >
              <CountryOptions />
            </SelectField>
          </div>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Vorname"
          autoComplete="given-name"
          required
          error={form.formState.errors.firstName?.message}
          {...form.register("firstName")}
        />
        <Field
          label="Nachname"
          autoComplete="family-name"
          required
          error={form.formState.errors.lastName?.message}
          {...form.register("lastName")}
        />
      </div>
      <div>
        <p className="mb-4 text-sm font-bold text-navy">
          {billingType === "business"
            ? "Unternehmensanschrift"
            : "Rechnungsanschrift"}
        </p>
        <div className="space-y-5">
          <Field
            label="Straße und Hausnummer"
            autoComplete="street-address"
            required
            error={form.formState.errors.street?.message}
            {...form.register("street")}
          />
          <div className="grid gap-5 sm:grid-cols-[0.7fr_1.3fr]">
            <Field
              label="Postleitzahl"
              autoComplete="postal-code"
              required
              error={form.formState.errors.postalCode?.message}
              {...form.register("postalCode")}
            />
            <Field
              label="Ort"
              autoComplete="address-level2"
              required
              error={form.formState.errors.city?.message}
              {...form.register("city")}
            />
          </div>
          {billingType === "private" && (
            <SelectField
              label="Land"
              autoComplete="country"
              required
              error={form.formState.errors.country?.message}
              {...form.register("country")}
            >
              <CountryOptions />
            </SelectField>
          )}
        </div>
      </div>
      {billingType === "business" && (
        <>
          <Checkbox
            id="different-billing-address"
            name={differentBillingAddressRegistration.name}
            onBlur={differentBillingAddressRegistration.onBlur}
            checked={differentBillingAddress ?? false}
            onChange={differentBillingAddressRegistration.onChange}
            label="Die Rechnungsadresse weicht von der Unternehmensanschrift ab."
          />
          {differentBillingAddress && (
            <fieldset className="space-y-5 rounded-2xl border border-line bg-white p-5">
              <legend className="px-2 text-sm font-bold text-navy">
                Abweichende Rechnungsadresse
              </legend>
              <Field
                label="Straße und Hausnummer"
                autoComplete="billing street-address"
                required
                error={form.formState.errors.billingStreet?.message}
                {...form.register("billingStreet")}
              />
              <div className="grid gap-5 sm:grid-cols-[0.7fr_1.3fr]">
                <Field
                  label="Postleitzahl"
                  autoComplete="billing postal-code"
                  required
                  error={form.formState.errors.billingPostalCode?.message}
                  {...form.register("billingPostalCode")}
                />
                <Field
                  label="Ort"
                  autoComplete="billing address-level2"
                  required
                  error={form.formState.errors.billingCity?.message}
                  {...form.register("billingCity")}
                />
              </div>
              <SelectField
                label="Rechnungsland"
                autoComplete="billing country"
                required
                error={form.formState.errors.billingCountry?.message}
                {...form.register("billingCountry")}
              >
                <CountryOptions />
              </SelectField>
            </fieldset>
          )}
          <Field
            label="Umsatzsteuer-ID (optional)"
            autoComplete="off"
            error={form.formState.errors.taxId?.message}
            hint="Nur angeben, wenn für dein Unternehmen vorhanden und für die Rechnung relevant."
            {...form.register("taxId")}
          />
        </>
      )}
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" size="lg" onClick={onBack}>
          <ArrowLeft className="size-5" aria-hidden="true" />
          Zurück
        </Button>
        <Button type="submit" size="lg">
          Zur sicheren Zahlung{" "}
          <ArrowRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function PaymentPanel({
  sessionId,
  billing,
  product,
  totals,
  onError,
  onCancel,
  cancelling,
}: {
  sessionId: string;
  billing: BillingValues;
  product: PublicProduct;
  totals: Extract<CheckoutTotals, { status: "ready" }>;
  onError: (message: string) => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const result = useCheckoutElements();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);

  if (result.type === "loading")
    return (
      <div className="grid min-h-56 place-items-center" role="status">
        <LoaderCircle className="size-7 animate-spin text-gold" />
        <span className="sr-only">Zahlungsformular wird geladen</span>
      </div>
    );
  if (result.type === "error")
    return (
      <p
        className="rounded-xl bg-danger/5 p-4 text-sm text-danger"
        role="alert"
      >
        {result.error.message}
      </p>
    );
  const { checkout } = result;

  async function confirm() {
    const address = getBillingAddress(billing);
    setProcessing(true);
    onError("");
    trackEvent("checkout_payment_submitted");
    const confirmed = await checkout.confirm({
      redirect: "if_required",
      returnUrl: `${window.location.origin}/zahlung-erfolgreich?session_id=${encodeURIComponent(sessionId)}`,
      billingAddress: {
        name: getInvoiceName(billing),
        address: {
          line1: address.street,
          postal_code: address.postalCode,
          city: address.city,
          country: address.country,
        },
      },
    });
    if (confirmed.type === "error") {
      trackEvent("checkout_payment_error");
      onError(
        confirmed.error.message ||
          "Die Zahlung konnte nicht abgeschlossen werden.",
      );
      setProcessing(false);
      return;
    }
    router.push(
      `/zahlung-erfolgreich?session_id=${encodeURIComponent(sessionId)}`,
    );
  }

  return (
    <div className="space-y-5">
      <section
        className="rounded-xl border border-navy/15 bg-ivory/60 p-4"
        aria-labelledby="binding-order-total"
      >
        <h3 id="binding-order-total" className="text-sm font-bold text-navy">
          Verbindliche Bestellübersicht
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted">
          {product.name || COURSE.productName}
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {totals.taxBehavior === "exclusive"
                ? "Preis vor Steuer"
                : "Produktpreis"}
            </dt>
            <dd className="font-semibold text-navy">
              {formatPrice(totals.subtotal, totals.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {totals.taxBehavior === "inclusive"
                ? "Darin enthaltene Umsatzsteuer"
                : "Umsatzsteuer"}
            </dt>
            <dd className="font-semibold text-navy">
              {formatPrice(totals.tax, totals.currency)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2 text-base">
            <dt className="font-extrabold text-navy">Gesamtbetrag</dt>
            <dd className="font-extrabold text-navy">
              {formatPrice(totals.total, totals.currency)}
            </dd>
          </div>
        </dl>
      </section>
      <PaymentElement
        options={{ layout: "accordion", fields: { billingDetails: "never" } }}
      />
      <Button
        type="button"
        size="lg"
        className="w-full"
        onClick={() => void confirm()}
        disabled={processing}
      >
        {processing ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Zahlung wird sicher verarbeitet
          </>
        ) : (
          <>
            <LockKeyhole className="size-5" aria-hidden="true" />
            Zahlungspflichtig bestellen
          </>
        )}
      </Button>
      <button
        type="button"
        className="mx-auto block text-sm font-bold text-muted underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onCancel}
        disabled={processing || cancelling}
      >
        {cancelling ? "Checkout wird beendet …" : "Checkout abbrechen"}
      </button>
      <p className="flex items-center justify-center gap-2 text-center text-xs leading-5 text-muted">
        <ShieldCheck className="size-4 text-success" aria-hidden="true" />
        Zahlungsdaten werden verschlüsselt von Stripe verarbeitet und nicht auf
        unserem Server gespeichert.
      </p>
    </div>
  );
}

function PaymentStep({
  product,
  billing,
  identity,
  publishableKey,
  consentVersion,
  onBack,
}: {
  product: PublicProduct;
  billing: BillingValues;
  identity: { firstName: string; lastName: string; email: string };
  publishableKey: string;
  consentVersion: string;
  onBack: () => void;
}) {
  const [terms, setTerms] = useState(false);
  const [privacyNoticeAcknowledged, setPrivacyNoticeAcknowledged] =
    useState(false);
  const [earlyAccess, setEarlyAccess] = useState(false);
  const [consentErrors, setConsentErrors] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [session, setSession] = useState<{
    clientSecret: string;
    sessionId: string;
    expiresAt: number;
    product: PublicProduct;
    totals: CheckoutTotals;
  } | null>(null);
  const stripePromise = useMemo(
    () => (publishableKey ? loadStripe(publishableKey) : Promise.resolve(null)),
    [publishableKey],
  );
  const router = useRouter();
  const billingAddress = getBillingAddress(billing);

  async function preparePayment() {
    if (!terms || !privacyNoticeAcknowledged || !earlyAccess) {
      setConsentErrors(true);
      return;
    }
    setCreating(true);
    setError("");
    setConsentErrors(false);
    try {
      const response = await fetch("/api/checkout/intent/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...billing,
          termsAccepted: terms && privacyNoticeAcknowledged,
          earlyAccessAccepted: earlyAccess,
          consentVersion,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        clientSecret?: string;
        sessionId?: string;
        expiresAt?: number;
        product?: PublicProduct;
        totals?: unknown;
        message?: string;
      };
      const totals = parseCheckoutTotals(data.totals);
      if (
        !response.ok ||
        !data.clientSecret ||
        !data.sessionId ||
        !Number.isSafeInteger(data.expiresAt) ||
        (data.expiresAt ?? 0) * 1000 <= Date.now() ||
        !data.product ||
        !totals
      ) {
        setError(
          data.message ??
            "Die sichere Zahlung konnte nicht vorbereitet werden. Bitte versuche es erneut.",
        );
        return;
      }
      setSession({
        clientSecret: data.clientSecret,
        sessionId: data.sessionId,
        expiresAt: data.expiresAt!,
        product: data.product,
        totals,
      });
      trackEvent("checkout_payment_form_opened");
    } catch {
      setError(
        "Die sichere Zahlung konnte wegen einer Netzwerkstörung nicht geöffnet werden. Bitte versuche es erneut.",
      );
    } finally {
      setCreating(false);
    }
  }

  const cancelPayment = useCallback(async () => {
    setCancelling(true);
    setError("");
    try {
      const response = await fetch("/api/checkout/intent/cancel", {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as {
        redirectUrl?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(
          data.message ??
            "Der Checkout konnte gerade nicht sicher beendet werden.",
        );
        return;
      }
      trackEvent("checkout_cancelled");
      router.replace(data.redirectUrl ?? "/checkout?payment=cancelled");
      router.refresh();
    } catch {
      setError(
        "Der Checkout konnte wegen einer Netzwerkstörung nicht sicher beendet werden. Bitte versuche es erneut.",
      );
    } finally {
      setCancelling(false);
    }
  }, [router]);

  useEffect(() => {
    if (!session) return;
    const millisecondsUntilExpiry = Math.max(
      0,
      session.expiresAt * 1000 - Date.now() + 1_500,
    );
    const timer = window.setTimeout(
      () => void cancelPayment(),
      millisecondsUntilExpiry,
    );
    return () => window.clearTimeout(timer);
  }, [cancelPayment, session]);

  useEffect(() => {
    if (!session || session.totals.status === "ready") return;

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sessionId = session.sessionId;

    async function refreshTotals() {
      attempts += 1;
      try {
        const response = await fetch(
          `/api/checkout/intent/session?session_id=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        );
        const data = (await response.json().catch(() => ({}))) as {
          sessionId?: string;
          sessionStatus?: string;
          totals?: unknown;
          message?: string;
        };
        const totals = parseCheckoutTotals(data.totals);
        if (!response.ok || data.sessionId !== sessionId || !totals) {
          throw new Error(
            data.message ?? "Die Zahlungssumme ist noch nicht verfügbar.",
          );
        }
        if (cancelled) return;
        if (data.sessionStatus === "expired") {
          setError(
            "Die Zahlungssitzung ist abgelaufen. Bitte öffne die sichere Zahlung erneut.",
          );
          setSession(null);
          return;
        }
        if (totals.status === "ready") {
          setSession((current) =>
            current?.sessionId === sessionId ? { ...current, totals } : current,
          );
          return;
        }
      } catch {
        // A short Stripe delay or transient network error is safe to retry.
      }

      if (attempts >= 15) {
        setError(
          "Die verbindliche Zahlungssumme konnte nicht bestätigt werden. Bitte öffne die sichere Zahlung erneut.",
        );
        setSession(null);
        return;
      }
      timer = setTimeout(() => void refreshTotals(), 2000);
    }

    timer = setTimeout(() => void refreshTotals(), 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [session]);

  const effectiveProduct = session?.product ?? product;
  const priceLabel =
    effectiveProduct.unitAmount !== null
      ? formatPrice(effectiveProduct.unitAmount, effectiveProduct.currency)
      : "Wird sicher aus Stripe geladen";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-ivory/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-navy">
              {effectiveProduct.name || COURSE.productName}
            </p>
            <p className="mt-1 text-xs text-muted">
              Einmalzahlung · kein Abonnement
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-serif text-xl font-semibold text-navy">
              {priceLabel}
            </p>
            {effectiveProduct.unitAmount !== null ? (
              <p className="mt-1 text-xs font-semibold text-muted">
                {effectiveProduct.taxBehavior === "inclusive"
                  ? "inkl. MwSt."
                  : effectiveProduct.taxBehavior === "exclusive"
                    ? "zzgl. MwSt."
                    : "Steuerangabe im Checkout"}
              </p>
            ) : null}
          </div>
        </div>
        <ul className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
          {[
            "Sieben Lektionen",
            "Geschützte Lernvideos",
            "Sieben Wissenstests",
            "Ergänzende Materialien",
            "Persönlicher Teilnehmerbereich",
            "Abschlusszertifikat nach Bestehen",
            COURSE_ACCESS_LABEL,
            "Rechnung im Portal",
          ].map((item) => (
            <li key={item} className="flex gap-2">
              <Check
                className="mt-0.5 size-3.5 shrink-0 text-success"
                aria-hidden="true"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {!session ? (
        <>
          <div className="space-y-3">
            <Checkbox
              id="terms"
              aria-label="Ich akzeptiere die AGB."
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              error={
                consentErrors && !terms
                  ? "Diese Zustimmung ist erforderlich."
                  : undefined
              }
              label={
                <>
                  Ich akzeptiere die{" "}
                  <Link
                    className="font-bold underline decoration-gold underline-offset-4"
                    href="/agb"
                    target="_blank"
                  >
                    AGB
                  </Link>
                  .
                </>
              }
            />
            <Checkbox
              id="privacy-notice"
              aria-label="Ich habe die Datenschutzerklärung zur Kenntnis genommen."
              checked={privacyNoticeAcknowledged}
              onChange={(event) =>
                setPrivacyNoticeAcknowledged(event.target.checked)
              }
              error={
                consentErrors && !privacyNoticeAcknowledged
                  ? "Diese Kenntnisnahme ist erforderlich."
                  : undefined
              }
              label={
                <>
                  Ich habe die{" "}
                  <Link
                    className="font-bold underline decoration-gold underline-offset-4"
                    href="/datenschutz"
                    target="_blank"
                  >
                    Datenschutzerklärung
                  </Link>{" "}
                  zur Kenntnis genommen.
                </>
              }
            />
            <Checkbox
              id="early-access"
              checked={earlyAccess}
              onChange={(event) => setEarlyAccess(event.target.checked)}
              error={
                consentErrors && !earlyAccess
                  ? "Diese ausdrückliche Erklärung ist für den sofortigen Zugang erforderlich."
                  : undefined
              }
              label={EARLY_ACCESS_ACCEPTANCE_TEXT}
            />
          </div>
          <p className="rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs leading-5 text-muted">
            Die Einzelheiten zu Frist, Folgen und einem möglichen Erlöschen
            findest du in der{" "}
            <Link
              className="font-bold text-navy underline decoration-gold underline-offset-4"
              href="/widerruf"
              target="_blank"
            >
              Widerrufsbelehrung
            </Link>
            .
          </p>
          {error && (
            <p
              className="rounded-xl bg-danger/5 p-4 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
            <Button variant="ghost" size="lg" onClick={onBack}>
              <ArrowLeft className="size-5" />
              Zurück
            </Button>
            <Button
              size="lg"
              onClick={preparePayment}
              disabled={creating || !publishableKey}
            >
              {creating ? (
                <LoaderCircle className="size-5 animate-spin" />
              ) : (
                <LockKeyhole className="size-5" />
              )}
              Sichere Zahlung öffnen
            </Button>
          </div>
          {!publishableKey && (
            <p className="text-sm text-danger" role="alert">
              Die Stripe-Publishable-Key-Konfiguration fehlt. Eine Zahlung ist
              derzeit nicht möglich.
            </p>
          )}
        </>
      ) : session.totals.status !== "ready" ? (
        <div className="space-y-4">
          <div
            className="grid min-h-56 place-items-center rounded-xl border border-line bg-white p-6 text-center"
            role="status"
          >
            <div>
              <LoaderCircle
                className="mx-auto size-7 animate-spin text-gold"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-bold text-navy">
                Steuer und Gesamtbetrag werden verbindlich berechnet
              </p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Die Zahlung kann erst nach Bestätigung der Stripe-Gesamtsumme
                abgeschlossen werden.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="mx-auto block text-sm font-bold text-muted underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void cancelPayment()}
            disabled={cancelling}
          >
            {cancelling ? "Checkout wird beendet …" : "Checkout abbrechen"}
          </button>
        </div>
      ) : (
        <CheckoutElementsProvider
          stripe={stripePromise}
          options={{
            clientSecret: session.clientSecret,
            defaultValues: {
              email: identity.email,
              billingAddress: {
                name: getInvoiceName(billing),
                address: {
                  line1: billingAddress.street,
                  city: billingAddress.city,
                  postal_code: billingAddress.postalCode,
                  country: billingAddress.country,
                },
              },
            },
            elementsOptions: {
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#1D2733",
                  colorText: "#20242A",
                  colorDanger: "#A33A3A",
                  borderRadius: "12px",
                  fontFamily: "Manrope, sans-serif",
                },
              },
            },
          }}
        >
          {error && (
            <p
              className="mb-4 rounded-xl bg-danger/5 p-4 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          )}
          <PaymentPanel
            sessionId={session.sessionId}
            billing={billing}
            product={session.product}
            totals={session.totals}
            onError={setError}
            onCancel={() => void cancelPayment()}
            cancelling={cancelling}
          />
        </CheckoutElementsProvider>
      )}
    </div>
  );
}

export function CheckoutFlow({
  product,
  publishableKey,
  consentVersion,
}: {
  product: PublicProduct;
  publishableKey: string;
  consentVersion: string;
}) {
  const [step, setStep] = useState(1);
  const [identity, setIdentity] = useState<{
    firstName: string;
    lastName: string;
    email: string;
  } | null>(null);
  const [billing, setBilling] = useState<BillingValues | null>(null);
  if (
    !product.available ||
    product.unitAmount === null ||
    !product.currency ||
    !consentVersion
  ) {
    return (
      <div
        className="rounded-2xl border border-gold/30 bg-gold/5 p-6"
        role="status"
      >
        <h2 className="font-serif text-2xl font-semibold text-navy">
          Die Buchung ist derzeit noch nicht freigegeben
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Preis, Kursinhalte und Rechtstexte müssen vollständig bestätigt sein,
          bevor persönliche Daten erfasst oder eine Zahlung geöffnet werden.
          Bitte versuche es später erneut oder wende dich an den Support.
        </p>
        <Link
          href="/kontakt"
          className="mt-4 inline-flex font-bold text-navy underline decoration-gold underline-offset-4"
        >
          Support kontaktieren
        </Link>
      </div>
    );
  }
  return (
    <div>
      <StepIndicator step={step} />
      <div className="mt-9 border-t border-line pt-8">
        <div className="mb-7">
          <p className="text-xs font-extrabold tracking-[0.15em] text-gold uppercase">
            Schritt {step} von 3
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.025em] text-navy">
            {step === 1
              ? "Teilnehmerdaten"
              : step === 2
                ? "Rechnungsdaten"
                : "Sicher bezahlen"}
          </h2>
        </div>
        {step === 1 && (
          <AccountStep
            onComplete={(value) => {
              setIdentity(value);
              setStep(2);
            }}
          />
        )}
        {step === 2 && identity && (
          <BillingStep
            identity={identity}
            onBack={() => setStep(1)}
            onComplete={(value) => {
              setBilling(value);
              trackEvent("checkout_billing_completed");
              setStep(3);
            }}
          />
        )}
        {step === 3 && identity && billing && (
          <PaymentStep
            product={product}
            billing={billing}
            identity={identity}
            publishableKey={publishableKey}
            consentVersion={consentVersion}
            onBack={() => setStep(2)}
          />
        )}
      </div>
    </div>
  );
}
