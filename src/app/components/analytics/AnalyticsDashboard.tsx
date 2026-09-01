"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuCircleCheck,
  LuClock,
  LuDatabase,
  LuStickyNote,
  LuTrendingUp,
  LuTrendingDown,
  LuRefreshCw,
  LuInbox,
} from "react-icons/lu";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler,
  Legend,
  type ChartOptions,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import type { AnalyticsData, NotesSummary } from "@/app/lib/dal/analytics.dal";
import type { CoverageData } from "@/app/lib/dal/coverage.dal";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Filler,
  Legend,
);

// ── Warna ────────────────────────────────────────────────
const C = {
  teal: "#0d9488",
  tealSoft: "rgba(13,148,136,0.12)",
  rose: "#fb7185",
  roseSoft: "rgba(251,113,133,0.12)",
  slate: "#e2e8f0",
  grid: "#f1f5f9",
};
const MARK_COLOR: Record<string, string> = {
  merah: "#ef4444",
  kuning: "#f59e0b",
  hijau: "#22c55e",
  biru: "#3b82f6",
  tanpa: "#cbd5e1",
};
const METHOD_HEX: Record<string, string> = {
  POST: "#10b981",
  GET: "#3b82f6",
  PUT: "#f59e0b",
  PATCH: "#8b5cf6",
  DELETE: "#f43f5e",
};

// ── Helpers ──────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString("id-ID");
}
function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}
function fmtRelative(iso: string | null): string {
  if (!iso) return "belum ada aktivitas";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  return `${days} hari lalu`;
}
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function shortLabel(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

const RANGES = [
  { days: 7, label: "7 hari" },
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
];

// ── Kartu wadah ──────────────────────────────────────────
function Card({
  title,
  right,
  className = "",
  children,
}: {
  title?: string;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-bold text-slate-700">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
        baru
      </span>
    );
  }
  const up = pct >= 0;
  const Icon = up ? LuTrendingUp : LuTrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
      }`}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-8" : "py-14"}`}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-50 text-slate-300">
        <LuInbox className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-slate-500">Belum ada data</p>
    </div>
  );
}

function Skeleton({ h = 240 }: { h?: number }) {
  return (
    <div className="animate-pulse rounded-xl bg-slate-100" style={{ height: h }} />
  );
}

