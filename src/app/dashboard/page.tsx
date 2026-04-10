import DashboardLayout from "@/app/components/layout/DashboardLayout";
import { FHIR_MODULES } from "@/app/lib/constants/modules";
import { getSession } from "@/app/lib/session";
import { getDeliveryStats } from "@/app/lib/dal/fhir.dal";
import type { HttpMethod } from "@/app/lib/types/api";
import Link from "next/link";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatCount(n: number): string {
  return n.toLocaleString("id-ID");
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
  MedicationRequest: { from: "from-lime-50", border: "border-lime-100" },
  AllergyIntolerance: { from: "from-yellow-50", border: "border-yellow-100" },
  DiagnosticReport: { from: "from-fuchsia-50", border: "border-fuchsia-100" },
  ServiceRequest: { from: "from-purple-50", border: "border-purple-100" },
  EpisodeOfCare: { from: "from-emerald-50", border: "border-emerald-100" },
  QuestionnaireResponse: {
    from: "from-orange-50",
    border: "border-orange-100",
  },
};

// ─────────────────────────────────────────────
// Stat card definition
// ─────────────────────────────────────────────

interface StatCard {
  label: string;
  value: string;
  sub: string;
  icon: string;
  iconBg: string;
  valueCls: string;
}

function buildStatCards(
  total: number,
  success: number,
  failed: number,
  today: number,
): StatCard[] {
  const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : "0.0";
  const failRate = total > 0 ? ((failed / total) * 100).toFixed(1) : "0.0";

  return [
    {
      label: "Total Kiriman",
      value: formatCount(total),
      sub: "Semua resource FHIR",
      icon: "📤",
      iconBg: "bg-slate-100",
      valueCls: "text-slate-900",
    },
    {
      label: "Berhasil",
      value: formatCount(success),
      sub: `${successRate}% dari total`,
      icon: "✅",
      iconBg: "bg-emerald-50",
      valueCls: "text-emerald-700",
    },
    {
      label: "Gagal",
      value: formatCount(failed),
      sub: `${failRate}% dari total`,
      icon: "❌",
      iconBg: "bg-red-50",
      valueCls: "text-red-600",
    },
    {
      label: "Hari Ini",
      value: formatCount(today),
      sub: "Kiriman sejak 00:00",
      icon: "📅",
      iconBg: "bg-blue-50",
      valueCls: "text-blue-700",
    },
  ];
}

// ─────────────────────────────────────────────
// Page (Server Component)
// ─────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getSession();

  const stats = session
    ? await getDeliveryStats(session.userId)
    : { total: 0, success: 0, failed: 0, today: 0 };

  const statCards = buildStatCards(
    stats.total,
    stats.success,
    stats.failed,
    stats.today,
  );

  const activeModules = FHIR_MODULES.filter((m) => m.hasPage !== false).length;

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
          <div className="flex items-center gap-2 shrink-0">
            {session && (
              <span className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-xl font-medium shadow-sm">
                {session.username}
              </span>
            )}
            <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Terhubung
            </span>
            <span className="text-xs text-slate-500 bg-white border border-slate-200 px-3 py-2 rounded-xl font-medium shadow-sm">
              Env: Development
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
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base leading-none ${stat.iconBg}`}
                >
                  {stat.icon}
                </span>
                <span className="text-[10px] font-medium text-slate-400 text-right leading-tight max-w-20">
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

        {/* ── Modules Grid ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
              Modul FHIR Resource
            </h2>
            <span className="text-xs text-slate-400">
              {activeModules} aktif · {FHIR_MODULES.length} total
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...FHIR_MODULES]
              .sort((a, b) => {
                const rank = (m: typeof a) =>
                  m.hasPage === false ? 1 : m.badge === "Soon" ? 1 : 0;
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
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl leading-none">
                          {mod.icon}
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

                    {/* Desc */}
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      {mod.desc}
                    </p>

                    {/* Methods */}
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

                    {/* Arrow */}
                    {!isDisabled && (
                      <div className="flex items-center gap-1 mt-4 text-teal-600 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        Buka modul
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2.5 6H9.5M7 3.5L9.5 6L7 8.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
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

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 pt-4 pb-2">
          Satu Sehat Integration Dashboard · FHIR R4 · Kemenkes RI
        </p>
      </div>
    </DashboardLayout>
  );
}
