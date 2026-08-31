"use client";

import { useCallback, useEffect, useState } from "react";
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

// Token warna aksen → kelas Tailwind (string literal utuh agar ter-scan JIT).
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

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

const STATUS_LABEL: Record<string, string> = {
  planned: "Direncanakan",
  arrived: "Tiba",
  triaged: "Triase",
  "in-progress": "Berlangsung",
  onleave: "Cuti",
  finished: "Selesai",
  cancelled: "Dibatalkan",
};

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

export default function EncounterDetailView({ refId }: { refId: string }) {
  const [data, setData] = useState<EncounterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const scrollToGroup = (key: string) => {
    document
      .getElementById(`res-${key}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const enc = data?.encounter;
  const groups = data?.groups ?? [];
  const totalItems = groups.reduce((s, g) => s + g.total, 0);
  const totalSent = groups.reduce((s, g) => s + g.sent, 0);
  const withData = groups.filter((g) => g.total > 0).length;
  const families = byFamily(groups);

  // encounter belum terkirim & tak punya referensi pasien → menunggu Patient
  const encWaiting = !!enc && !enc.sent && !enc.patientRef;

  return (
    <div className="space-y-5">
      {/* Toolbar atas */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/encounter"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
        >
          <LuArrowLeft className="h-3.5 w-3.5" />
          Kembali ke Encounter
        </Link>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          <LuRefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
          <div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
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
                  <p className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <LuUser className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{enc.patient ?? "Pasien —"}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    No. Pendaftaran · {enc.refId}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {enc.className && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                        <LuActivity className="h-3 w-3" />
                        {enc.className}
                        {enc.classCode ? ` · ${enc.classCode}` : ""}
                      </span>
                    )}
                    {enc.status && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {STATUS_LABEL[enc.status] ?? enc.status}
                      </span>
                    )}
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

            {/* Baris statistik total */}
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 text-center">
              <div className="px-3 py-3">
                <p className="text-lg font-bold text-slate-800">{fmt(totalItems)}</p>
                <p className="text-[11px] text-slate-400">Total resource</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-bold text-emerald-600">{fmt(totalSent)}</p>
                <p className="text-[11px] text-slate-400">Terkirim</p>
              </div>
              <div className="px-3 py-3">
                <p className="text-lg font-bold text-amber-600">
                  {fmt(totalItems - totalSent)}
                </p>
                <p className="text-[11px] text-slate-400">Belum</p>
              </div>
            </div>
          </div>

          <>
              {/* ── Strip navigasi resource (dikelompokkan per famili) ── */}
              <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold text-slate-400">
                  Navigasi cepat · {fmt(withData)}/{fmt(groups.length)} jenis berisi
                </p>
                {families.map((fam) => (
                  <div key={fam.family} className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      {fam.family}
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                      {fam.groups.map((g) => {
                        const ac = accentOf(g.accent);
                        const has = g.total > 0;
                        const pct = has ? Math.round((g.sent / g.total) * 100) : 0;
                        return (
                          <button
                            key={g.key}
                            type="button"
                            onClick={() => scrollToGroup(g.key)}
                            className={`group flex items-center gap-2 rounded-xl border border-slate-100 px-2.5 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-sm ${
                              has ? "bg-white" : "bg-slate-50/60"
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
                                className={`truncate text-xs font-semibold ${
                                  has ? "text-slate-700" : "text-slate-400"
                                }`}
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
                            <span
                              className={`shrink-0 text-sm font-bold tabular-nums ${
                                has ? "text-slate-700" : "text-slate-300"
                              }`}
                            >
                              {fmt(g.total)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Seksi rincian per resource (dikelompokkan per famili) ── */}
              <div className="space-y-6">
                {families.map((fam) => (
                  <div key={fam.family} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-sm font-bold text-slate-700">
                        {fam.family}
                      </h2>
                      <div className="h-px flex-1 bg-slate-100" />
                    </div>

                    {fam.groups.map((g) => {
                      const ac = accentOf(g.accent);
                      const has = g.total > 0;
                      return (
                        <section
                          key={g.key}
                          id={`res-${g.key}`}
                          className={`scroll-mt-4 overflow-hidden rounded-2xl border border-slate-100 shadow-sm ${
                            has ? "bg-white" : "bg-slate-50/40"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3.5">
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
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                {fmt(g.total)} item · {fmt(g.sent)} terkirim ·{" "}
                                {fmt(g.total - g.sent)} belum
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                has ? `${ac.soft} ${ac.text}` : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {fmt(g.total)}
                            </span>
                          </div>

                          {has ? (
                          <ul className="divide-y divide-slate-50">
                            {g.items.map((it, idx) => (
                              <li
                                key={idx}
                                className="flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-slate-50/60"
                              >
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
                                        <span
                                          key={mi}
                                          className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-0.5 text-[11px] ring-1 ring-slate-100"
                                        >
                                          <span className="text-slate-400">
                                            {m.label}:
                                          </span>
                                          <span
                                            className={
                                              m.type === "code"
                                                ? "font-mono text-slate-600"
                                                : "text-slate-700"
                                            }
                                          >
                                            {m.value}
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="shrink-0 pt-0.5">
                                  {it.sent ? (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"
                                      title={it.satuSehatId ?? undefined}
                                    >
                                      <LuCircleCheck className="h-3 w-3" />
                                      Terkirim
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
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
                        </section>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
        </>
      )}
    </div>
  );
}
