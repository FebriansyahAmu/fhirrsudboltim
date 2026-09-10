"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  LuSearch,
  LuX,
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuFileSearch,
  LuStethoscope,
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
  { icon: string; bar: string; text: string; soft: string; spine: string }
> = {
  rose: { icon: "bg-rose-50 text-rose-600", bar: "bg-rose-500", text: "text-rose-700", soft: "bg-rose-50", spine: "bg-rose-400" },
  pink: { icon: "bg-pink-50 text-pink-600", bar: "bg-pink-500", text: "text-pink-700", soft: "bg-pink-50", spine: "bg-pink-400" },
  orange: { icon: "bg-orange-50 text-orange-600", bar: "bg-orange-500", text: "text-orange-700", soft: "bg-orange-50", spine: "bg-orange-400" },
  amber: { icon: "bg-amber-50 text-amber-600", bar: "bg-amber-500", text: "text-amber-700", soft: "bg-amber-50", spine: "bg-amber-400" },
  lime: { icon: "bg-lime-50 text-lime-600", bar: "bg-lime-500", text: "text-lime-700", soft: "bg-lime-50", spine: "bg-lime-400" },
  emerald: { icon: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-50", spine: "bg-emerald-400" },
  teal: { icon: "bg-teal-50 text-teal-600", bar: "bg-teal-500", text: "text-teal-700", soft: "bg-teal-50", spine: "bg-teal-400" },
  cyan: { icon: "bg-cyan-50 text-cyan-600", bar: "bg-cyan-500", text: "text-cyan-700", soft: "bg-cyan-50", spine: "bg-cyan-400" },
  sky: { icon: "bg-sky-50 text-sky-600", bar: "bg-sky-500", text: "text-sky-700", soft: "bg-sky-50", spine: "bg-sky-400" },
  blue: { icon: "bg-blue-50 text-blue-600", bar: "bg-blue-500", text: "text-blue-700", soft: "bg-blue-50", spine: "bg-blue-400" },
  indigo: { icon: "bg-indigo-50 text-indigo-600", bar: "bg-indigo-500", text: "text-indigo-700", soft: "bg-indigo-50", spine: "bg-indigo-400" },
  violet: { icon: "bg-violet-50 text-violet-600", bar: "bg-violet-500", text: "text-violet-700", soft: "bg-violet-50", spine: "bg-violet-400" },
  fuchsia: { icon: "bg-fuchsia-50 text-fuchsia-600", bar: "bg-fuchsia-500", text: "text-fuchsia-700", soft: "bg-fuchsia-50", spine: "bg-fuchsia-400" },
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
  EMER: "bg-rose-100 text-rose-700",
  IMP: "bg-indigo-100 text-indigo-700",
  ACUTE: "bg-indigo-100 text-indigo-700",
  AMB: "bg-sky-100 text-sky-700",
  HH: "bg-teal-100 text-teal-700",
  VR: "bg-cyan-100 text-cyan-700",
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
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// Kelompokkan groups per `family`, mempertahankan urutan kemunculan.
function byFamily<T extends { g: DetailGroup }>(
  rows: T[],
): { family: string; rows: T[] }[] {
  const order: string[] = [];
  const map: Record<string, T[]> = {};
  for (const r of rows) {
    if (!map[r.g.family]) {
      map[r.g.family] = [];
      order.push(r.g.family);
    }
    map[r.g.family].push(r);
  }
  return order.map((family) => ({ family, rows: map[family] }));
}

function itemMatches(it: DetailItem, q: string): boolean {
  if (!q) return true;
  const hay = [it.primary ?? "", ...it.meta.map((m) => `${m.label} ${m.value}`)]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

// ── Sub-komponen kecil ──────────────────────────────────────
/** Cincin progres (donut SVG) — dipakai untuk ringkasan keseluruhan. */
function Ring({
  pct,
  size = 56,
  stroke = 5,
}: {
  pct: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, pct)) / 100) * c;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`Progres ${pct}%`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-slate-100"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        className="stroke-emerald-500 transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

function MetaChip({ m }: { m: DetailMeta }) {
  const tone = m.type === "code" ? toneFor(m.value) : null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] ring-1 ring-slate-100">
      <span className="shrink-0 text-slate-400">{m.label}</span>
      {tone ? (
        <span
          className={`rounded px-1 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ${TONE[tone]}`}
        >
          {m.value}
        </span>
      ) : (
        <span
          className={`truncate ${m.type === "code" ? "font-mono text-slate-600" : "text-slate-700"}`}
          title={m.value}
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
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none ${
        active ? on : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

const ITEM_CAP = 5; // item ditampilkan per kartu sebelum "lihat lainnya"

export default function EncounterDetailView({ refId }: { refId: string }) {
  const [data, setData] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kontrol interaktif
  const [hideEmpty, setHideEmpty] = useState(true);
  const [onlyUnsent, setOnlyUnsent] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [activeFamily, setActiveFamily] = useState<string | null>(null);
  const railNavRef = useRef<HTMLElement | null>(null);

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
  const pctSent = totalItems > 0 ? Math.round((totalSent / totalItems) * 100) : 0;

  // Terapkan filter + pencarian → daftar group yang tampil (dengan item terfilter).
  const prepared = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => {
        let items = g.items;
        if (onlyUnsent) items = items.filter((i) => !i.sent);
        if (q) items = items.filter((i) => itemMatches(i, q));
        let show = true;
        if (hideEmpty && g.total === 0) show = false;
        if (onlyUnsent && g.total - g.sent === 0) show = false;
        if (q && items.length === 0) show = false;
        return { g, items, show };
      })
      .filter((x) => x.show);
  }, [groups, onlyUnsent, hideEmpty, query]);

  const families = useMemo(() => {
    // Dalam tiap famili: kartu berisi dulu, kartu kosong di belakang (urutan
    // spesifikasi dipertahankan untuk yang setara — sort JS stabil). Tinggi
    // kartu beragam diseimbangkan oleh layout kolom (masonry) di bawah.
    return byFamily(prepared).map((fam) => ({
      family: fam.family,
      rows: [...fam.rows].sort(
        (a, b) => (a.g.total === 0 ? 1 : 0) - (b.g.total === 0 ? 1 : 0),
      ),
    }));
  }, [prepared]);

  // Statistik per famili (untuk rail navigasi).
  const familyStats = useMemo(
    () =>
      families.map((fam) => {
        const total = fam.rows.reduce((s, r) => s + r.g.total, 0);
        const sent = fam.rows.reduce((s, r) => s + r.g.sent, 0);
        return {
          family: fam.family,
          slug: slugify(fam.family),
          total,
          belum: total - sent,
          groups: fam.rows.length,
        };
      }),
    [families],
  );

  // Scroll-spy: sorot famili yang sedang terlihat.
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("section[data-fam]"),
    );
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveFamily(vis[0].target.getAttribute("data-fam"));
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [families]);

  // Jaga tombol famili aktif tetap terlihat di dalam rail yang bisa scroll.
  useEffect(() => {
    if (!activeFamily) return;
    const btn = railNavRef.current?.querySelector<HTMLElement>(
      `[data-fnav="${activeFamily}"]`,
    );
    btn?.scrollIntoView({ block: "nearest" });
  }, [activeFamily]);

  const scrollToFamily = (slug: string) =>
    document
      .getElementById(`fam-${slug}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const toggleCollapse = (key: string) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const toggleItems = (key: string) =>
    setExpandedItems((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () =>
    setCollapsed(new Set(prepared.map((x) => x.g.key)));

  const encWaiting = !!enc && !enc.sent && !enc.patientRef;
  const anyFilter = onlyUnsent || hideEmpty || query.trim() !== "";
  const resetFilters = () => {
    setOnlyUnsent(false);
    setHideEmpty(false);
    setQuery("");
  };

  return (
    <div className="space-y-4">
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
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="h-52 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
            <div className="h-64 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      )}

      {/* Encounter tidak ditemukan */}
      {data && enc && !enc.found && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <LuFileSearch className="h-7 w-7" />
          </div>
          <p className="text-sm font-bold text-slate-700">
            Encounter tidak ditemukan
          </p>
          <p className="max-w-sm text-xs text-slate-400">
            Tidak ada kunjungan dengan No. Pendaftaran{" "}
            <span className="font-mono text-slate-600">{enc.refId}</span> di SIMGOS.
          </p>
        </div>
      )}

      {enc && enc.found && (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ══ RAIL KIRI: identitas pasien + filter + navigasi famili ══ */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
            {/* Kartu identitas pasien (rekam medis) */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
              <div className="relative bg-linear-to-br from-blue-50 via-white to-cyan-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-200 bg-white text-blue-500 shadow-sm">
                    <LuUser className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Rekam Medis Kunjungan
                    </p>
                    <h1 className="truncate text-base font-bold text-slate-900">
                      {enc.patient ?? "Pasien —"}
                    </h1>
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {enc.refId}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {enc.className && (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${classTone(enc.classCode)}`}
                    >
                      <LuActivity className="h-3 w-3" />
                      {enc.className}
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
                </div>

                {(enc.start || enc.end) && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                    <LuCalendarClock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="min-w-0 truncate">
                      {enc.start ?? "—"}
                      {enc.end ? ` – ${enc.end}` : ""}
                    </span>
                  </p>
                )}
              </div>

              {/* Status kirim + progres keseluruhan */}
              <div className="flex items-center gap-4 border-t border-slate-100 p-4">
                <div className="relative shrink-0">
                  <Ring pct={pctSent} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-slate-700">
                    {pctSent}%
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-emerald-600 tabular-nums">
                      {fmt(totalSent)}
                    </span>
                    <span className="text-xs text-slate-400">
                      / {fmt(totalItems)} terkirim
                    </span>
                  </div>
                  {belumTotal > 0 ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <LuClock className="h-3 w-3" />
                      {fmt(belumTotal)} belum dikirim
                    </p>
                  ) : totalItems > 0 ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                      <LuCircleCheck className="h-3 w-3" />
                      Lengkap terkirim
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Belum ada resource
                    </p>
                  )}
                  <div className="mt-2">
                    {enc.sent ? (
                      <span
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
                        title={enc.satuSehatId ?? undefined}
                      >
                        <LuCircleCheck className="h-3 w-3 shrink-0" />
                        <span className="truncate">Encounter terkirim</span>
                      </span>
                    ) : encWaiting ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700 ring-1 ring-orange-200">
                        <LuUserRoundX className="h-3 w-3" />
                        Menunggu Patient
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                        <LuClock className="h-3 w-3" />
                        Encounter belum dikirim
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Kontrol: cari + filter */}
            <div className="space-y-2.5 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm">
              <div className="relative">
                <LuSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari di rekam medis…"
                  aria-label="Cari resource"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50/60 py-1.5 pl-8 pr-8 text-xs text-slate-700 placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40 motion-reduce:transition-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Bersihkan pencarian"
                    className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <LuX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Toggle
                  active={onlyUnsent}
                  onClick={() => setOnlyUnsent((v) => !v)}
                  icon={<LuListFilter className="h-3.5 w-3.5" />}
                  tone="amber"
                >
                  Belum terkirim
                </Toggle>
                <Toggle
                  active={hideEmpty}
                  onClick={() => setHideEmpty((v) => !v)}
                  icon={<LuEyeOff className="h-3.5 w-3.5" />}
                >
                  Sembunyikan kosong
                </Toggle>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none"
                  >
                    <LuChevronsUpDown className="h-3.5 w-3.5" />
                    Buka
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none"
                  >
                    <LuChevronsDownUp className="h-3.5 w-3.5" />
                    Tutup
                  </button>
                </div>
                {anyFilter && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-teal-600 transition-colors hover:bg-teal-50"
                  >
                    <LuX className="h-3.5 w-3.5" />
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Navigasi famili (chart index) */}
            <nav
              ref={railNavRef}
              aria-label="Navigasi rekam medis"
              className="rounded-2xl border border-slate-200/70 bg-white p-2 shadow-sm"
            >
              <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Bagian ({familyStats.length})
              </p>
              {familyStats.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-slate-400">
                  Tidak ada bagian yang cocok.
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {familyStats.map((f) => {
                    const active = activeFamily === f.family;
                    return (
                      <li key={f.slug}>
                        <button
                          type="button"
                          data-fnav={f.family}
                          onClick={() => scrollToFamily(f.slug)}
                          aria-current={active ? "true" : undefined}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/50 motion-reduce:transition-none ${
                            active
                              ? "bg-slate-800 font-semibold text-white"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-teal-300" : "bg-slate-300"}`}
                          />
                          <span className="min-w-0 flex-1 truncate">{f.family}</span>
                          {f.belum > 0 && (
                            <span
                              className={`shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                                active
                                  ? "bg-amber-400/90 text-amber-950"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {fmt(f.belum)}
                            </span>
                          )}
                          <span
                            className={`shrink-0 text-[10px] font-bold tabular-nums ${active ? "text-slate-300" : "text-slate-400"}`}
                          >
                            {fmt(f.total)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </nav>
          </aside>

          {/* ══ KOLOM KANAN: rekam medis dalam kartu multi-kolom ══ */}
          <main className="min-w-0 space-y-6">
            {families.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                  <LuStethoscope className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-600">
                  {query.trim()
                    ? "Tidak ada hasil untuk pencarian ini"
                    : "Tidak ada resource yang cocok dengan filter"}
                </p>
                {anyFilter && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
                  >
                    <LuX className="h-3.5 w-3.5" />
                    Bersihkan filter
                  </button>
                )}
              </div>
            ) : (
              families.map((fam) => {
                const stat = familyStats.find((f) => f.family === fam.family);
                return (
                  <section
                    key={fam.family}
                    id={`fam-${slugify(fam.family)}`}
                    data-fam={fam.family}
                    className="scroll-mt-4 space-y-3"
                  >
                    {/* Kepala famili */}
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-bold text-slate-700">
                        {fam.family}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500 tabular-nums">
                        {fmt(stat?.total ?? 0)}
                      </span>
                      {stat && stat.belum > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-100">
                          <LuClock className="h-3 w-3" />
                          {fmt(stat.belum)} belum
                        </span>
                      )}
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    {/* Kartu resource → kolom masonry (tinggi kartu beragam
                        diseimbangkan otomatis → tanpa celah/berantakan) */}
                    <div className="columns-1 gap-3 md:columns-2 2xl:columns-3">
                      {fam.rows.map(({ g, items }) => {
                        const ac = accentOf(g.accent);
                        const has = g.total > 0;
                        const belum = g.total - g.sent;
                        const pct = has ? Math.round((g.sent / g.total) * 100) : 0;
                        const open = !collapsed.has(g.key);
                        const showAll = expandedItems.has(g.key);
                        const visible = showAll ? items : items.slice(0, ITEM_CAP);
                        const hiddenCount = items.length - visible.length;
                        return (
                          <section
                            key={g.key}
                            data-res={g.key}
                            className={`relative mb-3 flex w-full break-inside-avoid flex-col overflow-hidden rounded-2xl border shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none ${
                              has ? "border-slate-200/70 bg-white" : "border-slate-100 bg-slate-50/40"
                            }`}
                          >
                            {/* Tulang punggung aksen (identitas resource) */}
                            <span
                              className={`absolute inset-y-0 left-0 w-1 ${has ? ac.spine : "bg-slate-200"}`}
                              aria-hidden="true"
                            />

                            {/* Header — klik untuk lipat/buka */}
                            <button
                              type="button"
                              onClick={() => toggleCollapse(g.key)}
                              aria-expanded={open}
                              className="flex w-full items-center gap-2.5 py-3 pl-4 pr-3 text-left transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/50 motion-reduce:transition-none"
                            >
                              <span
                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg ${
                                  has ? ac.icon : "bg-slate-100 text-slate-300 grayscale"
                                }`}
                              >
                                {g.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`truncate text-sm font-bold ${has ? "text-slate-800" : "text-slate-400"}`}
                                >
                                  {g.label}
                                </p>
                                <p className="truncate font-mono text-[10px] text-slate-400">
                                  {g.resourceType}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {belum > 0 && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-100">
                                    <LuClock className="h-2.5 w-2.5" />
                                    {fmt(belum)}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
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

                            {/* Bar progres tipis (terkirim) */}
                            {has && (
                              <div className="mx-4 mb-1 h-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${ac.bar} transition-[width] duration-500 motion-reduce:transition-none`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}

                            {/* Body — daftar item (lipat halus) */}
                            <div
                              className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="border-t border-slate-100">
                                  {has && items.length > 0 ? (
                                    <>
                                      <ul className="divide-y divide-slate-50">
                                        {visible.map((it, idx) => (
                                          <li
                                            key={idx}
                                            className="flex items-start gap-2.5 py-2.5 pl-4 pr-3 transition-colors hover:bg-slate-50/60 motion-reduce:transition-none"
                                          >
                                            <span
                                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${it.sent ? "bg-emerald-400 ring-2 ring-emerald-100" : "bg-slate-300 ring-2 ring-slate-100"}`}
                                              title={
                                                it.sent
                                                  ? (it.satuSehatId ?? "Terkirim")
                                                  : "Belum dikirim"
                                              }
                                              aria-hidden="true"
                                            />
                                            <div className="min-w-0 flex-1">
                                              <p className="wrap-break-word text-[13px] font-semibold leading-snug text-slate-800">
                                                {it.primary ?? (
                                                  <span className="font-normal text-slate-300">
                                                    (tanpa deskripsi)
                                                  </span>
                                                )}
                                              </p>
                                              {it.meta.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                  {it.meta.map((m, mi) => (
                                                    <MetaChip key={mi} m={m} />
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                            <span
                                              className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${it.sent ? "text-emerald-500" : "text-amber-400"}`}
                                              title={it.sent ? "Terkirim" : "Belum"}
                                            >
                                              {it.sent ? (
                                                <LuCircleCheck className="h-3.5 w-3.5" />
                                              ) : (
                                                <LuClock className="h-3.5 w-3.5" />
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                      </ul>

                                      {hiddenCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => toggleItems(g.key)}
                                          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/50"
                                        >
                                          <LuChevronDown className="h-3.5 w-3.5" />
                                          Lihat {fmt(hiddenCount)} lainnya
                                        </button>
                                      )}
                                      {showAll && items.length > ITEM_CAP && (
                                        <button
                                          type="button"
                                          onClick={() => toggleItems(g.key)}
                                          className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-400/50"
                                        >
                                          <LuChevronDown className="h-3.5 w-3.5 rotate-180" />
                                          Ringkas
                                        </button>
                                      )}
                                      {g.truncated && (
                                        <p className="border-t border-slate-100 px-4 py-1.5 text-[10px] text-slate-400">
                                          Menampilkan 200 item pertama.
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="px-4 py-3 pl-4 text-[11px] text-slate-400">
                                      {onlyUnsent && g.total > 0
                                        ? "Semua item sudah terkirim."
                                        : "Tidak ada data untuk kunjungan ini."}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}
          </main>
        </div>
      )}
    </div>
  );
}
