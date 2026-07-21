import { COURSE_ACCESS_DESCRIPTION } from "@/data/access-policy";

export const COURSE = {
  slug: "online-schulung-wimpernverlaengerung",
  title: "Schulung Wimpernverlängerung & Wimpernstylistin",
  productName: "Online-Schulung Wimpernverlängerung & Wimpernstylistin",
  certificateTitle: "Professionelle 1:1 Wimpernverlängerung",
  level: "Anfänger",
  version: "2026.1",
  learningMinutes: 420,
  learningScope:
    "ca. 7 Stunden inklusive Videos, Wissenstests und ergänzender Materialien",
} as const;

export type Lesson = {
  position: number;
  slug: string;
  title: string;
  duration: string;
  durationSeconds: number;
  summary: string;
  area?: string;
  topics: readonly string[];
};

export const LESSONS: readonly Lesson[] = [
  {
    position: 1,
    slug: "rechtliche-absicherung-datenschutz",
    title: "Wimpernstylistin werden: Rechtliche Absicherung & Datenschutz",
    duration: "43:42",
    durationSeconds: 2622,
    summary:
      "Grundlagen für einen verantwortungsvoll organisierten Studioalltag – von Absicherung bis Datenschutz.",
    topics: [
      "Betriebliche Absicherung",
      "Aufklärung und Dokumentation",
      "Datenschutz im Studio",
    ],
  },
  {
    position: 2,
    slug: "eins-zu-eins-schritt-fuer-schritt",
    title:
      "Wie klebt man Wimpern? 1:1 Verlängerung Schritt für Schritt erklärt",
    duration: "45:01",
    durationSeconds: 2701,
    summary:
      "Das Prinzip der 1:1-Technik, passende Längen und Curls sowie sauberes Isolieren und Applizieren.",
    topics: [
      "1:1-Grundprinzip",
      "Mapping und Curl",
      "Isolierung und Applikation",
    ],
  },
  {
    position: 3,
    slug: "pflege-vor-und-nach-dem-styling",
    title: "Perfekte Wimpern: Pflegehinweise vor und nach dem Styling",
    duration: "40:20",
    durationSeconds: 2420,
    summary:
      "Vorbereitung, Reinigung und Nachpflege für eine hygienische Anwendung und gute Haltbarkeit.",
    topics: ["Vorbereitung", "Die ersten 48 Stunden", "Reinigung und Bürsten"],
  },
  {
    position: 4,
    slug: "materialien-und-produkte",
    title:
      "Materialien & Produkte für die perfekte Wimpernverlängerung: Dein Starter-Guide",
    duration: "46:34",
    durationSeconds: 2794,
    summary:
      "Werkzeuge, Produkte und deren fachgerechte Auswahl für einen strukturierten Arbeitsplatz.",
    topics: ["Kleberauswahl", "Pinzetten", "Primer und Arbeitsmaterial"],
  },
  {
    position: 5,
    slug: "wimpernkleber-und-remover",
    title:
      "Wimpernkleber & Remover: Alles, was professionelle Wimpernstylistinnen wissen müssen",
    duration: "43:16",
    durationSeconds: 2596,
    summary:
      "Eigenschaften von Kleber und Remover, Raumklima, sichere Anwendung und Herstellerangaben.",
    topics: ["Cyanoacrylat", "Raumklima", "Gel- und Cream-Remover"],
  },
  {
    position: 6,
    slug: "kundinnen-gewinnen",
    title:
      "Kunden gewinnen für deine Wimpernverlängerung: So startest du erfolgreich durch!",
    duration: "43:46",
    durationSeconds: 2626,
    summary:
      "Ein authentischer Online-Auftritt, echte Arbeitsbeispiele und lokale Sichtbarkeit für dein Angebot.",
    topics: [
      "Portfolio und Vertrauen",
      "Social Media",
      "Lokale Auffindbarkeit",
    ],
  },
  {
    position: 7,
    slug: "praktische-visualisierung",
    area: "Praxis Schulung Wimpernverlängerung",
    title: "Praktische Visualisierung",
    duration: "31:28",
    durationSeconds: 1888,
    summary:
      "Der vollständige praktische Ablauf von Vorbereitung und Mapping bis Refill und Nachpflege.",
    topics: [
      "Kompletter Ablauf von A bis Z",
      "Material- und Gerätekunde",
      "Vorbereitung und Mapping",
      "Sicherheit und Kundinnenkomfort",
      "1:1-Applikation und Isolierung",
      "Kleberführung, Remover und Korrekturen",
      "Refill und Nachpflege",
    ],
  },
] as const;

