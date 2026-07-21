-- Canonical production seed. Course content and quiz keys are intentionally
-- inserted as DRAFT. Video UIDs must be assigned and quiz keys checked against
-- the original videos before an administrator publishes the course.

insert into public.courses (slug, title, description, level, version, status, total_learning_minutes)
values (
  'online-schulung-wimpernverlaengerung',
  'Schulung Wimpernverlängerung & Wimpernstylistin',
  'Professionelle Online-Schulung zur 1:1-Wimpernverlängerung mit sieben Lektionen, Wissenstests und ergänzenden Materialien.',
  'Anfänger', '2026.1', 'draft', 420
)
on conflict (slug) do update set
  title = excluded.title,
  description = excluded.description,
  level = excluded.level,
  version = excluded.version,
  status = excluded.status,
  total_learning_minutes = excluded.total_learning_minutes;

with course as (
  select id from public.courses where slug = 'online-schulung-wimpernverlaengerung'
)
insert into public.lessons
  (course_id, position, slug, section_title, title, description, duration_seconds, watch_threshold, status)
select course.id, lesson.position, lesson.slug, lesson.section_title, lesson.title, lesson.description,
       lesson.duration_seconds, 0.900, 'draft'
from course
cross join (values
  (1, 'rechtliche-absicherung-datenschutz', null::text, 'Wimpernstylistin werden: Rechtliche Absicherung & Datenschutz', '', 2622),
  (2, 'eins-zu-eins-schritt-fuer-schritt', null::text, 'Wie klebt man Wimpern? 1:1 Verlängerung Schritt für Schritt erklärt', '', 2701),
  (3, 'pflege-vor-und-nach-dem-styling', null::text, 'Perfekte Wimpern: Pflegehinweise vor und nach dem Styling', '', 2420),
  (4, 'materialien-und-produkte', null::text, 'Materialien & Produkte für die perfekte Wimpernverlängerung: Dein Starter-Guide', '', 2794),
  (5, 'wimpernkleber-und-remover', null::text, 'Wimpernkleber & Remover: Alles, was professionelle Wimpernstylistinnen wissen müssen', '', 2596),
  (6, 'kundinnen-gewinnen', null::text, 'Kunden gewinnen für deine Wimpernverlängerung: So startest du erfolgreich durch!', '', 2626),
  (7, 'praktische-visualisierung', 'Praxis Schulung Wimpernverlängerung', 'Praktische Visualisierung', 'Kompletter Ablauf von A bis Z: Material- und Gerätekunde, Vorbereitung, Mapping, Sicherheit, 1:1-Applikation, Isolierung, Kleberführung, Remover, Korrekturen, Refill und Nachpflege.', 1888)
) as lesson(position, slug, section_title, title, description, duration_seconds)
on conflict (course_id, position) do update set
  slug = excluded.slug,
  section_title = excluded.section_title,
  title = excluded.title,
  description = excluded.description,
  duration_seconds = excluded.duration_seconds,
  watch_threshold = excluded.watch_threshold,
  status = excluded.status;

