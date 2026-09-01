import DashboardLayout from "@/app/components/layout/DashboardLayout";
import { FHIR_MODULES } from "@/app/lib/constants/modules";
import { getSession } from "@/app/lib/session";
import { getDeliveryStats, getRecentLogs } from "@/app/lib/dal/fhir.dal";
import type { HttpMethod } from "@/app/lib/types/api";
import Link from "next/link";
import {
  LuSend,
  LuCircleCheck,
  LuCircleX,
  LuCalendarDays,
  LuArrowRight,
} from "react-icons/lu";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fmtRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  return `${days} hari lalu`;
}

// ─────────────────────────────────────────────
// Styling maps
// ─────────────────────────────────────────────

const METHOD_PILL: Record<string, string> = {
  GET: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  POST: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  PUT: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  PATCH: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  DELETE: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const BADGE_STYLE: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  Beta: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  Soon: "bg-slate-100 text-slate-400",
};

const MODULE_ACCENT: Record<string, { from: string; border: string }> = {
  CarePlan: { from: "from-teal-50", border: "border-teal-100" },
  ClinicalImpression: { from: "from-pink-50", border: "border-pink-100" },
  Condition: { from: "from-blue-50", border: "border-blue-100" },
  Observation: { from: "from-violet-50", border: "border-violet-100" },
  Procedure: { from: "from-orange-50", border: "border-orange-100" },
  Encounter: { from: "from-cyan-50", border: "border-cyan-100" },
  Location: { from: "from-green-50", border: "border-green-100" },
  Patient: { from: "from-rose-50", border: "border-rose-100" },
  Practitioner: { from: "from-indigo-50", border: "border-indigo-100" },
  Organization: { from: "from-sky-50", border: "border-sky-100" },
  Medication: { from: "from-emerald-50", border: "border-emerald-100" },
  MedicationRequest: { from: "from-lime-50", border: "border-lime-100" },
  MedicationDispense: { from: "from-green-50", border: "border-green-100" },
  AllergyIntolerance: { from: "from-yellow-50", border: "border-yellow-100" },
  DiagnosticReport: { from: "from-fuchsia-50", border: "border-fuchsia-100" },
  ServiceRequest: { from: "from-purple-50", border: "border-purple-100" },
  Specimen: { from: "from-teal-50", border: "border-teal-100" },
  ImagingStudy: { from: "from-sky-50", border: "border-sky-200" },
  EpisodeOfCare: { from: "from-emerald-50", border: "border-emerald-100" },
  QuestionnaireResponse: {
    from: "from-orange-50",
    border: "border-orange-100",
  },
  JpgToDicom: { from: "from-violet-50", border: "border-violet-100" },
  DicomRouter: { from: "from-cyan-50", border: "border-cyan-100" },
  PatchAcsn: { from: "from-orange-50", border: "border-orange-100" },
};

