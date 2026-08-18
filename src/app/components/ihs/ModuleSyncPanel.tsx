"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LuChevronDown,
  LuDatabase,
  LuCircleCheck,
  LuClock,
  LuSend,
  LuRefreshCw,
  LuChevronLeft,
  LuChevronRight,
  LuTriangleAlert,
  LuShieldCheck,
  LuCode,
  LuCopy,
  LuCheck,
  LuX,
  LuWandSparkles,
} from "react-icons/lu";

type SyncFilter = "semua" | "terkirim" | "belum" | "siap";

interface Cell {
  label: string;
  value: string | null;
  type: string;
}
interface Row {
  key: string;
  sent: boolean;
  ready: boolean;
  satuSehatId: string | null;
  cells: Cell[];
}
interface SyncResponse {
  keyLabel: string;
  columns: { label: string; type: string }[];
  summary: { total: number; terkirim: number; belum: number; siap: number };
  filter: SyncFilter;
  page: number;
  totalRows: number;
  totalPages: number;
  rows: Row[];
}
interface PayloadResponse {
  resourceType: string;
  payload: unknown;
}

const FILTERS: { key: SyncFilter; label: string }[] = [
  { key: "semua", label: "Semua" },
  { key: "terkirim", label: "Sudah Terkirim" },
  { key: "belum", label: "Belum Dikirim" },
];

const PAGE_SIZE = 10;

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function cellClass(type: string): string {
  if (type === "nik" || type === "code") return "font-mono text-xs text-slate-500";
  if (type === "date") return "text-xs text-slate-400";
  return "text-slate-700";
}

