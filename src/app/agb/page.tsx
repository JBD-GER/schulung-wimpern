import type { Metadata } from "next";

import {
  CanonicalLegalText,
  LegalDocument,
} from "@/components/marketing/legal-document";
import {
  buildTermsText,
  type ContractProviderSnapshot,
} from "@/data/checkout-legal";
import { getReleaseContract, legalPageMetadata } from "@/lib/server/release";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return legalPageMetadata({
    title: "Allgemeine Geschäftsbedingungen",
    description:
      "Bedingungen für Buchung und Nutzung der Online-Schulung Wimpernverlängerung.",
    draftDescription:
      "Technisch vollständiger Entwurf der AGB für die Online-Schulung Wimpernverlängerung.",
    canonical: "/agb",
  });
}

function contractProvider(
  provider: ReturnType<typeof getReleaseContract>["legal"]["provider"],
): ContractProviderSnapshot {
  return {
    companyName: provider.companyName ?? "[Anbieterin noch nicht freigegeben]",
    representative:
      provider.representative ?? "[Vertretung noch nicht freigegeben]",
    street: provider.street ?? "[Anschrift noch nicht freigegeben]",
    postalCity: provider.postalCity ?? "[Ort noch nicht freigegeben]",
    country: provider.country ?? "[Land noch nicht freigegeben]",
    email: provider.email ?? "[E-Mail noch nicht freigegeben]",
    phone: provider.phone ?? "[Telefon noch nicht freigegeben]",
    vatId: provider.vatId,
    widStatus: provider.widStatus ?? "not_assigned",
    widId: provider.widId,
    registerStatus: provider.registerStatus ?? "not_registered",
    registerCourt: provider.registerCourt,
    registerNumber: provider.registerNumber,
    disputeStatement:
      provider.disputeStatement ??
      "[Erklärung zur Verbraucherstreitbeilegung noch nicht freigegeben]",
  };
}

export default function TermsPage() {
  const release = getReleaseContract();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "https://www.schulung-wimpernverlaengerung.de";
  const text = buildTermsText(
    contractProvider(release.legal.provider),
    siteUrl.replace(/\/$/, ""),
  );

  return (
    <LegalDocument
      eyebrow="Vertragsbedingungen"
      title="Allgemeine Geschäftsbedingungen"
      introduction="Bedingungen für Buchung und Nutzung der Online-Schulung Wimpernverlängerung. Diese Fassung wird beim Kauf vollständig in der Vertragsbestätigung gespeichert und per E-Mail übermittelt."
      released={release.legal.approved}
    >
      <CanonicalLegalText text={text} />
    </LegalDocument>
  );
}