// ─────────────────────────────────────────────
// Page (Server Component)
// ─────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();

  const emptyStats = {
    total: 0,
    success: 0,
    failed: 0,
    today: 0,
    todaySuccess: 0,
    todayFailed: 0,
    avgResponseMs: null,
    lastActivityAt: null,
  };

  const [stats, recentLogs] = session
    ? await Promise.all([
        getDeliveryStats(session.userId),
        getRecentLogs(session.userId, 6),
      ])
    : [emptyStats, []];

  const successRate =
    stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : "0.0";
  const failRate =
    stats.total > 0 ? ((stats.failed / stats.total) * 100).toFixed(1) : "0.0";

  const fhirModules = FHIR_MODULES.filter((m) => m.group !== "Utilitas");
  const utilsModules = FHIR_MODULES.filter((m) => m.group === "Utilitas");
  const activeModules = FHIR_MODULES.filter((m) => m.hasPage !== false).length;

  const statCards = [
    {
      label: "Total Kiriman",
      value: fmt(stats.total),
      sub: stats.lastActivityAt
        ? `Terakhir: ${fmtRelative(stats.lastActivityAt)}`
        : "Belum ada kiriman",
      icon: LuSend,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-600",
      valueCls: "text-slate-900",
    },
    {
      label: "Berhasil",
      value: fmt(stats.success),
      sub: `${successRate}% dari total`,
      icon: LuCircleCheck,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      valueCls: "text-emerald-700",
    },
    {
      label: "Gagal",
      value: fmt(stats.failed),
      sub: `${failRate}% dari total`,
      icon: LuCircleX,
      iconBg: "bg-red-50",
      iconColor: "text-red-500",
      valueCls: stats.failed > 0 ? "text-red-600" : "text-slate-400",
    },
    {
      label: "Hari Ini",
      value: fmt(stats.today),
      sub:
        stats.today > 0
          ? `${fmt(stats.todaySuccess)} berhasil · ${fmt(stats.todayFailed)} gagal`
          : "Belum ada kiriman hari ini",
      icon: LuCalendarDays,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      valueCls: stats.today > 0 ? "text-blue-700" : "text-slate-400",
    },
  ];

  return (
    <DashboardLayout title="Dashboard" breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-8">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Overview Integrasi
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Pantau pengiriman data FHIR ke platform Satu Sehat Kemenkes RI
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {stats.avgResponseMs !== null && (
              <span className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-xl font-medium shadow-sm">
                Avg response: {fmtMs(stats.avgResponseMs)}
              </span>
            )}
            {session && (
              <span className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-xl font-medium shadow-sm">
                {session.username}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Terhubung
            </span>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-xl ${stat.iconBg}`}
                >
                  <stat.icon className={`h-4.5 w-4.5 ${stat.iconColor}`} />
                </span>
                <span className="text-[10px] font-medium text-slate-400 text-right leading-tight max-w-24">
                  {stat.sub}
                </span>
              </div>
              <p
                className={`text-2xl font-bold tabular-nums tracking-tight ${stat.valueCls}`}
              >
                {stat.value}
              </p>
              <p className="text-xs text-slate-400 font-medium mt-1">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Aktivitas Terakhir ── */}
        {recentLogs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                Aktivitas Terakhir
              </h2>
              <span className="text-[11px] text-slate-400">
                {stats.lastActivityAt ? fmtDate(stats.lastActivityAt) : ""}
              </span>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-50">
                {recentLogs.map((log) => {
                  const isSuccess =
                    log.status_code >= 200 && log.status_code < 300;
                  return (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
                    >
                      {/* Method */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${METHOD_PILL[log.method] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {log.method}
                      </span>

                      {/* Resource type */}
                      <span className="text-sm font-medium text-slate-700 flex-1 truncate">
                        {log.resource_type}
                      </span>

                      {/* Status code */}
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums shrink-0 ${
                          isSuccess
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {log.status_code}
                      </span>

                      {/* Response time */}
                      <span className="text-[11px] text-slate-400 font-mono shrink-0 hidden sm:block">
                        {fmtMs(log.time_ms)}
                      </span>

                      {/* Relative time */}
                      <span className="text-[11px] text-slate-400 shrink-0 hidden md:block min-w-24 text-right">
                        {fmtRelative(log.sent_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── FHIR Modules ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Modul FHIR Resource
            </h2>
            <span className="text-xs text-slate-400">
              {activeModules} aktif · {FHIR_MODULES.length} total
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[...fhirModules]
              .sort((a, b) => {
                const rank = (m: typeof a) =>
                  m.hasPage === false || m.badge === "Soon" ? 1 : 0;
                return rank(a) - rank(b);
              })
              .map((mod) => {
                const accent = MODULE_ACCENT[mod.name] ?? {
                  from: "from-slate-50",
                  border: "border-slate-100",
                };
                const isDisabled =
                  mod.hasPage === false || mod.badge === "Soon";
                const card = (
                  <div
                    className={`group bg-linear-to-br ${accent.from} to-white border ${accent.border} rounded-2xl p-5 transition-all duration-200 ${
                      isDisabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/70 text-slate-700 ring-1 ring-black/5 shadow-sm">
                          <mod.icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            {mod.name}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {mod.group}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BADGE_STYLE[mod.badge]}`}
                        >
                          {mod.badge}
                        </span>
                        {isDisabled && mod.badge !== "Soon" && (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400">
                            Segera
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      {mod.desc}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {mod.methods.map((m: HttpMethod) => (
                        <span
                          key={m}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${METHOD_PILL[m]}`}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                    {!isDisabled && (
                      <div className="mt-4 flex items-center gap-1 text-[11px] font-semibold text-teal-600 opacity-0 transition-opacity group-hover:opacity-100">
                        Buka modul
                        <LuArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    )}
                  </div>
                );
                return isDisabled ? (
                  <div key={mod.name}>{card}</div>
                ) : (
                  <Link key={mod.name} href={mod.path}>
                    {card}
                  </Link>
                );
              })}
          </div>
        </div>

        {/* ── Utilitas ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Utilitas
            </h2>
            <span className="text-xs text-slate-400">
              {utilsModules.length} alat
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {utilsModules.map((mod) => {
              const accent = MODULE_ACCENT[mod.name] ?? {
                from: "from-slate-50",
                border: "border-slate-100",
              };
              const card = (
                <div
                  className={`group bg-linear-to-br ${accent.from} to-white border ${accent.border} rounded-2xl p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/70 text-slate-700 ring-1 ring-black/5 shadow-sm">
                        <mod.icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {mod.name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Utilitas
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${BADGE_STYLE[mod.badge]}`}
                    >
                      {mod.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    {mod.desc}
                  </p>
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-teal-600 opacity-0 transition-opacity group-hover:opacity-100">
                    Buka alat
                    <LuArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              );
              return (
                <Link key={mod.name} href={mod.path}>
                  {card}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 pt-4 pb-2">
          Satu Sehat Integration Dashboard · FHIR R4 · Kemenkes RI
        </p>
      </div>
    </DashboardLayout>
  );
}
