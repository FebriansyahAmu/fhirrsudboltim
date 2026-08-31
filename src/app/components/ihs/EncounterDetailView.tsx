"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LuArrowLeft,
  LuRefreshCw,
  LuCircleCheck,
  LuClock,
  LuUserRoundX,
  LuTriangleAlert,
  LuActivity,
  LuCalendarClock,
  LuUser,
  LuChevronDown,
  LuEyeOff,
  LuListFilter,
  LuChevronsDownUp,
  LuChevronsUpDown,
} from "react-icons/lu";

// ── Tipe respons (selaras dengan lib/ihs/encounter-detail.ts) ──
interface DetailMeta {
  label: string;
  value: string;
  type?: string;
}
interface DetailItem {
  sent: boolean;
  satuSehatId: string | null;
  primary: string | null;
  meta: DetailMeta[];
}
interface DetailGroup {
  key: string;
  label: string;
  family: string;
  resourceType: string;
  icon: string;
  accent: string;
  total: number;
  sent: number;
  truncated: boolean;
  items: DetailItem[];
}
interface EncounterHead {
  refId: string;
  found: boolean;
  sent: boolean;
  satuSehatId: string | null;
  status: string | null;
  className: string | null;
  classCode: string | null;
  start: string | null;
  end: string | null;
  patient: string | null;
  patientRef: string | null;
}
interface EncounterDetail {
  encounter: EncounterHead;
  groups: DetailGroup[];
}

// ── Tokens ──────────────────────────────────────────────────
// Aksen per resource → kelas Tailwind (string literal utuh agar ter-scan JIT).
const ACCENT: Record<
  string,
  { icon: string; bar: string; text: string; soft: string }
> = {
  rose: { icon: "bg-rose-50 text-rose-600", bar: "bg-rose-500", text: "text-rose-700", soft: "bg-rose-50" },
  pink: { icon: "bg-pink-50 text-pink-600", bar: "bg-pink-500", text: "text-pink-700", soft: "bg-pink-50" },
  orange: { icon: "bg-orange-50 text-orange-600", bar: "bg-orange-500", text: "text-orange-700", soft: "bg-orange-50" },
  amber: { icon: "bg-amber-50 text-amber-600", bar: "bg-amber-500", text: "text-amber-700", soft: "bg-amber-50" },
  lime: { icon: "bg-lime-50 text-lime-600", bar: "bg-lime-500", text: "text-lime-700", soft: "bg-lime-50" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-50" },
  teal: { icon: "bg-teal-50 text-teal-600", bar: "bg-teal-500", text: "text-teal-700", soft: "bg-teal-50" },
  cyan: { icon: "bg-cyan-50 text-cyan-600", bar: "bg-cyan-500", text: "text-cyan-700", soft: "bg-cyan-50" },
  sky: { icon: "bg-sky-50 text-sky-600", bar: "bg-sky-500", text: "text-sky-700", soft: "bg-sky-50" },
  blue: { icon: "bg-blue-50 text-blue-600", bar: "bg-blue-500", text: "text-blue-700", soft: "bg-blue-50" },
  indigo: { icon: "bg-indigo-50 text-indigo-600", bar: "bg-indigo-500", text: "text-indigo-700", soft: "bg-indigo-50" },
  violet: { icon: "bg-violet-50 text-violet-600", bar: "bg-violet-500", text: "text-violet-700", soft: "bg-violet-50" },
  fuchsia: { icon: "bg-fuchsia-50 text-fuchsia-600", bar: "bg-fuchsia-500", text: "text-fuchsia-700", soft: "bg-fuchsia-50" },
};
const accentOf = (a: string) => ACCENT[a] ?? ACCENT.teal;

// Tone badge status FHIR → warna (semantik, bukan dekoratif).
const TONE: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
};
const STATUS_TONE: Record<string, keyof typeof TONE> = {
  final: "green", completed: "green", active: "green", confirmed: "green",
  available: "green", fulfilled: "green", finished: "green", "in-progress": "blue",
  arrived: "blue", registered: "blue", "on-hold": "blue", intended: "blue",
  planned: "amber", draft: "amber", preliminary: "amber", unconfirmed: "amber",
  partial: "amber", "not-done": "slate", "on-leave": "slate", inactive: "slate",
  cancelled: "slate", stopped: "slate", "entered-in-error": "red", refuted: "red",
  unknown: "slate",
};
const toneFor = (v: string): keyof typeof TONE | null =>
  STATUS_TONE[v.trim().toLowerCase()] ?? null;

