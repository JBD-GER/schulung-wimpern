import Link from "next/link";
import {
  Activity,
  Award,
  BookOpenCheck,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  ExternalLink,
  FileClock,
  HelpCircle,
  MailWarning,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  UsersRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { AdminData } from "@/components/dashboard/data";
import { DataNotice } from "@/components/dashboard/ui";
import { buttonStyles } from "@/components/ui/button";

function MetricCard({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string;
  value: number | null;
  icon: LucideIcon;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_25px_rgba(29,39,51,.045)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-10 place-items-center rounded-xl bg-navy/5 text-navy">
          <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
        </span>
        <span className="rounded-full bg-ivory px-2.5 py-1 text-[0.63rem] font-extrabold tracking-[0.08em] text-muted uppercase">
          Live-Daten
        </span>
      </div>
      <p className="mt-5 font-serif text-3xl font-semibold tabular-nums text-navy">
        {value === null
          ? "–"
          : `${value.toLocaleString("de-DE")}${suffix ?? ""}`}
      </p>
      <p className="mt-1.5 text-xs font-bold text-muted">{label}</p>
    </div>
  );
}

function statusLabel(value: string | null) {
  switch (value?.toLowerCase()) {
    case "active":
      return "Aktiv";
    case "completed":
      return "Abgeschlossen";
    case "paid":
      return "Bezahlt";
    case "pending":
      return "Ausstehend";
    case "refunded":
      return "Erstattet";
    case "revoked":
      return "Entzogen";
    default:
      return value ?? "Nicht verfügbar";
  }
}

export function AdminOverview({ data }: { data: AdminData }) {
  return (
    <>
      {data.loadFailed ? (
        <div className="mt-8">
          <DataNotice>
            Die Administrationskennzahlen konnten gerade nicht geladen werden.
            Es werden keine Ersatzwerte oder geschätzten Zahlen angezeigt.
          </DataNotice>
        </div>
      ) : null}

      <section className="mt-8" aria-labelledby="admin-metrics-title">
        <div className="flex items-end justify-between gap-5">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
              Übersicht
            </p>
            <h2
              id="admin-metrics-title"
              className="mt-2 font-serif text-2xl font-semibold text-navy"
            >
              Plattformstatus
            </h2>
          </div>
          <p className="hidden text-xs text-muted sm:block">
            Serverseitig und rollenbasiert geladen
          </p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Teilnehmerinnen"
            value={data.counts.participants}
            icon={UsersRound}
          />
          <MetricCard
            label="Aktive Zugänge"
            value={data.counts.activeEnrollments}
            icon={UserCheck}
          />
          <MetricCard
            label="Kursabschlüsse"
            value={data.counts.completions}
            icon={BookOpenCheck}
          />
          <MetricCard
            label="Ø Fortschritt"
            value={data.counts.averageProgress}
            icon={Activity}
            suffix=" %"
          />
          <MetricCard
            label="Zertifikate"
            value={data.counts.certificates}
            icon={Award}
          />
          <MetricCard
            label="Bestandene Versuche"
            value={data.counts.passedAttempts}
            icon={CheckCircle2}
          />
          <MetricCard
            label="Nicht bestanden"
            value={data.counts.failedAttempts}
            icon={XCircle}
          />
          <MetricCard
            label="Zahlungen"
            value={data.counts.payments}
            icon={CircleDollarSign}
          />
          <MetricCard
            label="Rückerstattungen"
            value={data.counts.refunds}
            icon={RefreshCcw}
          />
          <MetricCard
            label="E-Mail-Fehler"
            value={data.counts.emailErrors}
            icon={MailWarning}
          />
          <MetricCard
            label="Offene Datenschutzanfragen"
            value={data.counts.openDataRequests}
            icon={ClipboardList}
          />
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-extrabold tracking-[0.11em] text-gold uppercase">
                Zuletzt
              </p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-navy">
                Kurszugänge
              </h2>
            </div>
            <UserCheck aria-hidden="true" className="size-5 text-muted" />
          </div>
          {data.recentEnrollments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-5 py-3">Teilnehmerin</th>
                    <th className="px-5 py-3">Freigabe</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Fortschritt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.recentEnrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td className="px-5 py-4 font-semibold text-navy">
                        {enrollment.customer ?? "Nicht verfügbar"}
                      </td>
                      <td className="px-5 py-4 text-muted">
                        {enrollment.grantedAt ?? "–"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold text-muted">
                          {statusLabel(enrollment.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold tabular-nums text-navy">
                        {enrollment.progress === null
                          ? "–"
                          : `${enrollment.progress} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm leading-6 text-muted">
              Keine aktuellen Kurszugänge verfügbar.
            </p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div>
              <p className="text-xs font-extrabold tracking-[0.11em] text-gold uppercase">
                Zuletzt
              </p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-navy">
                Bestellungen
              </h2>
            </div>
            <ReceiptText aria-hidden="true" className="size-5 text-muted" />
          </div>
          {data.recentOrders.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-ivory text-[0.62rem] font-extrabold tracking-[0.1em] text-muted uppercase">
                    <th className="px-5 py-3">Kundin</th>
                    <th className="px-5 py-3">Datum</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Betrag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-5 py-4 font-semibold text-navy">
                        {order.customer ?? "Nicht verfügbar"}
                      </td>
                      <td className="px-5 py-4 text-muted">
                        {order.createdAt ?? "–"}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-bold text-muted">
                          {statusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right font-bold tabular-nums text-navy">
                        {order.amount ?? "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-8 text-center text-sm leading-6 text-muted">
              Keine aktuellen Bestellungen verfügbar.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="admin-modules-title">
        <p className="text-xs font-extrabold tracking-[0.14em] text-gold uppercase">
          Verwaltung
        </p>
        <h2
          id="admin-modules-title"
          className="mt-2 font-serif text-2xl font-semibold text-navy"
        >
          Sensible Arbeitsbereiche
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            {
              href: "/admin/teilnehmer",
              icon: UsersRound,
              title: "Teilnehmerverwaltung",
              text: "Zahlung, Zugang, Fortschritt, Quiz und Zertifikate prüfen.",
            },
            {
              href: "/admin/kurs",
              icon: BookOpenCheck,
              title: "Kurs",
              text: "Lektionen, Laufzeiten und geschützte Stream-UIDs.",
            },
            {
              href: "/admin/quiz",
              icon: HelpCircle,
              title: "Quiz",
              text: "Fragen, vier Optionen und redaktionelle Freigaben.",
            },
            {
              href: "/admin/zertifikate",
              icon: Award,
              title: "Zertifikate",
              text: "Unveränderliche PDFs, Versand und Widerruf verwalten.",
            },
            {
              href: "/admin/e-mails",
              icon: FileClock,
              title: "E-Mail-Protokoll",
              text: "Provider-Fehler prüfen und Sendungen kontrolliert wiederholen.",
            },
            {
              href: "/admin/datenschutz",
              icon: ShieldCheck,
              title: "Datenschutzanfragen",
              text: "Offene Lösch-, Berichtigungs- und Exportanfragen bearbeiten.",
            },
          ].map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.title}
                href={module.href}
                className="group rounded-2xl border border-line bg-white p-5 transition hover:border-gold/50 hover:shadow-card"
              >
                <Icon aria-hidden="true" className="size-5 text-gold" />
                <h3 className="mt-4 text-sm font-bold text-navy">
                  {module.title}
                </h3>
                <p className="mt-2 text-xs leading-5 text-muted">
                  {module.text}
                </p>
                <p className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[0.67rem] font-bold text-navy">
                  Arbeitsbereich öffnen{" "}
                  <ExternalLink
                    aria-hidden="true"
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  />
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 flex flex-col justify-between gap-5 rounded-2xl bg-navy p-6 text-white sm:flex-row sm:items-center sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40">
            <ShieldCheck aria-hidden="true" className="size-5 text-[#dfc79f]" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold">
              Finanzdetails in Stripe verwalten
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-white/65">
              Die Plattform zeigt nur relevante Statusdaten. Zahlungsarten,
              Belege und Rückerstattungen werden nicht als eigenes
              Stripe-Dashboard nachgebaut.
            </p>
          </div>
        </div>
        <Link
          href="https://dashboard.stripe.com/"
          target="_blank"
          rel="noreferrer"
          className={buttonStyles({ variant: "gold", className: "shrink-0" })}
        >
          Stripe öffnen <ExternalLink aria-hidden="true" className="size-4" />
        </Link>
      </section>
    </>
  );
}
