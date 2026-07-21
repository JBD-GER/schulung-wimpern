import "server-only";

import type { Metadata } from "next";
import { z } from "zod";

const REQUIRED_PROVIDER_FIELDS = {
  companyName: "NEXT_PUBLIC_LEGAL_COMPANY_NAME",
  representative: "NEXT_PUBLIC_LEGAL_REPRESENTATIVE",
  street: "NEXT_PUBLIC_LEGAL_STREET",
  postalCity: "NEXT_PUBLIC_LEGAL_POSTAL_CITY",
  country: "NEXT_PUBLIC_LEGAL_COUNTRY",
  email: "NEXT_PUBLIC_LEGAL_EMAIL",
  phone: "NEXT_PUBLIC_LEGAL_PHONE",
} as const;

const PLACEHOLDER_PATTERN =
  /replace|your[_\s-]|example|muster|placeholder|todo|tbd|noch nicht|nicht festgelegt|unbekannt|^n\/?a$|^none$|^null$/i;
const SHA256_PATTERN = /^(?:sha256[-_:]?)?[a-f0-9]{64}$/i;
const REPEATED_HASH_PATTERN = /^([a-f0-9])\1{63}$/i;
const emailSchema = z.email();

type Environment = Record<string, string | undefined>;

export interface LegalProviderDraft {
  companyName: string | null;
  representative: string | null;
  street: string | null;
  postalCity: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  vatId: string | null;
}

export interface LegalProvider {
  companyName: string;
  representative: string;
  street: string;
  postalCity: string;
  country: string;
  email: string;
  phone: string;
  vatId: string | null;
}

export interface ReleaseContract {
  contentApproved: boolean;
  legal: {
    approvalRequested: boolean;
    approved: boolean;
    provider: LegalProviderDraft;
    releasedProvider: LegalProvider | null;
    checkoutConsentVersion: string | null;
    checkoutLegalTextHash: string | null;
    missing: readonly string[];
  };
  readyForSale: boolean;
}

function normalized(value: string | undefined): string | null {
  const result = value?.trim();
  return result || null;
}

function normalizedVatId(value: string | undefined): string | null {
  const result = normalized(value);
  return result && !/^nicht vorhanden$/i.test(result) ? result : null;
}

function flag(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function isPlaceholder(value: string): boolean {
  const normalizedValue = value.trim().toLowerCase();
  return (
    PLACEHOLDER_PATTERN.test(normalizedValue) ||
    normalizedValue.includes("[ergänzen]")
  );
}

function isUsableText(
  value: string | null,
  minimumLength = 2,
): value is string {
  return Boolean(
    value && value.length >= minimumLength && !isPlaceholder(value),
  );
}

function isUsableLegalTextHash(value: string | null): value is string {
  if (!value || !SHA256_PATTERN.test(value) || isPlaceholder(value))
    return false;
  const digest = value.replace(/^sha256[-_:]?/i, "");
  return !REPEATED_HASH_PATTERN.test(digest);
}

function readProvider(environment: Environment): LegalProviderDraft {
  return {
    companyName: normalized(environment.NEXT_PUBLIC_LEGAL_COMPANY_NAME),
    representative: normalized(environment.NEXT_PUBLIC_LEGAL_REPRESENTATIVE),
    street: normalized(environment.NEXT_PUBLIC_LEGAL_STREET),
    postalCity: normalized(environment.NEXT_PUBLIC_LEGAL_POSTAL_CITY),
    country: normalized(environment.NEXT_PUBLIC_LEGAL_COUNTRY),
    email: normalized(environment.NEXT_PUBLIC_LEGAL_EMAIL),
    phone: normalized(environment.NEXT_PUBLIC_LEGAL_PHONE),
    vatId: normalizedVatId(environment.NEXT_PUBLIC_LEGAL_VAT_ID),
  };
}

export function resolveReleaseContract(
  environment: Environment,
): ReleaseContract {
  const provider = readProvider(environment);
  const checkoutConsentVersion = normalized(
    environment.CHECKOUT_CONSENT_VERSION,
  );
  const checkoutLegalTextHash = normalized(
    environment.CHECKOUT_LEGAL_TEXT_HASH,
  );
  const missing: string[] = [];

  for (const [field, variable] of Object.entries(REQUIRED_PROVIDER_FIELDS)) {
    const value = provider[field as keyof LegalProviderDraft];
    if (!isUsableText(value)) missing.push(variable);
  }
  if (
    !provider.email ||
    !emailSchema.safeParse(provider.email).success ||
    isPlaceholder(provider.email)
  ) {
    if (!missing.includes(REQUIRED_PROVIDER_FIELDS.email))
      missing.push(REQUIRED_PROVIDER_FIELDS.email);
  }
  if (!provider.phone || !/[0-9]{5}/.test(provider.phone.replace(/\D/g, ""))) {
    if (!missing.includes(REQUIRED_PROVIDER_FIELDS.phone))
      missing.push(REQUIRED_PROVIDER_FIELDS.phone);
  }
  if (provider.vatId && isPlaceholder(provider.vatId))
    missing.push("NEXT_PUBLIC_LEGAL_VAT_ID");
  if (!isUsableText(checkoutConsentVersion, 3))
    missing.push("CHECKOUT_CONSENT_VERSION");
  if (!isUsableLegalTextHash(checkoutLegalTextHash)) {
    missing.push("CHECKOUT_LEGAL_TEXT_HASH");
  }

  const approvalRequested = flag(environment.LEGAL_TEXTS_APPROVED);
  const approved = approvalRequested && missing.length === 0;
  const contentApproved = flag(environment.CONTENT_RELEASE_APPROVED);
  const releasedProvider = approved ? (provider as LegalProvider) : null;

  return {
    contentApproved,
    legal: {
      approvalRequested,
      approved,
      provider,
      releasedProvider,
      checkoutConsentVersion,
      checkoutLegalTextHash,
      missing,
    },
    readyForSale: contentApproved && approved,
  };
}

export function getReleaseContract(): ReleaseContract {
  return resolveReleaseContract(process.env);
}

export function legalPageMetadata(input: {
  title: string;
  description: string;
  draftDescription: string;
  canonical: `/${string}`;
}): Metadata {
  const released = getReleaseContract().legal.approved;
  return {
    title: input.title,
    description: released ? input.description : input.draftDescription,
    alternates: { canonical: input.canonical },
    robots: released
      ? { index: true, follow: true }
      : { index: false, follow: true, nocache: true },
  };
}
