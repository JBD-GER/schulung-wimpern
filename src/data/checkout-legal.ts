import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";

export const TERMS_ACCEPTANCE_TEXT =
  "Ich akzeptiere die AGB und habe die Datenschutzerklärung zur Kenntnis genommen.";

export const EARLY_ACCESS_ACCEPTANCE_TEXT =
  "Ich verlange ausdrücklich, dass die Anbieterin vor Ablauf der Widerrufsfrist mit der Leistung beginnt. Zugleich stimme ich ausdrücklich zu, dass sie vor Ablauf der Widerrufsfrist mit der Ausführung der nicht auf einem körperlichen Datenträger befindlichen digitalen Inhalte beginnt. Ich bestätige meine Kenntnis, dass ich bei solchen digitalen Inhalten mit Beginn der Ausführung mein Widerrufsrecht verliere und dass es bei Dienstleistungen nach vollständiger Vertragserfüllung unter den gesetzlichen Voraussetzungen erlischt.";

export type ContractProviderSnapshot = {
  companyName: string;
  representative: string;
  street: string;
  postalCity: string;
  country: string;
  email: string;
  phone: string;
  vatId: string | null;
  widStatus: "assigned" | "not_assigned";
  widId: string | null;
  registerStatus: "registered" | "not_registered";
  registerCourt: string | null;
  registerNumber: string | null;
  disputeStatement: string;
};

export type CheckoutContractSnapshot = {
  schemaVersion: 1;
  siteUrl: string;
  acceptedAt: string;
  termsVersion: string;
  legalTextHash: string;
  courseAccessDescription: string;
  termsAcceptanceText: string;
  earlyAccessAcceptanceText: string;
  provider: ContractProviderSnapshot;
  termsText: string;
  withdrawalText: string;
};

function providerBlock(provider: ContractProviderSnapshot): string {
  const lines = [
    provider.companyName,
    provider.street,
    provider.postalCity,
    provider.country,
    `Vertreten durch: ${provider.representative}`,
    `E-Mail: ${provider.email}`,
    `Telefon: ${provider.phone}`,
  ];
  if (provider.vatId) lines.push(`USt-IdNr.: ${provider.vatId}`);
  if (provider.widStatus === "assigned" && provider.widId)
    lines.push(`W-IdNr.: ${provider.widId}`);
  if (
    provider.registerStatus === "registered" &&
    provider.registerCourt &&
    provider.registerNumber
  ) {
    lines.push(`Registergericht: ${provider.registerCourt}`);
    lines.push(`Registernummer: ${provider.registerNumber}`);
  }
  return lines.join("\n");
}

