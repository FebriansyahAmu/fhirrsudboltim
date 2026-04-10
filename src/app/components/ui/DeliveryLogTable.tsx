"use client";

import { useState, useCallback, useEffect } from "react";
import type { DeliveryLog, HttpMethod } from "@/app/lib/types/api";
import { formatLogDate, formatDuration } from "@/app/lib/utils/log";
import { safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Helpers styling
// ─────────────────────────────────────────────
const METHOD_PILL: Record<HttpMethod, string> = {
  GET: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
  POST: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  PUT: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  PATCH: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
  DELETE: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

function StatusBadge({ code }: { code: number }) {
  const isSuccess = code >= 200 && code < 300;
  const isClient = code >= 400 && code < 500;
  const isServer = code >= 500;
  const isNoCode = code === 0;

  const cls = isSuccess
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : isClient
      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
      : isServer || isNoCode
        ? "bg-red-50 text-red-700 ring-1 ring-red-200"
        : "bg-slate-100 text-slate-600";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isSuccess ? "bg-emerald-500" : isClient ? "bg-amber-500" : "bg-red-500"}`}
      />
      {isNoCode ? "Error" : code}
    </span>
  );
}

// ─────────────────────────────────────────────
// Detail Modal — aman, tidak gunakan innerHTML
// ─────────────────────────────────────────────
interface LogDetailModalProps {
  log: DeliveryLog;
  onClose: () => void;
}

function LogDetailModal({ log, onClose }: LogDetailModalProps) {
  // Tutup dengan Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Detail log pengiriman"
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span
              className={`text-[11px] font-bold px-2 py-1 rounded-lg ${METHOD_PILL[log.method]}`}
            >
              {log.method}
            </span>
            <span className="text-sm font-semibold text-slate-800 truncate max-w-75">
              {log.resourceType}
            </span>
            <StatusBadge code={log.statusCode} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Tutup detail"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M2 2L12 12M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Meta info */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="flex gap-2 text-slate-500">
            <span className="font-medium text-slate-400 w-20 shrink-0">
              Waktu
            </span>
            <span className="text-slate-700">{formatLogDate(log.sentAt)}</span>
          </div>
          <div className="flex gap-2 text-slate-500">
            <span className="font-medium text-slate-400 w-20 shrink-0">
              Durasi
            </span>
            <span className="text-slate-700">{formatDuration(log.timeMs)}</span>
          </div>
          <div className="flex gap-2 text-slate-500 col-span-2">
            <span className="font-medium text-slate-400 w-20 shrink-0">
              Endpoint
            </span>
            <span className="text-slate-700 font-mono text-[11px] break-all">
              {log.endpoint}
            </span>
          </div>
        </div>

        {/* Payload + Response */}
        <div className="flex-1 overflow-auto divide-y divide-slate-100">
          {Boolean(log.payload) && (
            <LogSection
              title="Payload Dikirim"
              data={log.payload}
              colorClass="text-teal-700"
            />
          )}
          <LogSection
            title="Response Server"
            data={log.response}
            colorClass="text-slate-700"
          />
        </div>
      </div>
    </div>
  );
}

function LogSection({
  title,
  data,
  colorClass,
}: {
  title: string;
  data: unknown;
  colorClass: string;
}) {
  const formatted = safeJsonStringify(data);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-2 bg-slate-50">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
        <button
          onClick={handleCopy}
          className="text-[11px] text-slate-400 hover:text-teal-600 transition-colors"
        >
          {copied ? "✓ Tersalin" : "Salin"}
        </button>
      </div>
      {/* Gunakan <pre> + text — TIDAK dangerouslySetInnerHTML */}
      <pre
        className={`px-5 py-4 text-xs font-mono leading-relaxed whitespace-pre-wrap wrap-break-word ${colorClass} max-h-60 overflow-auto`}
      >
        {formatted}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────
// Komponen Utama: DeliveryLogTable
// ─────────────────────────────────────────────
interface DeliveryLogTableProps {
  resourceType: string;
}

export default function DeliveryLogTable({
  resourceType,
}: DeliveryLogTableProps) {
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<DeliveryLog | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "error">(
    "all",
  );
  const [fetching, setFetching] = useState(false);

  const loadLogs = useCallback(async () => {
    setFetching(true);
    try {
      const qs = resourceType
        ? `?resourceType=${encodeURIComponent(resourceType)}`
        : "";
      const res = await fetch(`/api/logs${qs}`, { credentials: "same-origin" });
      if (!res.ok) return;
      const data = (await res.json()) as DeliveryLog[];
      setLogs(data);
    } catch {
      // Silent — tidak crash UI jika gagal fetch
    } finally {
      setFetching(false);
    }
  }, [resourceType]);

  // Load sekali saat komponen mount
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClear = () => setLogs([]);

  const filtered = logs.filter((l) => {
    if (filterStatus === "all") return true;
    return l.status === filterStatus;
  });

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-800">
              Log Pengiriman
            </h3>
            {logs.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full font-medium">
                  {successCount} berhasil
                </span>
                {errorCount > 0 && (
                  <span className="text-[11px] bg-red-50 text-red-700 ring-1 ring-red-200 px-2 py-0.5 rounded-full font-medium">
                    {errorCount} gagal
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Filter */}
            <div className="flex bg-slate-50 rounded-xl p-0.5 gap-0.5 border border-slate-100">
              {(["all", "success", "error"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-lg capitalize transition-all ${
                    filterStatus === f
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f === "all"
                    ? "Semua"
                    : f === "success"
                      ? "Berhasil"
                      : "Gagal"}
                </button>
              ))}
            </div>

            {/* Muat Ulang */}
            <button
              onClick={loadLogs}
              disabled={fetching}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                fetching
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200"
              }`}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 13 13"
                fill="none"
                className={fetching ? "animate-spin" : ""}
              >
                <path
                  d="M2 6.5C2 4 4 2 6.5 2C8 2 9.4 2.7 10.3 3.8L11 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M11 2V5H8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 6.5C11 9 9 11 6.5 11C5 11 3.6 10.3 2.7 9.2L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {fetching ? "Memuat..." : "Muat Ulang"}
            </button>

            {/* Hapus semua */}
            {logs.length > 0 && (
              <button
                onClick={handleClear}
                className="text-[11px] text-red-400 hover:text-red-600 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors font-medium"
              >
                Hapus semua
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl">
              📭
            </div>
            <p className="text-sm text-slate-400 font-medium">
              {logs.length === 0
                ? "Belum ada log pengiriman"
                : "Tidak ada log yang cocok"}
            </p>
            <p className="text-xs text-slate-300">
              Klik tombol di bawah setelah mengirim request
            </p>
            <button
              onClick={loadLogs}
              disabled={fetching}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                fetching
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-teal-600 hover:bg-teal-700 text-white shadow-sm shadow-teal-200"
              }`}
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 13 13"
                fill="none"
                className={fetching ? "animate-spin" : ""}
              >
                <path
                  d="M2 6.5C2 4 4 2 6.5 2C8 2 9.4 2.7 10.3 3.8L11 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M11 2V5H8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M11 6.5C11 9 9 11 6.5 11C5 11 3.6 10.3 2.7 9.2L2 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {fetching ? "Memuat..." : "Muat Ulang Log"}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {[
                    "Method",
                    "Status",
                    "Endpoint",
                    "Durasi",
                    "Waktu",
                    "Detail",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${METHOD_PILL[log.method]}`}
                      >
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge code={log.statusCode} />
                    </td>
                    <td className="px-4 py-3 max-w-55">
                      <span className="text-[11px] font-mono text-slate-500 truncate block">
                        {log.endpoint.replace(
                          process.env.NEXT_PUBLIC_SATU_SEHAT_BASE_URL ?? "",
                          "",
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-mono text-slate-500">
                        {formatDuration(log.timeMs)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-slate-400">
                        {formatLogDate(log.sentAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-[11px] font-medium text-teal-600 hover:text-teal-800 hover:bg-teal-50 px-2.5 py-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      >
                        Lihat →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal detail */}
      {selectedLog && (
        <LogDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </>
  );
}
