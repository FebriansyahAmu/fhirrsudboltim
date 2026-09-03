"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LuBedSingle,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuCirclePlus,
  LuCircleCheck,
  LuRefreshCw,
  LuTriangleAlert,
  LuArrowRight,
  LuSearch,
  LuX,
  LuListChecks,
} from "react-icons/lu";

interface Row {
  refId: string;
  classCode: string;
  patientName: string | null;
  tanggal: string | null;
  originRefId: string | null;
}
interface ListResp {
  rows: Row[];
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

const CLASS_STYLE: Record<string, string> = {
  IMP: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  EMER: "bg-rose-50 text-rose-700 ring-rose-200",
  AMB: "bg-blue-50 text-blue-700 ring-blue-200",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function MissingRanapEncounters() {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "ok" | "err">>({});
  const [keyInput, setKeyInput] = useState(""); // teks di kotak cari
  const [keyQuery, setKeyQuery] = useState(""); // kata kunci diterapkan

  // ── Antrian buat Encounter (batch, berurutan) ──
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueArmed, setQueueArmed] = useState(false);
  const [queueProgress, setQueueProgress] = useState<{ done: number; total: number } | null>(null);
  const [queueSummary, setQueueSummary] = useState<{ ok: number; fail: number; total: number } | null>(null);
  const queueStopRef = useRef(false);

  const load = useCallback(async (p: number, kq: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ihs/missing-encounter?page=${p}${kq ? `&key=${encodeURIComponent(kq)}` : ""}`,
        { cache: "no-store" },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal memuat");
      setData(j as ListResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load(page, keyQuery);
  }, [open, page, keyQuery, load]);

  const applyKeySearch = () => {
    setPage(1);
    setKeyQuery(keyInput.trim());
  };
  const clearKeySearch = () => {
    setKeyInput("");
    setPage(1);
    setKeyQuery("");
  };

  // Buat satu Encounter (dipakai tombol per baris & antrian). Return sukses.
  const createOne = useCallback(async (refId: string): Promise<boolean> => {
    setCreating(refId);
    try {
      const res = await fetch(`/api/ihs/missing-encounter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Gagal");
      setDone((d) => ({ ...d, [refId]: "ok" }));
      return true;
    } catch {
      setDone((d) => ({ ...d, [refId]: "err" }));
      return false;
    } finally {
      setCreating(null);
    }
  }, []);

  const create = (refId: string) => {
    void createOne(refId);
  };

  const stopQueue = useCallback(() => {
    queueStopRef.current = true;
  }, []);