export function buildTermsText(
  provider: ContractProviderSnapshot,
  siteUrl: string,
): string {
  return `ALLGEMEINE GESCHÄFTSBEDINGUNGEN
Stand: 22. Juli 2026

1. Anbieterin und Geltungsbereich
${providerBlock(provider)}
Diese Bedingungen gelten für Verträge über die Online-Schulung Wimpernverlängerung. Zwingende gesetzliche Verbraucherrechte bleiben unberührt.

2. Vertragsgegenstand
Vertragsgegenstand ist der persönliche Onlinezugang zur „Online-Schulung Wimpernverlängerung“ mit sieben Lernvideos, sieben Wissenstests, gegebenenfalls ergänzenden Materialien, Teilnehmerbereich und einem persönlichen Abschlusszertifikat nach erfolgreichem Abschluss. Die Schulung ist kein staatlich anerkannter Berufsabschluss und ersetzt keine individuelle medizinische, rechtliche, steuerliche, versicherungs- oder arbeitsschutzrechtliche Beratung.

3. Vertragsschluss und Korrektur
Die Kursdarstellung ist eine Einladung zur Bestellung. Eingaben können bis zum Absenden berichtigt werden. Mit „Zahlungspflichtig bestellen“ wird ein verbindliches Angebot abgegeben. Der Vertrag kommt erst zustande, wenn Stripe die Zahlung erfolgreich bestätigt und die Anbieterin Bestellung und Zugang elektronisch annimmt. Browser-Rückkehr oder ein ungeprüfter Zahlungsstatus genügen nicht.

4. Konto und Zugang
Vor der Zahlung besteht nur ein befristeter Checkout. Konto, Bestellung und Einschreibung entstehen erst nach bestätigter Zahlung. Bei Abbruch, Fehlschlag oder Ablauf wird kein neues Konto angelegt. Nach Zahlung kann im selben gebundenen Browser einmalig automatisch angemeldet werden. Zugangsdaten dürfen nicht weitergegeben werden.

5. Vertragssprache und Speicherung
Vertragssprache ist Deutsch. Rechtstextversion, Prüfsumme, Bestell- und Einwilligungsnachweise werden gespeichert. Diese Vertragsbestätigung gibt den bei Vertragsschluss vereinbarten Inhalt auf einem dauerhaften Datenträger wieder.

6. Preis, Zahlung und Rechnung
Es gilt ausschließlich der unmittelbar vor der Bestellung angezeigte Gesamtpreis einschließlich der dort ausgewiesenen Steuerbehandlung. Es handelt sich um eine Einmalzahlung ohne Abonnement oder automatische Verlängerung. Stripe wickelt die gewählte Zahlungsart ab und stellt die elektronische Rechnung beziehungsweise den Rechnungszugang bereit.

7. Bereitstellung und Dauer
Der Zugang wird erst nach endgültig bestätigter Zahlung freigeschaltet. ${COURSE_ACCESS_DESCRIPTION} „Unbefristet“ bedeutet zeitlich nicht im Voraus begrenzt im Rahmen des fortbestehenden Vertrags und der betriebenen Plattform. Gesetzliche Rechte bei Einstellung oder Änderung bleiben bestehen.

8. Lernpfad und Tests
Die Lektionen werden in Reihenfolge bearbeitet. Vor- und Zurückspulen ist erlaubt. Ab einer validierten höchsten Videoposition von mindestens 90 Prozent wird der Test angeboten. Jeder Test hat fünf Fragen, vier Optionen je Frage und genau eine richtige Antwort. Vier richtige Antworten bestehen den Test; Wiederholungen sind kostenlos. Nach Bestehen wird die nächste Lektion freigeschaltet. Nach Abschluss bleiben Inhalte erneut aufrufbar.

9. Zertifikat
Nach allen sieben bestandenen Lektionen kann einmalig ein persönliches Zertifikat erzeugt werden. Vorher müssen Vor- und Nachname ausdrücklich bestätigt werden. Das ausgestellte Zertifikat ist im Selbstbedienungsbereich unveränderlich. Korrekturen erfolgen nur nach Supportprüfung und gegebenenfalls gegen vorher mitgeteilte Bearbeitungsgebühr; zwingende Berichtigungs- und Mängelrechte bleiben unberührt. Der Kurszugang bleibt erhalten.

10. Technik und Verfügbarkeit
Benötigt werden aktueller Browser, stabile Internetverbindung, erreichbare E-Mail-Adresse und ein Gerät für geschützte Videos und PDF-Dateien. Wartung, Sicherheitsmaßnahmen oder Dienstleisterstörungen können vorübergehend beeinträchtigen. Gesetzliche Rechte bei Nichtbereitstellung oder Mängeln digitaler Produkte bleiben unberührt.

11. Persönliche Nutzung und Rechte
Der Zugang dient ausschließlich eigenen Lernzwecken. Videos, Materialien, Quizfragen, Lösungen und Zertifikatsvorlagen dürfen ohne Erlaubnis nicht veröffentlicht, weiterverkauft, vervielfältigt, aufgezeichnet, umgangen oder Dritten zugänglich gemacht werden. Gesetzlich erlaubte Nutzungen bleiben unberührt.

12. Praktische Anwendung
Hersteller-, Hygiene-, Sicherheits- und Arbeitsschutzvorgaben, individuelle Kundinnenvoraussetzungen und anwendbares Recht sind eigenverantwortlich zu beachten. Ein bestimmter beruflicher oder wirtschaftlicher Erfolg wird nicht garantiert.

13. Widerruf
Für Verbraucherinnen gilt die mit dieser Vertragsbestätigung übermittelte Widerrufsbelehrung. Die Erklärung zum vorzeitigen Beginn wird gesondert und nicht vorausgewählt erfasst. Die elektronische Widerrufsfunktion ist dauerhaft unter ${siteUrl}/widerruf#vertrag-widerrufen erreichbar.

14. Gesetzliche Mängelrechte
Es gelten die gesetzlichen Rechte bei Nichtbereitstellung oder Mängeln digitaler Produkte, insbesondere Abhilfe, Vertragsbeendigung, Minderung und Schadensersatz nach den gesetzlichen Voraussetzungen.

15. Haftung
Unbeschränkt gehaftet wird bei Vorsatz, grober Fahrlässigkeit, Verletzung von Leben, Körper oder Gesundheit, nach dem Produkthaftungsgesetz, aus Garantien und in zwingenden Fällen. Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten ist die Haftung auf den vorhersehbaren vertragstypischen Schaden begrenzt; im Übrigen ist sie soweit gesetzlich zulässig ausgeschlossen.

16. Sperrung und Beendigung
Bei erheblichen oder wiederholten Vertragsverletzungen kann der Zugang nach Prüfung vorübergehend gesichert oder aus wichtigem Grund beendet werden. Soweit möglich wird zuvor Gelegenheit zur Abhilfe gegeben. Zwingende Gegen- und Erstattungsrechte bleiben unberührt.

17. Änderungen
Für die Bestellung gilt die bei Vertragsschluss einbezogene Fassung. Spätere Änderungen gelten nicht rückwirkend ohne wirksame Vereinbarung oder gesetzliche Grundlage.

18. Verbraucherstreitbeilegung
${provider.disputeStatement}

19. Recht
Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts. Verbraucherinnen verlieren dadurch nicht den Schutz zwingender Vorschriften ihres gewöhnlichen Aufenthaltsstaats. Gesetzliche Gerichtsstände bleiben unberührt.`;
}

