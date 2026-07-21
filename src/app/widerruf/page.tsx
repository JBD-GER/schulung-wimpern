import type { Metadata } from "next";

import {
  CanonicalLegalText,
  LegalDocument,
} from "@/components/marketing/legal-document";
import { WithdrawalForm } from "@/components/marketing/withdrawal-form";
import {
  buildWithdrawalText,
  type ContractProviderSnapshot,
} from "@/data/checkout-legal";
import { getReleaseContract, legalPageMetadata } from "@/lib/server/release";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return legalPageMetadata({
    title: "Widerrufsbelehrung",
    description:
      "Widerrufsbelehrung und elektronische Widerrufsfunktion für die Online-Schulung Wimpernverlängerung.",
    draftDescription:
      "Technisch vollständiger Entwurf der Widerrufsbelehrung für die Online-Schulung Wimpernverlängerung.",
    canonical: "/widerruf",
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

export default function WithdrawalPage() {
  const release = getReleaseContract();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ??
    "https://www.schulung-wimpernverlaengerung.de"
  ).replace(/\/$/, "");
  const text = buildWithdrawalText(
    contractProvider(release.legal.provider),
    siteUrl,
  );

  return (
    <LegalDocument
      eyebrow="Verbraucherinformationen"
      title="Widerrufsbelehrung"
      introduction="Widerrufsbelehrung und gesetzliche elektronische Widerrufsfunktion für die Online-Schulung Wimpernverlängerung. Die beim Kauf geltende Belehrung wird vollständig in der Vertragsbestätigung gespeichert und per E-Mail übermittelt."
      released={release.legal.approved}
    >
      <section id="vertrag-widerrufen" className="scroll-mt-28">
        <h2>Vertrag online widerrufen</h2>
        <p>
          Hier kannst du einen auf dieser Website geschlossenen Vertrag ohne
          Anmeldung und ohne Angabe eines Grundes elektronisch widerrufen. Im
          ersten Schritt gibst du deinen Namen, eine Vertragsidentifikation und
          die E-Mail-Adresse für die Eingangsbestätigung an. Im zweiten Schritt
          prüfst du die Angaben und bestätigst den Widerruf eindeutig.
        </p>
        <p>
          Nach Eingang zeigen wir dir Datum, Uhrzeit und Eingangsnummer an und
          senden den vollständigen Inhalt deiner Erklärung unverzüglich an die
          angegebene E-Mail-Adresse. Die Eingangsbestätigung dokumentiert den
          Eingang; sie ist noch keine Entscheidung über die rechtliche
          Wirksamkeit oder eine Erstattung.
        </p>
        <div className="mt-5">
          <WithdrawalForm />
        </div>
      </section>

      <CanonicalLegalText text={text} />

      <section>
        <h2>Gesetzliche Grundlagen</h2>
        <ul>
          <li>
            <a href="https://www.gesetze-im-internet.de/bgb/__355.html">
              § 355 BGB – Widerrufsrecht bei Verbraucherverträgen
            </a>
          </li>
          <li>
            <a href="https://www.gesetze-im-internet.de/bgb/__356.html">
              § 356 BGB – Widerrufsrecht bei Fernabsatzverträgen
            </a>
          </li>
          <li>
            <a href="https://www.gesetze-im-internet.de/bgb/__356a.html">
              § 356a BGB – Elektronische Widerrufsfunktion
            </a>
          </li>
          <li>
            <a href="https://www.gesetze-im-internet.de/bgb/__357.html">
              § 357 BGB – Rechtsfolgen des Widerrufs
            </a>
          </li>
          <li>
            <a href="https://www.gesetze-im-internet.de/bgb/__357a.html">
              § 357a BGB – Wertersatz
            </a>
          </li>
        </ul>
      </section>
    </LegalDocument>
  );
}