// Warna kelas kunjungan (Encounter.class code).
const CLASS_TONE: Record<string, string> = {
  EMER: "bg-rose-100 text-rose-700", // gawat darurat
  IMP: "bg-indigo-100 text-indigo-700", // rawat inap
  ACUTE: "bg-indigo-100 text-indigo-700",
  AMB: "bg-sky-100 text-sky-700", // rawat jalan
  HH: "bg-teal-100 text-teal-700", // home health
  VR: "bg-cyan-100 text-cyan-700", // virtual
  SS: "bg-violet-100 text-violet-700",
  OBSENC: "bg-amber-100 text-amber-700",
};
const classTone = (c: string | null) =>
  (c && CLASS_TONE[c.toUpperCase()]) || "bg-blue-100 text-blue-700";

const STATUS_LABEL: Record<string, string> = {
  planned: "Direncanakan",
  arrived: "Tiba",
  triaged: "Triase",
  "in-progress": "Berlangsung",
  onleave: "Cuti",
  finished: "Selesai",
  cancelled: "Dibatalkan",
};

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

// Kelompokkan groups per `family`, mempertahankan urutan kemunculan.
function byFamily(groups: DetailGroup[]): { family: string; groups: DetailGroup[] }[] {
  const order: string[] = [];
  const map: Record<string, DetailGroup[]> = {};
  for (const g of groups) {
    if (!map[g.family]) {
      map[g.family] = [];
      order.push(g.family);
    }
    map[g.family].push(g);
  }
  return order.map((family) => ({ family, groups: map[family] }));
}