  // Antrian: buat Encounter untuk SEMUA baris halaman ini yang belum dibuat,
  // berurutan (jeda kecil, ramah beban). Bisa dihentikan; muat ulang di akhir.
  const runQueue = useCallback(async () => {
    if (!data || queueRunning) return;
    const eligible = data.rows.filter((r) => done[r.refId] !== "ok");
    if (eligible.length === 0) return;

    queueStopRef.current = false;
    setQueueArmed(false);
    setQueueRunning(true);
    setQueueSummary(null);
    setQueueProgress({ done: 0, total: eligible.length });

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < eligible.length; i++) {
      if (queueStopRef.current) break;
      const success = await createOne(eligible[i].refId);
      if (success) ok++;
      else fail++;
      setQueueProgress({ done: i + 1, total: eligible.length });
      await new Promise((res) => setTimeout(res, 250)); // pacing
    }

    setQueueSummary({ ok, fail, total: eligible.length });
    setQueueRunning(false);
    setQueueProgress(null);
    // Baris yang sukses kini punya Encounter → hilang dari daftar saat dimuat ulang.
    await load(page, keyQuery);
  }, [data, queueRunning, done, createOne, load, page, keyQuery]);

  // Reset kontrol antrian saat pindah halaman / pencarian.
  useEffect(() => {
    setQueueArmed(false);
    setQueueSummary(null);
  }, [page, keyQuery]);

  const total = data?.total ?? 0;
  const eligibleCount = (data?.rows ?? []).filter(
    (r) => done[r.refId] !== "ok",
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-amber-50/40"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <LuBedSingle className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            Rawat Inap tanpa Encounter
            {total > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                {total}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Pendaftaran (mis. IGD→ranap) yang di-skip ETL SIMGOS — buat Encounter
            IMP-nya di sini
          </p>
        </div>
        <LuChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* Kotak cari No. Pendaftaran */}
          <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
            <div className="relative w-full max-w-xs">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyInput}
                inputMode="numeric"
                onChange={(e) =>
                  setKeyInput(e.target.value.replace(/[^0-9]/g, ""))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyKeySearch();
                }}
                placeholder="Cari No. Pendaftaran…"
                aria-label="Cari No. Pendaftaran"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-8 text-xs text-slate-700 placeholder-slate-300 transition-all focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
              />
              {keyInput && (
                <button
                  type="button"
                  onClick={clearKeySearch}
                  aria-label="Hapus pencarian"
                  className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <LuX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={applyKeySearch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700"
            >
              <LuSearch className="h-3.5 w-3.5" />
              Cari
            </button>
            {keyQuery && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                Hasil untuk{" "}
                <span className="font-mono font-semibold text-slate-700">
                  {keyQuery}
                </span>
                <button
                  type="button"
                  onClick={clearKeySearch}
                  className="rounded px-1 text-teal-600 hover:underline"
                >
                  reset
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-2.5">
            <span className="text-[11px] text-slate-400">
              {loading ? "Memuat…" : `${total} pendaftaran`}
            </span>
            <div className="flex items-center gap-2">
              {/* Antrian buat Encounter */}
              {queueRunning ? (
                <div className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                    Membuat…{" "}
                    {queueProgress
                      ? `${queueProgress.done}/${queueProgress.total}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={stopQueue}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <LuX className="h-3.5 w-3.5" />
                    Stop
                  </button>
                </div>
              ) : queueArmed ? (
                <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 ring-1 ring-amber-200">
                  <span className="pl-1 text-[11px] font-semibold text-amber-800">
                    Buat {eligibleCount} Encounter?
                  </span>
                  <button
                    type="button"
                    onClick={runQueue}
                    className="rounded-md bg-teal-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-teal-700"
                  >
                    Ya, buat
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueArmed(false)}
                    className="rounded-md px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                eligibleCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setQueueArmed(true)}
                    disabled={loading}
                    title="Buat Encounter untuk semua pendaftaran di halaman ini"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                  >
                    <LuListChecks className="h-3.5 w-3.5" />
                    Buat Antrian
                    <span className="rounded-full bg-teal-500/40 px-1.5 py-0.5 text-[10px] tabular-nums">
                      {eligibleCount}
                    </span>
                  </button>
                )
              )}
              {/* Muat ulang */}
              <button
                type="button"
                onClick={() => load(page, keyQuery)}
                disabled={loading || queueRunning}
                aria-label="Muat ulang"
                className={`grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 ${loading ? "animate-spin" : ""}`}
              >
                <LuRefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Ringkasan antrian */}
          {queueSummary && !queueRunning && (
            <div className="px-5 pb-1">
              <div
                className={`rounded-xl border px-4 py-2.5 text-xs ${
                  queueSummary.fail > 0
                    ? "border-amber-100 bg-amber-50/60"
                    : "border-emerald-100 bg-emerald-50/60"
                }`}
              >
                <span className="font-bold text-slate-700">Antrian selesai.</span>{" "}
                <span className="font-semibold text-emerald-700">
                  {queueSummary.ok} dibuat
                </span>
                {queueSummary.fail > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-amber-700">
                      {queueSummary.fail} gagal
                    </span>
                  </>
                )}{" "}
                <span className="text-slate-500">
                  dari {queueSummary.total} baris.
                </span>
              </div>
            </div>
          )}

          {error ? (
            <div className="mx-5 mb-4 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <LuTriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : !loading && total === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-500">
                <LuCircleCheck className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-500">
                {keyQuery
                  ? `Tidak ada pendaftaran cocok "${keyQuery}"`
                  : "Semua pendaftaran sudah punya Encounter"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/50 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-2.5 font-semibold">No. Pendaftaran</th>
                    <th className="px-4 py-2.5 font-semibold">Kelas</th>
                    <th className="px-4 py-2.5 font-semibold">Pasien</th>
                    <th className="px-4 py-2.5 font-semibold">Masuk</th>
                    <th className="px-4 py-2.5 font-semibold">Dari</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(data?.rows ?? []).map((r) => {
                    const st = done[r.refId];
                    return (
                      <tr key={r.refId} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-2.5 font-mono text-xs text-slate-600">
                          {r.refId}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                              CLASS_STYLE[r.classCode] ?? "bg-slate-100 text-slate-500 ring-slate-200"
                            }`}
                          >
                            {r.classCode}
                          </span>
                        </td>
                        <td className="max-w-48 truncate px-4 py-2.5 text-slate-700">
                          {r.patientName ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-slate-500">
                          {fmtDate(r.tanggal)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-400">
                          {r.originRefId ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {st === "ok" ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                              <LuCircleCheck className="h-3.5 w-3.5" />
                              Dibuat
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => create(r.refId)}
                              disabled={creating === r.refId || queueRunning}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
                            >
                              <LuCirclePlus className="h-3.5 w-3.5" />
                              {creating === r.refId
                                ? "Membuat…"
                                : st === "err"
                                  ? "Coba lagi"
                                  : "Buat Encounter"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Info + pagination */}
          <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <LuArrowRight className="h-3.5 w-3.5 shrink-0" />
              Setelah dibuat, muat ulang panel di bawah lalu kirim Encounter-nya.
            </p>
            {data && data.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading || queueRunning}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                >
                  <LuChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {data.page} / {data.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= data.totalPages || loading || queueRunning}
                  onClick={() => setPage((p) => p + 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40"
                >
                  <LuChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