export function buildWithdrawalText(
  provider: ContractProviderSnapshot,
  siteUrl: string,
): string {
  return `WIDERRUFSBELEHRUNG
Stand: 22. Juli 2026

Widerrufsrecht
Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Frist beträgt vierzehn Tage ab Vertragsschluss.

Um das Widerrufsrecht auszuüben, informiere:
${providerBlock(provider)}
mittels einer eindeutigen Erklärung, etwa per Brief oder E-Mail, über deinen Entschluss. Du kannst auch die elektronische Widerrufsfunktion unter ${siteUrl}/widerruf#vertrag-widerrufen oder das folgende Muster verwenden. Zur Fristwahrung genügt die rechtzeitige Absendung.

Folgen des Widerrufs
Im Widerrufsfall erstatten wir alle erhaltenen Zahlungen einschließlich der Kosten der günstigsten angebotenen Standardlieferung unverzüglich und spätestens binnen vierzehn Tagen ab Eingang. Wir verwenden dasselbe Zahlungsmittel, sofern nichts anderes vereinbart wurde; hierfür entstehen keine Entgelte. Hast du den Beginn einer Dienstleistung während der Widerrufsfrist verlangt, kann unter den gesetzlichen Voraussetzungen Wertersatz für den bis zum Widerruf erbrachten Anteil geschuldet sein.

Vorzeitiger Beginn und mögliches Erlöschen
Bei nicht auf einem körperlichen Datenträger befindlichen digitalen Inhalten kann das Widerrufsrecht erlöschen, wenn die Ausführung nach ausdrücklicher vorheriger Zustimmung und bestätigter Kenntnis vom Verlust begonnen hat und diese Vertragsbestätigung auf einem dauerhaften Datenträger bereitgestellt wurde. Bei einer entgeltlichen Dienstleistung erlischt es grundsätzlich erst mit vollständiger Erbringung und nur unter den weiteren gesetzlichen Voraussetzungen.

MUSTER-WIDERRUFSFORMULAR
An:
${providerBlock(provider)}

Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Online-Schulung Wimpernverlängerung.
Bestellt am: ____________________
Vor- und Nachname: ______________
Anschrift: ______________________
E-Mail des Kontos: ______________
Datum: _________________________
Unterschrift, nur auf Papier: ____________________`;
}

export function createCheckoutContractSnapshot(input: {
  acceptedAt: string;
  siteUrl: string;
  termsVersion: string;
  legalTextHash: string;
  provider: ContractProviderSnapshot;
}): CheckoutContractSnapshot {
  return {
    schemaVersion: 1,
    siteUrl: input.siteUrl,
    acceptedAt: input.acceptedAt,
    termsVersion: input.termsVersion,
    legalTextHash: input.legalTextHash,
    courseAccessDescription: COURSE_ACCESS_DESCRIPTION,
    termsAcceptanceText: TERMS_ACCEPTANCE_TEXT,
    earlyAccessAcceptanceText: EARLY_ACCESS_ACCEPTANCE_TEXT,
    provider: { ...input.provider },
    termsText: buildTermsText(input.provider, input.siteUrl),
    withdrawalText: buildWithdrawalText(input.provider, input.siteUrl),
  };
}