-- The following JSON is generated verbatim from the approved master specification.
do $seed$
declare
  seed_data jsonb := $quiz$[
  {
    "lesson": 1,
    "title": "Wimpernstylistin werden: Rechtliche Absicherung & Datenschutz",
    "questions": [
      {
        "position": 1,
        "question": "Welche Versicherung schützt Wimpernstylistinnen bei Schadenersatzansprüchen durch allergische Reaktionen während einer Behandlung?",
        "options": [
          "Eine Inhaltsversicherung für Möbel, Geräte und Waren",
          "Eine Betriebshaftpflichtversicherung, die kosmetische Behandlungen und daraus entstehende Personenschäden einschließt",
          "Eine private Rechtsschutzversicherung",
          "Eine Berufsunfähigkeitsversicherung"
        ],
        "correct": 1,
        "note": "Die konkrete Benennung kann je nach Versicherer und Versicherungsvertrag variieren. Vor Veröffentlichung mit dem Wortlaut des Videos abgleichen und sicherstellen, dass Behandlungsrisiken ausdrücklich eingeschlossen sind."
      },
      {
        "position": 2,
        "question": "Was ist der Hauptunterschied zwischen Berufs- und Betriebshaftpflichtversicherung?",
        "options": [
          "Die Berufshaftpflicht versichert nur Gebäude, die Betriebshaftpflicht nur Fahrzeuge.",
          "Die Betriebshaftpflicht gilt nur für Angestellte, die Berufshaftpflicht nur für Kundinnen.",
          "Die Berufshaftpflicht bezieht sich vor allem auf Ansprüche aus beruflichen Fehlern, während die Betriebshaftpflicht allgemeine betriebliche Risiken wie Personen- und Sachschäden im Studiobetrieb absichert.",
          "Zwischen beiden Versicherungen besteht grundsätzlich kein Unterschied."
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 3,
        "question": "Was ist ein zentraler Zweck eines schriftlichen Haftungsausschlusses?",
        "options": [
          "Er dokumentiert die Aufklärung über Risiken und die Einwilligung der Kundin und verbessert damit die Nachweisbarkeit.",
          "Er schließt ausnahmslos jede Haftung aus, auch bei Vorsatz oder grober Fahrlässigkeit.",
          "Er ersetzt eine Haftpflichtversicherung vollständig.",
          "Er erlaubt die unbegrenzte Weitergabe sämtlicher Kundendaten."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 4,
        "question": "Welche Maßnahme ist laut DSGVO verpflichtend, wenn Kundendaten verarbeitet werden?",
        "options": [
          "Sämtliche Kundendaten müssen öffentlich zugänglich gemacht werden.",
          "Für jede Verarbeitung ist ausnahmslos eine Werbeeinwilligung erforderlich.",
          "Alle Daten müssen unbegrenzt gespeichert werden.",
          "Die betroffene Person muss transparent über die Verarbeitung informiert werden; außerdem müssen Zweck, Rechtsgrundlage und Schutz der Daten geklärt sein."
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 5,
        "question": "Welche der folgenden Informationen muss in der Datenschutzerklärung eines Wimpernstudios enthalten sein?",
        "options": [
          "Nur die Öffnungszeiten des Studios",
          "Verantwortliche Stelle, Verarbeitungszwecke, Rechtsgrundlagen, Empfänger, Speicherdauer beziehungsweise deren Kriterien und Betroffenenrechte",
          "Nur die aktuelle Preisliste",
          "Die internen Passwörter des Studios"
        ],
        "correct": 1,
        "note": null
      }
    ]
  },
  {
    "lesson": 2,
    "title": "Wie klebt man Wimpern? 1:1 Verlängerung Schritt für Schritt erklärt",
    "questions": [
      {
        "position": 1,
        "question": "Was ist das grundlegende Prinzip der 1:1 Wimpernverlängerung?",
        "options": [
          "Mehrere schwere Extensions werden direkt auf das Augenlid geklebt.",
          "Eine künstliche Wimper wird über mehrere Naturwimpern gelegt.",
          "Auf eine sauber isolierte Naturwimper wird jeweils eine einzelne Extension appliziert.",
          "Die Extensions werden als durchgehender Wimpernstreifen befestigt."
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 2,
        "question": "Welche Wimpernlänge wird typischerweise im inneren Augenwinkel verwendet?",
        "options": [
          "Etwa 6 bis 8 Millimeter, abhängig von der Naturwimper und dem Mapping",
          "Etwa 12 bis 14 Millimeter",
          "Etwa 15 bis 18 Millimeter",
          "Im gesamten Auge wird immer exakt dieselbe Länge verwendet."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 3,
        "question": "Welche Wimpernkrümmung (Curl) erzeugt den dramatischsten Effekt?",
        "options": [
          "J-Curl",
          "B-Curl",
          "C-Curl",
          "D-Curl"
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 4,
        "question": "Warum ist eine gute Isoliertechnik beim Anbringen der Wimpern entscheidend?",
        "options": [
          "Damit möglichst viele Naturwimpern gleichzeitig zusammengeklebt werden.",
          "Damit jede Naturwimper frei wachsen kann und Verklebungen, Zug, Beschwerden und Schäden vermieden werden.",
          "Damit die Extension direkt auf dem Augenlid befestigt werden kann.",
          "Damit deutlich mehr Kleber verwendet werden kann."
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 5,
        "question": "Was sollte eine Kundin in den ersten 24 Stunden nach der Behandlung vermeiden?",
        "options": [
          "Das vorsichtige Bürsten vollständig trockener Wimpern",
          "Das Schlafen auf dem Rücken",
          "Wasser, Wasserdampf, Sauna und starkes Schwitzen im Augenbereich",
          "Das Vereinbaren eines späteren Refill-Termins"
        ],
        "correct": 2,
        "note": null
      }
    ]
  },
  {
    "lesson": 3,
    "title": "Perfekte Wimpern: Pflegehinweise vor und nach dem Styling",
    "questions": [
      {
        "position": 1,
        "question": "Warum sollten Kundinnen mindestens 24 Stunden vor dem Termin auf ölhaltige Produkte im Augenbereich verzichten?",
        "options": [
          "Ölrückstände können die Haftung des Klebers beeinträchtigen und die Haltbarkeit verkürzen.",
          "Öl verlängert die Aushärtezeit der Naturwimpern um mehrere Wochen.",
          "Öl verändert dauerhaft die natürliche Augenfarbe.",
          "Öl verhindert ausschließlich das Bürsten der Wimpern."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 2,
        "question": "Welche Verhaltensregel gilt für die ersten 48 Stunden nach dem Styling?",
        "options": [
          "Die Wimpern mehrmals kräftig mit einem Handtuch trockenreiben.",
          "Ölhaltigen Make-up-Entferner verwenden.",
          "Die Extensions mit einer Wimpernzange formen.",
          "Wasser, Dampf, Sauna, Schwimmbad und starkes Reiben im Augenbereich vermeiden."
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 3,
        "question": "Welche Reinigungsprodukte sind für Wimpernextensions ungeeignet?",
        "options": [
          "Ein speziell geeignetes, ölfreies Wimpernshampoo",
          "Ölhaltige oder stark rückfettende Reiniger und Make-up-Entferner",
          "Ein fusselfreier Reinigungspinsel",
          "Lauwarmes Wasser nach Ablauf der empfohlenen Aushärtezeit"
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 4,
        "question": "Warum sollte auf Wattepads oder Wattebällchen verzichtet werden?",
        "options": [
          "Weil sie die Augenfarbe verändern können.",
          "Weil sie den Wimpernkleber grundsätzlich sofort auflösen.",
          "Weil sich Fasern an den Klebestellen verfangen und an den Extensions ziehen können.",
          "Weil sie ausschließlich für die Reinigung von Händen zugelassen sind."
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 5,
        "question": "Wie oft sollte eine Kundin ihre Wimpernextensions täglich durchkämmen?",
        "options": [
          "Ein- bis zweimal täglich mit einem sauberen Bürstchen, wenn die Wimpern trocken sind",
          "Nur einmal pro Woche",
          "Nur unmittelbar vor dem Refill-Termin",
          "Mindestens einmal pro Stunde"
        ],
        "correct": 0,
        "note": null
      }
    ]
  },
  {
    "lesson": 4,
    "title": "Materialien & Produkte für die perfekte Wimpernverlängerung: Dein Starter-Guide",
    "questions": [
      {
        "position": 1,
        "question": "Welcher Klebertyp ist für die meisten Wimpernstylistinnen im Studioalltag am besten geeignet?",
        "options": [
          "Ein extrem schnell trocknender Kleber, unabhängig von Arbeitstempo und Raumklima",
          "Ein professioneller, mittel-schnell trocknender Kleber, der zum eigenen Arbeitstempo sowie zu Temperatur und Luftfeuchtigkeit passt",
          "Haushalts-Sekundenkleber",
          "Ein Kleber ohne Herstellerangaben oder Haltbarkeitsdatum"
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 2,
        "question": "Warum sind Jade-Steine oder Kleberringe bei der Arbeit mit Wimpernkleber wichtig?",
        "options": [
          "Sie ersetzen die Pinzetten bei der Applikation.",
          "Sie werden direkt auf das Augenlid gelegt.",
          "Sie ermöglichen eine kontrollierte, griffbereite und saubere Portionierung des Klebertropfens.",
          "Sie machen das Reinigen der Naturwimpern überflüssig."
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 3,
        "question": "Was ist beim Wimpernkleber unbedingt zu beachten?",
        "options": [
          "Herstellerangaben zu Temperatur, Luftfeuchtigkeit, Anwendung, Haltbarkeit und Lagerung müssen eingehalten werden.",
          "Die Flasche sollte während der gesamten Behandlung offen bleiben.",
          "Alter Kleber kann unbegrenzt mit frischem Kleber vermischt werden.",
          "Je mehr Kleber verwendet wird, desto sicherer ist die Behandlung."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 4,
        "question": "Welche Pinzettenkombination ist ideal für die 1:1 Wimpernverlängerung?",
        "options": [
          "Zwei breite Haushaltspinzetten",
          "Eine Nagelschere und eine Volumenbürste",
          "Nur eine einzige Pinzette für alle Arbeitsschritte",
          "Eine präzise Isolierpinzette und eine geeignete Applikationspinzette"
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 5,
        "question": "Warum ist ein Primer vor dem Kleben der Extensions sinnvoll?",
        "options": [
          "Er ersetzt grundsätzlich jede vorherige Reinigung.",
          "Er bereitet die Naturwimpern entsprechend dem Produktsystem auf die Verklebung vor und kann die Haftbedingungen optimieren.",
          "Er wird als Kleber direkt auf die Haut aufgetragen.",
          "Er löst bereits vorhandene Extensions vollständig auf."
        ],
        "correct": 1,
        "note": null
      }
    ]
  },
  {
    "lesson": 5,
    "title": "Wimpernkleber & Remover: Alles, was professionelle Wimpernstylistinnen wissen müssen",
    "questions": [
      {
        "position": 1,
        "question": "Was ist der Hauptinhaltsstoff der meisten Wimpernkleber?",
        "options": [
          "Acrylfarbe",
          "Silikonöl",
          "Cyanoacrylat",
          "Wasserstoffperoxid"
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 2,
        "question": "Welche Luftfeuchtigkeit ist ideal, damit der Wimpernkleber optimal haftet?",
        "options": [
          "Typischerweise etwa 45 bis 60 Prozent relative Luftfeuchtigkeit, sofern der Hersteller nichts anderes vorgibt",
          "Unter 10 Prozent",
          "Exakt 100 Prozent",
          "Die Luftfeuchtigkeit hat keinen Einfluss."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 3,
        "question": "Was bewirkt zu niedrige Luftfeuchtigkeit beim Arbeiten mit Wimpernkleber?",
        "options": [
          "Der Kleber härtet immer sofort aus.",
          "Der Kleber wird automatisch wasserlöslich.",
          "Die Extensions werden ohne Kleber dauerhaft befestigt.",
          "Der Kleber kann langsamer aushärten, fädig werden und unerwünschte Verklebungen begünstigen."
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 4,
        "question": "Wofür wird ein Gel-Remover verwendet?",
        "options": [
          "Zum Färben der Naturwimpern",
          "Zum kontrollierten Lösen des Wimpernklebers und Entfernen von Extensions",
          "Zum Desinfizieren des Fußbodens",
          "Zum schnelleren Aushärten eines frischen Klebertropfens"
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 5,
        "question": "Was sollte beim Entfernen von Wimpern mit einem Cream-Remover unbedingt vermieden werden?",
        "options": [
          "Das Arbeiten in kleinen, kontrollierten Bereichen",
          "Das geschlossene Halten der Augen",
          "Kontakt des Removers mit dem Auge, den Schleimhäuten oder ungeschützter Haut",
          "Das Befolgen der Herstellerangaben"
        ],
        "correct": 2,
        "note": null
      }
    ]
  },
  {
    "lesson": 6,
    "title": "Kunden gewinnen für deine Wimpernverlängerung: So startest du erfolgreich durch!",
    "questions": [
      {
        "position": 1,
        "question": "Was ist laut Guide besonders wichtig, um Vertrauen bei neuen Kundinnen aufzubauen?",
        "options": [
          "Ein authentisches Portfolio, transparente Informationen und echte Bewertungen beziehungsweise Referenzen",
          "Erfundene Bewertungen mit möglichst vielen Sternen",
          "Möglichst wenige Informationen über Preise und Leistungen",
          "Häufig wechselnde Namen und Designs"
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 2,
        "question": "Welche Plattform wird im Guide besonders als Startpunkt für Sichtbarkeit empfohlen?",
        "options": [
          "Eine anonyme Chat-Plattform ohne Unternehmensprofil",
          "Eine ausschließlich interne Buchhaltungssoftware",
          "Instagram mit einem professionell gepflegten Business-Auftritt",
          "Eine private Cloud-Festplatte"
        ],
        "correct": 2,
        "note": "Vor Veröffentlichung mit dem genauen Wortlaut des Videos abgleichen."
      },
      {
        "position": 3,
        "question": "Warum sind Vorher-Nachher-Bilder so wirkungsvoll im Marketing?",
        "options": [
          "Weil sie rechtliche Pflichtangaben ersetzen.",
          "Weil sie jede Behandlungsgarantie überflüssig machen.",
          "Weil sie unabhängig von der tatsächlichen Arbeit erstellt werden dürfen.",
          "Weil sie das tatsächliche Ergebnis sichtbar machen und Interessentinnen die Qualität besser einschätzen können."
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 4,
        "question": "Was gehört zu einem professionellen Online-Auftritt?",
        "options": [
          "Nur ein privates Profil ohne Kontaktmöglichkeit",
          "Eine mobil optimierte Website oder Profilseite mit Leistungen, echten Arbeitsbeispielen, Kontaktinformationen und rechtlichen Pflichtseiten",
          "Ausschließlich ein Logo ohne weitere Informationen",
          "Unvollständige Preisangaben und nicht erreichbare Kontaktwege"
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 5,
        "question": "Welche Maßnahme hilft dir laut Guide, auch lokal besser gefunden zu werden?",
        "options": [
          "Ein vollständig gepflegtes Google Business Profile mit korrekten Kontaktdaten, Leistungen und echten Bewertungen",
          "Das Entfernen der Adresse aus allen Profilen",
          "Das Sperren der Website für Mobilgeräte",
          "Der Verzicht auf regionale Begriffe und Ortsangaben"
        ],
        "correct": 0,
        "note": null
      }
    ]
  },
  {
    "lesson": 7,
    "title": "Praktische Visualisierung",
    "questions": [
      {
        "position": 1,
        "question": "Warum müssen die Naturwimpern vor einer Wimpernverlängerung gründlich gereinigt werden?",
        "options": [
          "Damit möglichst viel Make-up auf den Wimpern verbleibt.",
          "Damit mehrere Naturwimpern leichter zusammenkleben.",
          "Damit auf einen Primer und alle weiteren Vorbereitungsschritte immer verzichtet werden kann.",
          "Damit Öl, Make-up, Staub und Ablagerungen entfernt werden und eine hygienische, haltbare Klebeverbindung möglich ist."
        ],
        "correct": 3,
        "note": null
      },
      {
        "position": 2,
        "question": "Welche Aussage zum Kleber ist korrekt?",
        "options": [
          "Je größer die Klebermenge, desto besser ist grundsätzlich die Haltbarkeit.",
          "Es wird eine kontrollierte, kleine und frische Klebermenge verwendet; Raumklima und Herstellerangaben müssen beachtet werden.",
          "Der Kleber wird direkt auf die Haut des Augenlids aufgetragen.",
          "Ein Klebertropfen muss unabhängig von seinem Zustand für den gesamten Arbeitstag verwendet werden."
        ],
        "correct": 1,
        "note": null
      },
      {
        "position": 3,
        "question": "Woran erkennt man ein korrektes Refill?",
        "options": [
          "Alle herausgewachsenen Extensions bleiben unverändert an ihrem Platz.",
          "Lücken werden ausschließlich durch besonders lange Extensions verdeckt.",
          "Herausgewachsene oder gelöste Extensions werden fachgerecht entfernt, Lücken sauber aufgefüllt und die Naturwimpern bleiben korrekt isoliert.",
          "Mehrere Naturwimpern werden bewusst miteinander verklebt."
        ],
        "correct": 2,
        "note": null
      },
      {
        "position": 4,
        "question": "Welche Aussage zur Nachpflege ist korrekt?",
        "options": [
          "Extensions sollten regelmäßig und sanft mit einem geeigneten ölfreien Produkt gereinigt und im trockenen Zustand vorsichtig gebürstet werden.",
          "Extensions dürfen grundsätzlich niemals gereinigt werden.",
          "Ölhaltige Produkte sollten täglich direkt an den Klebestellen verwendet werden.",
          "Lose Extensions sollten von der Kundin gewaltsam herausgezogen werden."
        ],
        "correct": 0,
        "note": null
      },
      {
        "position": 5,
        "question": "Was passiert, wenn Extensions auf der Haut befestigt werden?",
        "options": [
          "Die Haltbarkeit verbessert sich automatisch.",
          "Die Naturwimper kann dadurch freier wachsen.",
          "Es entsteht die fachlich ideale Klebeverbindung.",
          "Es können Zug, Reizungen, Beschwerden, allergische Reaktionen und eine schlechte Haltbarkeit entstehen."
        ],
        "correct": 3,
        "note": null
      }
    ]
  }
]$quiz$::jsonb;
  lesson_json jsonb;
  question_json jsonb;
  option_text_value text;
  target_lesson_id uuid;
  target_question_id uuid;
  option_position integer;
begin
  for lesson_json in select value from jsonb_array_elements(seed_data)
  loop
    select lesson.id into strict target_lesson_id
    from public.lessons lesson
    join public.courses course on course.id = lesson.course_id
    where course.slug = 'online-schulung-wimpernverlaengerung'
      and lesson.position = (lesson_json ->> 'lesson')::integer;

    for question_json in select value from jsonb_array_elements(lesson_json -> 'questions')
    loop
      insert into public.quiz_questions
        (lesson_id, position, question_text, editorial_note, status, approved_at, approved_by, version)
      values (
        target_lesson_id,
        (question_json ->> 'position')::integer,
        question_json ->> 'question',
        nullif(question_json ->> 'note', ''),
        'draft', null, null, 1
      )
      on conflict (lesson_id, position) do update set
        question_text = excluded.question_text,
        editorial_note = excluded.editorial_note,
        status = 'draft',
        approved_at = null,
        approved_by = null,
        version = public.quiz_questions.version + 1
      returning id into target_question_id;

      option_position := 0;
      for option_text_value in select value from jsonb_array_elements_text(question_json -> 'options')
      loop
        option_position := option_position + 1;
        insert into public.quiz_options (question_id, option_text, is_correct, position)
        values (
          target_question_id,
          option_text_value,
          option_position - 1 = (question_json ->> 'correct')::integer,
          option_position
        )
        on conflict (question_id, position) do update set
          option_text = excluded.option_text,
          is_correct = excluded.is_correct;
      end loop;
    end loop;
  end loop;
end;
$seed$;

-- Production check: both values must be 35 before editorial review begins.
select count(*) as question_count,
       count(*) filter (where question.status = 'draft') as draft_count
from public.quiz_questions question
join public.lessons lesson on lesson.id = question.lesson_id
join public.courses course on course.id = lesson.course_id
where course.slug = 'online-schulung-wimpernverlaengerung';