export const VIDEO_MINUTES = Math.round(
  LESSONS.reduce((total, lesson) => total + lesson.durationSeconds, 0) / 60,
);

export const FAQS = [
  {
    question: "Für wen ist die Schulung geeignet?",
    answer:
      "Die Schulung richtet sich an Einsteigerinnen, Quereinsteigerinnen, Kosmetikerinnen und Beauty-Dienstleisterinnen, die die professionelle 1:1-Technik strukturiert erlernen oder ihr Angebot erweitern möchten.",
  },
  {
    question: "Benötige ich Vorkenntnisse?",
    answer:
      "Nein. Der Kurs beginnt bei den Grundlagen und ist für Anfängerinnen aufgebaut. Für eine sichere praktische Anwendung sind sorgfältiges Üben und das Beachten der Produkt- und Sicherheitshinweise unverzichtbar.",
  },
  {
    question: "Welche Inhalte werden behandelt?",
    answer:
      "Die sieben Lektionen behandeln Recht und Datenschutz, die 1:1-Technik, Pflege, Materialkunde, Kleber und Remover, Kundengewinnung sowie einen vollständigen Praxisteil.",
  },
  {
    question: "Wie lange dauert die Schulung?",
    answer:
      "Der Lernumfang beträgt etwa sieben Stunden inklusive Videos, Wissenstests und ergänzender Materialien. Die sieben Videos haben zusammen eine Laufzeit von rund vier Stunden und 54 Minuten.",
  },
  {
    question: "Wann erhalte ich Zugang?",
    answer:
      "Dein Zugang wird nach bestätigter Zahlung automatisch freigeschaltet. Bei verzögerten Zahlungsarten kann die Bestätigung entsprechend später erfolgen.",
  },
  {
    question: "Wie lange habe ich Zugriff?",
    answer: COURSE_ACCESS_DESCRIPTION,
  },
  {
    question: "Wie funktionieren die Wissenstests?",
    answer:
      "Nach mindestens 90 Prozent angesehenem Video wird der Test freigeschaltet. Er enthält fünf Fragen mit jeweils vier Antwortmöglichkeiten. Ausgewertet wird erst, nachdem du alle Antworten abgegeben hast.",
  },
  {
    question: "Wie viele Fragen muss ich richtig beantworten?",
    answer:
      "Du bestehst eine Lektion mit mindestens vier von fünf richtigen Antworten.",
  },
  {
    question: "Kann ich einen Test wiederholen?",
    answer:
      "Ja. Nicht bestandene Wissenstests kannst du ohne zusätzliche Kosten beliebig oft wiederholen.",
  },
  {
    question: "Wann erhalte ich das Zertifikat?",
    answer:
      "Sobald du alle sieben Lektionen und Wissenstests bestanden hast, wird dein persönliches Abschlusszertifikat erstellt. Du kannst es im Dashboard herunterladen und erhältst es zusätzlich per E-Mail.",
  },
  {
    question: "Ist das Zertifikat staatlich anerkannt?",
    answer:
      "Nein. Es ist ein persönliches Abschlusszertifikat dieser Online-Schulung und kein staatlich anerkannter Berufsabschluss.",
  },
  {
    question: "Auf welchen Geräten kann ich lernen?",
    answer:
      "Die Lernplattform ist für aktuelle Smartphones, Tablets und Desktop-Browser optimiert.",
  },
  {
    question: "Erhalte ich eine Rechnung?",
    answer:
      "Ja. Nach erfolgreicher Einmalzahlung stellt Stripe eine bezahlte Rechnung bereit.",
  },
  {
    question: "Kann ich als Unternehmen buchen?",
    answer:
      "Ja. Im Checkout kannst du Unternehmens- und Rechnungsdaten getrennt erfassen.",
  },
  {
    question: "Welche Zahlungsmethoden werden angeboten?",
    answer:
      "Im Checkout siehst du die aktuell für dich verfügbaren und im Stripe-Dashboard aktivierten Zahlungsmethoden.",
  },
  {
    question: "Gibt es ein Abonnement?",
    answer:
      "Nein. Du leistest eine einmalige Zahlung; es gibt keine automatische Verlängerung.",
  },
  {
    question: "Wie werden die Videos geschützt?",
    answer:
      "Die Videos liegen nicht als öffentliche Dateien vor. Die Plattform prüft deinen persönlichen Zugang und stellt die Wiedergabe nur im geschützten Kursbereich bereit.",
  },
  {
    question: "An wen kann ich mich bei Fragen wenden?",
    answer:
      "Du erreichst den Support über das Kontaktformular oder die auf der Kontaktseite angegebene Support-Adresse.",
  },
] as const;