export function readCheckoutContractSnapshot(
  value: unknown,
): CheckoutContractSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<CheckoutContractSnapshot>;
  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.siteUrl !== "string" ||
    !/^https:\/\//.test(snapshot.siteUrl) ||
    typeof snapshot.acceptedAt !== "string" ||
    Number.isNaN(Date.parse(snapshot.acceptedAt)) ||
    typeof snapshot.termsVersion !== "string" ||
    typeof snapshot.legalTextHash !== "string" ||
    typeof snapshot.courseAccessDescription !== "string" ||
    snapshot.courseAccessDescription.length < 80 ||
    snapshot.termsAcceptanceText !== TERMS_ACCEPTANCE_TEXT ||
    snapshot.earlyAccessAcceptanceText !== EARLY_ACCESS_ACCEPTANCE_TEXT ||
    typeof snapshot.termsText !== "string" ||
    snapshot.termsText.length < 1_000 ||
    typeof snapshot.withdrawalText !== "string" ||
    snapshot.withdrawalText.length < 500 ||
    !snapshot.provider ||
    typeof snapshot.provider !== "object"
  ) {
    return null;
  }
  return snapshot as CheckoutContractSnapshot;
}

export function buildContractConfirmationText(input: {
  snapshot: CheckoutContractSnapshot;
  orderId: string;
  productName: string;
  amountTotal: number;
  currency: string;
  taxAmount: number | null;
  paidAt: string;
  participantEmail: string;
  billingSnapshot: Record<string, unknown>;
}): string {
  const money = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: input.currency.toUpperCase(),
  });
  const total = money.format(input.amountTotal / 100);
  const tax =
    input.taxAmount === null
      ? "Steuerbetrag gemäß Stripe-Rechnung"
      : money.format(input.taxAmount / 100);
  const acceptedAt = new Date(input.snapshot.acceptedAt).toISOString();
  const paidAt = new Date(input.paidAt).toISOString();
  const billingAddress =
    input.billingSnapshot.billingAddress &&
    typeof input.billingSnapshot.billingAddress === "object" &&
    !Array.isArray(input.billingSnapshot.billingAddress)
      ? (input.billingSnapshot.billingAddress as Record<string, unknown>)
      : {};
  const invoiceName = String(input.billingSnapshot.invoiceName ?? "").trim();
  const address = [
    billingAddress.street,
    [billingAddress.postalCode, billingAddress.city].filter(Boolean).join(" "),
    billingAddress.country,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const paymentMethod = String(
    input.billingSnapshot.paymentMethodLabel ?? "Zahlung über Stripe",
  ).trim();

  return `VERTRAGSBESTÄTIGUNG AUF DAUERHAFTEM DATENTRÄGER

Bestellung: ${input.orderId}
Vertragsschluss/Zahlungsbestätigung: ${paidAt}
Teilnehmer-E-Mail: ${input.participantEmail}
Rechnungsempfänger: ${invoiceName}
Rechnungsanschrift: ${address}
Leistung: ${input.productName}
Gesamtpreis: ${total}
Enthaltener beziehungsweise ausgewiesener Steuerbetrag: ${tax}
Zahlung: Einmalzahlung per ${paymentMethod}; kein Abonnement und keine automatische Verlängerung.
Bereitstellung: Nach endgültig bestätigter Zahlung im persönlichen Teilnehmerbereich.
Zugang: ${input.snapshot.courseAccessDescription}

VERBINDLICH BESTÄTIGTE ERKLÄRUNGEN
Bestätigt am: ${acceptedAt}
Textversion: ${input.snapshot.termsVersion}
Prüfsumme: ${input.snapshot.legalTextHash}

1. ${input.snapshot.termsAcceptanceText}
2. ${input.snapshot.earlyAccessAcceptanceText}

${input.snapshot.termsText}

${input.snapshot.withdrawalText}
`;
}