// ── Komponen utama ───────────────────────────────────────
export default function AnalyticsDashboard({
  initial,
  notes,
}: {
  initial: AnalyticsData;
  notes: NotesSummary;
}) {
  const [data, setData] = useState<AnalyticsData>(initial);
  const [days, setDays] = useState<number>(initial.rangeDays);
  const [loading, setLoading] = useState(false);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [covLoading, setCovLoading] = useState(true);

  const loadDelivery = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?days=${d}`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as AnalyticsData);
    } catch {
      /* pertahankan data lama */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCoverage = useCallback(async (force = false) => {
    setCovLoading(true);
    try {
      const res = await fetch(`/api/analytics/coverage${force ? "?force=1" : ""}`, {
        cache: "no-store",
      });
      if (res.ok) setCoverage((await res.json()) as CoverageData);
    } catch {
      /* biarkan */
    } finally {
      setCovLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoverage(false);
  }, [loadCoverage]);

  const changeRange = (d: number) => {
    if (d === days) return;
    setDays(d);
    loadDelivery(d);
  };

  const refreshAll = () => {
    loadDelivery(days);
    loadCoverage(true);
  };

  const { totals, series, methods } = data;
  const covTotals = coverage?.totals;

  // ── KPI cards ──
  const kpis = [
    {
      label: "Cakupan Sinkronisasi",
      value: covTotals ? `${covTotals.coveragePct.toFixed(1)}%` : null,
      sub: covTotals
        ? `${fmt(covTotals.sent)} / ${fmt(covTotals.total)} record`
        : "menghitung…",
      icon: LuDatabase,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      valueCls: "text-slate-900",
    },
    {
      label: "Terkirim",
      value: covTotals ? fmt(covTotals.sent) : null,
      sub: `laju kirim ${days} hari`,
      icon: LuCircleCheck,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      valueCls: "text-emerald-700",
      extra: <GrowthBadge pct={totals.growthPct} />,
    },
    {
      label: "Belum Terkirim",
      value: covTotals ? fmt(covTotals.unsent) : null,
      sub: covTotals
        ? `${(100 - covTotals.coveragePct).toFixed(1)}% dari total`
        : "menghitung…",
      icon: LuClock,
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      valueCls: covTotals && covTotals.unsent > 0 ? "text-amber-600" : "text-slate-400",
    },
    {
      label: "Catatan Tindak Lanjut",
      value: fmt(notes.total),
      sub:
        notes.total > 0
          ? `${fmt(notes.byMark.kuning)} kuning · ${fmt(notes.byMark.merah)} merah`
          : "tidak ada catatan",
      icon: LuStickyNote,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
      valueCls: notes.total > 0 ? "text-slate-900" : "text-slate-400",
    },
  ];

  // ── Chart: cakupan per resource (horizontal stacked bar) ──
  const covItems = coverage?.items ?? [];
  const covBarData = {
    labels: covItems.map((i) => i.resourceType),
    datasets: [
      {
        label: "Terkirim",
        data: covItems.map((i) => i.sent),
        backgroundColor: C.teal,
        borderRadius: 4,
        stack: "s",
        barThickness: 16,
      },
      {
        label: "Belum",
        data: covItems.map((i) => i.unsent),
        backgroundColor: C.slate,
        borderRadius: 4,
        stack: "s",
        barThickness: 16,
      },
    ],
  };
  const covBarOptions: ChartOptions<"bar"> = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    // axis:"y" wajib untuk bar horizontal — tanpa ini mode "index" mencocokkan
    // ke sumbu-x (nilai) sehingga tooltip salah baris.
    interaction: { mode: "index", intersect: false, axis: "y" },
    plugins: {
      legend: { position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, usePointStyle: true } },
      tooltip: {
        callbacks: {
          afterBody: (items) => {
            const it = covItems[items[0]?.dataIndex ?? 0];
            return it ? `Cakupan ${it.coveragePct.toFixed(1)}% · total ${fmt(it.total)}` : "";
          },
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { color: C.grid }, ticks: { font: { size: 10 }, precision: 0 }, border: { display: false } },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } }, border: { display: false } },
    },
  };

  // ── Chart: tren pengiriman (line) ──
  const trendData = {
    labels: series.map((p) => shortLabel(p.date)),
    datasets: [
      {
        label: "Berhasil",
        data: series.map((p) => p.success),
        borderColor: C.teal,
        backgroundColor: C.tealSoft,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: "Gagal",
        data: series.map((p) => p.error),
        borderColor: C.rose,
        backgroundColor: C.roseSoft,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  };
  const trendOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: false }, tooltip: { titleFont: { size: 11 }, bodyFont: { size: 11 } } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 8, autoSkip: true }, border: { display: false } },
      y: { beginAtZero: true, grid: { color: C.grid }, ticks: { font: { size: 10 }, precision: 0 }, border: { display: false } },
    },
  };

  // ── Chart: donut cakupan keseluruhan ──
  const covDonut = useMemo(() => {
    const sent = covTotals?.sent ?? 0;
    const unsent = covTotals?.unsent ?? 0;
    return {
      data: {
        labels: ["Terkirim", "Belum"],
        datasets: [{ data: [sent, unsent], backgroundColor: [C.teal, C.slate], borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "72%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
      } as ChartOptions<"doughnut">,
    };
  }, [covTotals?.sent, covTotals?.unsent]);

  // ── Chart: donut catatan (marks) ──
  const noteMarks = (["merah", "kuning", "hijau", "biru", "tanpa"] as const).filter(
    (m) => notes.byMark[m] > 0,
  );
  const notesDonut = {
    data: {
      labels: noteMarks.map((m) => m),
      datasets: [
        {
          data: noteMarks.map((m) => notes.byMark[m]),
          backgroundColor: noteMarks.map((m) => MARK_COLOR[m]),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { display: false } },
    } as ChartOptions<"doughnut">,
  };

  // ── Chart: donut metode ──
  const methodsDonut = {
    data: {
      labels: methods.map((m) => m.method),
      datasets: [
        {
          data: methods.map((m) => m.count),
          backgroundColor: methods.map((m) => METHOD_HEX[m.method] ?? "#94a3b8"),
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: { legend: { display: false } },
    } as ChartOptions<"doughnut">,
  };

  const deliveryEmpty = totals.total === 0;
  const covBarHeight = Math.max(220, covItems.length * 34);

  return (
    <div className="space-y-6">
      {/* Header + kontrol */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard Analitik
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cakupan sinkronisasi per resource & tren pengiriman ke Satu Sehat ·
            pembaruan {fmtRelative(totals.lastActivityAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => changeRange(r.days)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  days === r.days
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refreshAll}
            aria-label="Muat ulang"
            className={`grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 ${
              loading || covLoading ? "animate-spin" : ""
            }`}
          >
            <LuRefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${k.iconBg}`}>
                <k.icon className={`h-4.5 w-4.5 ${k.iconColor}`} />
              </span>
              {k.extra ?? null}
            </div>
            {k.value == null ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-slate-100" />
            ) : (
              <p className={`text-2xl font-bold tabular-nums tracking-tight ${k.valueCls}`}>
                {k.value}
              </p>
            )}
            <p className="mt-1 text-xs font-medium text-slate-400">{k.label}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Cakupan per resource (headline) */}
      <Card
        title="Cakupan per Resource"
        right={
          <span className="text-[11px] text-slate-400">
            {covItems.length > 0 ? `${covItems.length} resource · SIMGOS` : "SIMGOS"}
          </span>
        }
      >
        {covLoading ? (
          <Skeleton h={300} />
        ) : covItems.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ height: covBarHeight }}>
            <Bar data={covBarData} options={covBarOptions} />
          </div>
        )}
      </Card>

      {/* Tren + donut cakupan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Tren Pengiriman"
          className="lg:col-span-2"
          right={
            <div className="flex items-center gap-4 text-[11px] font-medium">
              <span className="text-slate-400">
                {totals.successRate.toFixed(1)}% berhasil · avg {fmtMs(totals.avgMs)}
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> Berhasil
              </span>
              <span className="flex items-center gap-1.5 text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /> Gagal
              </span>
            </div>
          }
        >
          {deliveryEmpty ? (
            <EmptyState />
          ) : (
            <div className="h-64">
              <Line data={trendData} options={trendOptions} />
            </div>
          )}
        </Card>

        <Card title="Cakupan Keseluruhan">
          {covLoading ? (
            <Skeleton h={220} />
          ) : !covTotals || covTotals.total === 0 ? (
            <EmptyState compact />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-44 w-44">
                <Doughnut data={covDonut.data} options={covDonut.options} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-slate-800">
                    {covTotals.coveragePct.toFixed(1)}
                    <span className="text-sm text-slate-400">%</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    tersinkron
                  </span>
                </div>
              </div>
              <div className="flex w-full items-center justify-around">
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums text-teal-600">{fmt(covTotals.sent)}</p>
                  <p className="text-[10px] text-slate-400">Terkirim</p>
                </div>
                <div className="h-8 w-px bg-slate-100" />
                <div className="text-center">
                  <p className="text-lg font-bold tabular-nums text-slate-500">{fmt(covTotals.unsent)}</p>
                  <p className="text-[10px] text-slate-400">Belum</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Catatan + metode */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Catatan Tindak Lanjut" className="lg:col-span-2">
          {notes.total === 0 ? (
            <EmptyState compact />
          ) : (
            <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-2">
              <div className="relative mx-auto h-40 w-40">
                <Doughnut data={notesDonut.data} options={notesDonut.options} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold tabular-nums text-slate-800">
                    {fmt(notes.total)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    catatan
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {(["merah", "kuning", "hijau", "biru", "tanpa"] as const)
                  .filter((m) => notes.byMark[m] > 0)
                  .map((m) => (
                    <div key={m} className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-2 font-semibold capitalize text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: MARK_COLOR[m] }} />
                        {m === "tanpa" ? "tanpa warna" : m}
                      </span>
                      <span className="tabular-nums text-slate-400">{fmt(notes.byMark[m])}</span>
                    </div>
                  ))}
                {notes.byModule.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Modul terbanyak
                    </p>
                    {notes.byModule.slice(0, 4).map((m) => (
                      <div key={m.module} className="flex items-center justify-between text-[11px]">
                        <span className="truncate font-medium text-slate-600">{m.module}</span>
                        <span className="tabular-nums text-slate-400">{fmt(m.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        <Card title="Metode HTTP">
          {methods.length === 0 ? (
            <EmptyState compact />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="h-40 w-40">
                <Doughnut data={methodsDonut.data} options={methodsDonut.options} />
              </div>
              <div className="w-full space-y-1.5">
                {methods.map((m) => (
                  <div key={m.method} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2 font-semibold text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: METHOD_HEX[m.method] ?? "#94a3b8" }} />
                      {m.method}
                    </span>
                    <span className="tabular-nums text-slate-400">{fmt(m.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <p className="pb-2 pt-2 text-center text-[11px] text-slate-300">
        Cakupan dibaca ringan dari SIMGOS (cache 5 menit) · tren dari log
        pengiriman aplikasi
      </p>
    </div>
  );
}