export default function ModuleSyncPanel({
  module,
  title,
  defaultOpen = false,
  onUsePayload,
}: {
  module: string;
  title?: string;
  defaultOpen?: boolean;
  /** Dipanggil saat user menekan "Autofill ke form" pada modal payload. */
  onUsePayload?: (payload: unknown, resourceType: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<SyncFilter>("semua");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal payload
  const [payloadKey, setPayloadKey] = useState<string | null>(null);
  const [payloadData, setPayloadData] = useState<PayloadResponse | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(
    async (f: SyncFilter, p: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ihs/${module}?filter=${f}&page=${p}`, {
          credentials: "same-origin",
          signal,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal memuat data");
        setData(json as SyncResponse);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        setLoading(false);
      }
    },
    [module],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(filter, page, ctrl.signal);
    return () => ctrl.abort();
  }, [filter, page, load]);

  const openPayload = useCallback(
    async (key: string) => {
      setPayloadKey(key);
      setPayloadData(null);
      setPayloadError(null);
      setCopied(false);
      setPayloadLoading(true);
      try {
        const res = await fetch(
          `/api/ihs/${module}/${encodeURIComponent(key)}`,
          { credentials: "same-origin" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal memuat payload");
        setPayloadData(json as PayloadResponse);
      } catch (e) {
        setPayloadError(e instanceof Error ? e.message : "Gagal memuat payload");
      } finally {
        setPayloadLoading(false);
      }
    },
    [module],
  );

  const closePayload = useCallback(() => setPayloadKey(null), []);

  useEffect(() => {
    if (!payloadKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPayloadKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [payloadKey]);

  const changeFilter = (f: SyncFilter) => {
    setFilter(f);
    setPage(1);
  };

  const summary = data?.summary;
  const rangeStart =
    data && data.totalRows > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd =
    data && data.totalRows > 0 ? rangeStart + data.rows.length - 1 : 0;

  const countFor = (f: SyncFilter) =>
    !summary
      ? 0
      : f === "terkirim"
        ? summary.terkirim
        : f === "belum"
          ? summary.belum
          : summary.total;

  const colCount = (data?.columns.length ?? 4) + 3;

  const payloadJson = payloadData
    ? JSON.stringify(payloadData.payload, null, 2)
    : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payloadJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard tidak tersedia */
    }
  };

  const handleAutofill = () => {
    if (payloadData && onUsePayload) {
      onUsePayload(payloadData.payload, payloadData.resourceType);
      setPayloadKey(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {/* Header (selalu tampil) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-50/70"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-600">
          <LuDatabase className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
            {title ?? `Data ${module} di SIMGOS`}
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
              <LuShieldCheck className="h-3 w-3" />
              Read-only
            </span>
          </p>
          {summary ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <LuCircleCheck className="h-3.5 w-3.5" />
                {fmt(summary.terkirim)} terkirim
              </span>
              <span className="inline-flex items-center gap-1 text-amber-600">
                <LuClock className="h-3.5 w-3.5" />
                {fmt(summary.belum)} belum
              </span>
              <span className="text-slate-300">·</span>
              <span>{fmt(summary.total)} total</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-400">
              {loading ? "Memuat status…" : error ? "Gagal memuat" : "—"}
            </p>
          )}
        </div>
        <LuChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Body (saat terbuka) */}
      {open && (
        <div className="border-t border-slate-100">
          {error ? (
            <div className="flex items-start gap-3 p-5">
              <LuTriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-800">
                  Gagal membaca data SIMGOS
                </p>
                <p className="mt-1 wrap-break-word text-xs text-red-700">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => load(filter, page)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-700 ring-1 ring-red-200 transition-colors hover:bg-red-100"
                >
                  <LuRefreshCw className="h-3.5 w-3.5" />
                  Coba lagi
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Toolbar: filter + refresh */}
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                  {FILTERS.map((f) => {
                    const active = f.key === filter;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => changeFilter(f.key)}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                          active
                            ? "bg-white text-teal-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {f.label}
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                            active
                              ? "bg-teal-50 text-teal-700"
                              : "bg-slate-200/70 text-slate-500"
                          }`}
                        >
                          {fmt(countFor(f.key))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => load(filter, page)}
                  disabled={loading}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  <LuRefreshCw
                    className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                  />
                  Muat ulang
                </button>
              </div>

              {/* Tabel */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 text-left text-sm">
                  <thead>
                    <tr className="border-y border-slate-100 bg-slate-50/50 text-[11px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-2.5 font-semibold">
                        {data?.keyLabel ?? "Ref"}
                      </th>
                      {data?.columns.map((c) => (
                        <th key={c.label} className="px-4 py-2.5 font-semibold">
                          {c.label}
                        </th>
                      ))}
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {loading && !data ? (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-4 py-10 text-center text-sm text-slate-400"
                        >
                          Memuat…
                        </td>
                      </tr>
                    ) : data && data.rows.length > 0 ? (
                      data.rows.map((r) => (
                        <tr
                          key={r.key}
                          className="transition-colors hover:bg-slate-50/60"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                            {r.key}
                          </td>
                          {r.cells.map((cell, i) => (
                            <td
                              key={i}
                              className={`px-4 py-2.5 ${cellClass(cell.type)}`}
                            >
                              {cell.value ?? (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            {r.sent ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                  <LuCircleCheck className="h-3 w-3" />
                                  Terkirim
                                </span>
                                <span
                                  className="max-w-28 truncate font-mono text-[10px] text-slate-400"
                                  title={r.satuSehatId ?? undefined}
                                >
                                  {r.satuSehatId}
                                </span>
                              </span>
                            ) : r.ready ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-700">
                                <LuSend className="h-3 w-3" />
                                Siap kirim
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                                <LuClock className="h-3 w-3" />
                                Belum dikirim
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => openPayload(r.key)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                            >
                              <LuCode className="h-3.5 w-3.5" />
                              Payload
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={colCount}
                          className="px-4 py-10 text-center text-sm text-slate-400"
                        >
                          Tidak ada data untuk filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                  <span className="text-xs text-slate-400">
                    {data.totalRows > 0
                      ? `Menampilkan ${fmt(rangeStart)}–${fmt(rangeEnd)} dari ${fmt(data.totalRows)}`
                      : "Tidak ada data"}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={data.page <= 1 || loading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
                    >
                      <LuChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-20 text-center text-xs tabular-nums text-slate-500">
                      {data.page} / {fmt(data.totalPages)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPage((p) => Math.min(data.totalPages, p + 1))
                      }
                      disabled={data.page >= data.totalPages || loading}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-600"
                    >
                      <LuChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal payload */}
      {payloadKey && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closePayload}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Payload FHIR"
            className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-600">
                  <LuCode className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">
                    Payload {payloadData?.resourceType ?? ""}
                  </p>
                  <p className="truncate font-mono text-[11px] text-slate-400">
                    {data?.keyLabel ?? "Ref"}: {payloadKey}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePayload}
                aria-label="Tutup"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-4">
              {payloadLoading ? (
                <p className="text-xs text-slate-400">Memuat payload…</p>
              ) : payloadError ? (
                <p className="wrap-break-word text-xs text-red-400">
                  {payloadError}
                </p>
              ) : (
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre text-slate-100">
                  {payloadJson}
                </pre>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-slate-400">
                Draft dari SIMGOS · tinjau sebelum dikirim
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!payloadData}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <LuCheck className="h-3.5 w-3.5 text-emerald-600" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <LuCopy className="h-3.5 w-3.5" />
                      Salin
                    </>
                  )}
                </button>
                {onUsePayload && (
                  <button
                    type="button"
                    onClick={handleAutofill}
                    disabled={!payloadData}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-teal-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
                  >
                    <LuWandSparkles className="h-3.5 w-3.5" />
                    Autofill ke form
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