// ── Sub-komponen kecil ──────────────────────────────────────
function MetaChip({ m }: { m: DetailMeta }) {
  const tone = m.type === "code" ? toneFor(m.value) : null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] ring-1 ring-slate-100">
      <span className="text-slate-400">{m.label}</span>
      {tone ? (
        <span
          className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ${TONE[tone]}`}
        >
          {m.value}
        </span>
      ) : (
        <span
          className={m.type === "code" ? "font-mono text-slate-600" : "text-slate-700"}
        >
          {m.value}
        </span>
      )}
    </span>
  );
}

function Toggle({
  active,
  onClick,
  icon,
  children,
  tone = "slate",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "slate" | "amber";
}) {
  const on =
    tone === "amber"
      ? "bg-amber-500 text-white shadow-sm"
      : "bg-slate-800 text-white shadow-sm";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none ${
        active ? on : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export default function EncounterDetailView({ refId }: { refId: string }) {
  const [data, setData] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kontrol interaktif
  const [hideEmpty, setHideEmpty] = useState(false);
  const [onlyUnsent, setOnlyUnsent] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/encounter/${encodeURIComponent(refId)}/detail`,
          { credentials: "same-origin", signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal memuat detail");
        setData(json as EncounterDetail);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Gagal memuat detail");
      } finally {
        setLoading(false);
      }
    },
    [refId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Default: seksi kosong dilipat (header tetap terlihat untuk audit).
  useEffect(() => {
    if (!data) return;
    setCollapsed(new Set(data.groups.filter((g) => g.total === 0).map((g) => g.key)));
  }, [data]);

  const enc = data?.encounter;
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const totalItems = groups.reduce((s, g) => s + g.total, 0);
  const totalSent = groups.reduce((s, g) => s + g.sent, 0);
  const belumTotal = totalItems - totalSent;
  const withData = groups.filter((g) => g.total > 0).length;

  // Terapkan filter tampilan.
  const visibleGroups = useMemo(() => {
    let v = groups;
    if (hideEmpty) v = v.filter((g) => g.total > 0);
    if (onlyUnsent) v = v.filter((g) => g.total - g.sent > 0);
    return v;
  }, [groups, hideEmpty, onlyUnsent]);
  const families = useMemo(() => byFamily(visibleGroups), [visibleGroups]);

  // Scroll-spy: sorot resource yang sedang terlihat di viewport.
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-res]"),
    );
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveKey(vis[0].target.getAttribute("data-res"));
      },
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [families]);

  const scrollToGroup = (key: string) => {
    document
      .getElementById(`res-${key}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const toggleCollapse = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(visibleGroups.map((g) => g.key)));

  const encWaiting = !!enc && !enc.sent && !enc.patientRef;

  return (
    <div className="space-y-5">
      {/* Toolbar atas */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/encounter"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none"
        >
          <LuArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Encounter
        </Link>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 disabled:opacity-60 motion-reduce:transition-none"
        >
          <LuRefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          Muat ulang
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50/60 p-5">
          <LuTriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800">
              Gagal membaca data SIMGOS
            </p>
            <p className="mt-1 wrap-break-word text-xs text-red-700">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-100"
            >
              <LuRefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        </div>
      )}

      {/* Skeleton */}
      {loading && !data && !error && (
        <div className="space-y-5">
          <div className="h-36 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none"
              />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
        </div>
      )}

      {enc && (
        <>
          {/* ── Hero: ringkasan encounter ── */}
          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 bg-linear-to-br from-blue-50 via-white to-cyan-50 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-blue-200 bg-white text-3xl shadow-sm">
                  🏥
                </div>
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <LuUser className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{enc.patient ?? "Pasien —"}</span>
                  </h1>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    No. Pendaftaran · {enc.refId}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {enc.className && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classTone(enc.classCode)}`}
                      >
                        <LuActivity className="h-3 w-3" />
                        {enc.className}
                        {enc.classCode ? ` · ${enc.classCode}` : ""}
                      </span>
                    )}
                    {enc.status &&
                      (() => {
                        const t = toneFor(enc.status);
                        return (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${t ? TONE[t] : "bg-slate-100 text-slate-600 ring-slate-200"}`}
                          >
                            {STATUS_LABEL[enc.status] ?? enc.status}
                          </span>
                        );
                      })()}
                    {(enc.start || enc.end) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                        <LuCalendarClock className="h-3 w-3" />
                        {enc.start ?? "—"}
                        {enc.end ? ` – ${enc.end}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status kirim encounter */}
              <div className="shrink-0">
                {enc.sent ? (
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
                      <LuCircleCheck className="h-3.5 w-3.5" />
                      Terkirim ke Satu Sehat
                    </span>
                    <span
                      className="max-w-56 truncate font-mono text-[10px] text-slate-400"
                      title={enc.satuSehatId ?? undefined}
                    >
                      {enc.satuSehatId}
                    </span>
                  </div>
                ) : encWaiting ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700 ring-1 ring-orange-200"
                    title="Encounter belum bisa dikirim: Patient belum ada di Satu Sehat"
                  >
                    <LuUserRoundX className="h-3.5 w-3.5" />
                    Menunggu Patient
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">
                    <LuClock className="h-3.5 w-3.5" />
                    Belum dikirim
                  </span>
                )}
              </div>
            </div>

            {/* Baris statistik total + progress terkirim */}
            <div className="border-t border-slate-100 px-5 py-3">
              <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                <div className="px-3">
                  <p className="text-lg font-bold text-slate-800">{fmt(totalItems)}</p>
                  <p className="text-[11px] text-slate-400">Total resource</p>
                </div>
                <div className="px-3">
                  <p className="text-lg font-bold text-emerald-600">{fmt(totalSent)}</p>
                  <p className="text-[11px] text-slate-400">Terkirim</p>
                </div>
                <div className="px-3">
                  <p className="text-lg font-bold text-amber-600">{fmt(belumTotal)}</p>
                  <p className="text-[11px] text-slate-400">Belum</p>
                </div>
              </div>
              {totalItems > 0 && (
                <div
                  className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={Math.round((totalSent / totalItems) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Progres pengiriman"
                >
                  <div
                    className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500 transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${(totalSent / totalItems) * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── Toolbar filter interaktif ── */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Toggle
                active={onlyUnsent}
                onClick={() => setOnlyUnsent((v) => !v)}
                icon={<LuListFilter className="h-3.5 w-3.5" />}
                tone="amber"
              >
                Hanya belum terkirim
              </Toggle>
              <Toggle
                active={hideEmpty}
                onClick={() => setHideEmpty((v) => !v)}
                icon={<LuEyeOff className="h-3.5 w-3.5" />}
              >
                Sembunyikan kosong
              </Toggle>
              <span className="mx-1 h-4 w-px bg-slate-200" />
              <button
                type="button"
                onClick={expandAll}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none"
              >
                <LuChevronsUpDown className="h-3.5 w-3.5" />
                Buka semua
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none"
              >
                <LuChevronsDownUp className="h-3.5 w-3.5" />
                Tutup semua
              </button>
            </div>
            <p className="text-xs text-slate-400">
              <span className="font-semibold text-slate-600">{fmt(withData)}</span>/
              {fmt(groups.length)} berisi
              {belumTotal > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-amber-600">
                    {fmt(belumTotal)} belum
                  </span>
                </>
              )}
            </p>
          </div>

          {/* ── Strip navigasi resource (dikelompokkan per famili) ── */}
          <nav
            aria-label="Navigasi resource"
            className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            {families.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Tidak ada resource yang cocok dengan filter.
              </p>
            ) : (
              families.map((fam) => (
                <div key={fam.family} className="space-y-1.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {fam.family}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {fam.groups.map((g) => {
                      const ac = accentOf(g.accent);
                      const has = g.total > 0;
                      const belum = g.total - g.sent;
                      const pct = has ? Math.round((g.sent / g.total) * 100) : 0;
                      const active = activeKey === g.key;
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => scrollToGroup(g.key)}
                          aria-current={active ? "true" : undefined}
                          className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transform-none motion-reduce:transition-none ${
                            active
                              ? "border-slate-300 bg-slate-50 ring-1 ring-slate-200"
                              : has
                                ? "border-slate-100 bg-white hover:border-slate-200"
                                : "border-slate-100 bg-slate-50/60"
                          }`}
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${
                              has ? ac.icon : "bg-slate-100 text-slate-300 grayscale"
                            }`}
                          >
                            {g.icon}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-xs font-semibold ${has ? "text-slate-700" : "text-slate-400"}`}
                            >
                              {g.label}
                            </p>
                            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${ac.bar}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end">
                            <span
                              className={`text-sm font-bold tabular-nums ${has ? "text-slate-700" : "text-slate-300"}`}
                            >
                              {fmt(g.total)}
                            </span>
                            {belum > 0 && (
                              <span className="text-[9px] font-bold text-amber-500">
                                {fmt(belum)} belum
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </nav>

          {/* ── Seksi rincian per resource (dikelompokkan per famili) ── */}
          <div className="space-y-6">
            {families.map((fam) => (
              <div key={fam.family} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-bold text-slate-700">{fam.family}</h2>
                  <div className="h-px flex-1 bg-slate-100" />
                </div>

                {fam.groups.map((g) => {
                  const ac = accentOf(g.accent);
                  const has = g.total > 0;
                  const belum = g.total - g.sent;
                  const open = !collapsed.has(g.key);
                  const shownItems = onlyUnsent
                    ? g.items.filter((i) => !i.sent)
                    : g.items;
                  return (
                    <section
                      key={g.key}
                      id={`res-${g.key}`}
                      data-res={g.key}
                      className={`scroll-mt-4 overflow-hidden rounded-2xl border shadow-sm transition-colors motion-reduce:transition-none ${
                        activeKey === g.key ? "border-slate-300" : "border-slate-100"
                      } ${has ? "bg-white" : "bg-slate-50/40"}`}
                    >
                      {/* Header (klik = lipat/buka) */}
                      <button
                        type="button"
                        onClick={() => toggleCollapse(g.key)}
                        aria-expanded={open}
                        className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/50 motion-reduce:transition-none"
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
                            has ? ac.icon : "bg-slate-100 text-slate-300 grayscale"
                          }`}
                        >
                          {g.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
                            {g.label}
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
                              {g.resourceType}
                            </span>
                          </p>
                        </div>

                        {/* Badge ringkas: total, terkirim, belum (highlight) */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {g.sent > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100">
                              <LuCircleCheck className="h-3 w-3" />
                              {fmt(g.sent)}
                            </span>
                          )}
                          {belum > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                              <LuClock className="h-3 w-3" />
                              {fmt(belum)}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              has ? `${ac.soft} ${ac.text}` : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {fmt(g.total)}
                          </span>
                          <LuChevronDown
                            className={`h-4 w-4 text-slate-400 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {/* Body (lipat halus via grid-rows) */}
                      <div
                        className={`grid border-t border-slate-100 transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] border-transparent"
                        }`}
                      >
                        <div className="overflow-hidden">
                          {has ? (
                            <ul className="divide-y divide-slate-50">
                              {shownItems.map((it, idx) => (
                                <li
                                  key={idx}
                                  className="relative flex items-start justify-between gap-3 py-3 pr-5 pl-6 transition-colors hover:bg-slate-50/60 motion-reduce:transition-none"
                                >
                                  {/* Aksen kiri: hijau=terkirim, abu=belum (audit scan) */}
                                  <span
                                    className={`absolute top-3 bottom-3 left-3 w-1 rounded-full ${it.sent ? "bg-emerald-400" : "bg-slate-200"}`}
                                    aria-hidden="true"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="wrap-break-word text-sm font-semibold text-slate-800">
                                      {it.primary ?? (
                                        <span className="text-slate-300">
                                          (tanpa deskripsi)
                                        </span>
                                      )}
                                    </p>
                                    {it.meta.length > 0 && (
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {it.meta.map((m, mi) => (
                                          <MetaChip key={mi} m={m} />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="shrink-0 pt-0.5">
                                    {it.sent ? (
                                      <span
                                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-100"
                                        title={it.satuSehatId ?? undefined}
                                      >
                                        <LuCircleCheck className="h-3 w-3" />
                                        Terkirim
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                                        <LuClock className="h-3 w-3" />
                                        Belum
                                      </span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="px-5 py-4 text-xs text-slate-400">
                              Tidak ada data untuk kunjungan ini.
                            </p>
                          )}

                          {g.truncated && (
                            <p className="border-t border-slate-100 px-5 py-2 text-[11px] text-slate-400">
                              Menampilkan 200 item pertama.
                            </p>
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
