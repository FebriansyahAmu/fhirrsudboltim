"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import DashboardLayout from "@/app/components/layout/DashboardLayout";
import type { DicomRouterConfig as RouterConfig } from "@/app/lib/config/dicom-router.config";
import type { DicomMeta } from "@/app/api/tools/verify-dcm/route";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-baseline gap-1.5 text-[12px] font-semibold text-slate-600">
        {label}
        {required && <span className="text-red-400 font-bold">*</span>}
        {hint && (
          <span className="text-slate-400 font-normal text-[11px]">— {hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M5.5 3.5V5.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="5.5" cy="7.5" r="0.5" fill="currentColor" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

function DropZone({
  file,
  onFile,
  onClear,
  disabled,
}: {
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      className={`relative rounded-xl border-2 border-dashed transition-all duration-150 ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${
        dragOver
          ? "border-cyan-400 bg-cyan-50"
          : file
          ? "border-emerald-300 bg-emerald-50"
          : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100"
      }`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={disabled ? undefined : handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".dcm"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <span className="text-2xl">🗂️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
            <p className="text-[11px] text-slate-400">{fmtSize(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            disabled={disabled}
            className="text-slate-300 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-50 disabled:pointer-events-none"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <span className="text-3xl">📡</span>
          <p className="text-sm font-medium text-slate-500">
            {dragOver ? "Lepaskan file di sini" : "Klik atau drag & drop file .dcm"}
          </p>
          <p className="text-[11px] text-slate-400">Maks 50 MB</p>
        </div>
      )}
    </div>
  );
}

function RouterConfigCard({ config }: { config: RouterConfig | null }) {
  if (!config) {
    return (
      <div className="flex gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 animate-pulse">
        <div className="h-4 w-48 bg-slate-200 rounded" />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Target Router
      </span>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-500">Host</span>
        <code className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono">
          {config.host}
        </code>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-500">Port</span>
        <code className="text-[11px] px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-mono">
          {config.port}
        </code>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-500">AE Title</span>
        <code className="text-[11px] px-2 py-0.5 bg-cyan-50 border border-cyan-200 rounded-lg text-cyan-800 font-mono font-bold">
          {config.aeTitle}
        </code>
      </div>
      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 font-bold uppercase">
        config
      </span>
    </div>
  );
}

function TerminalOutput({
  label,
  content,
  color = "slate",
}: {
  label: string;
  content: string;
  color?: "slate" | "emerald" | "amber";
}) {
  if (!content) return null;
  const styles = {
    slate:   "bg-slate-900 text-slate-300 border-slate-700",
    emerald: "bg-emerald-950 text-emerald-300 border-emerald-800",
    amber:   "bg-amber-950 text-amber-300 border-amber-800",
  }[color];
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <pre className={`text-[11px] font-mono leading-relaxed px-4 py-3 rounded-xl border overflow-x-auto whitespace-pre-wrap break-all ${styles}`}>
        {content}
      </pre>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Kirim File
// ─────────────────────────────────────────────

interface SendResult {
  success: boolean;
  fileName: string;
  stdout: string;
  stderr: string;
  router: RouterConfig;
}

type SendState = "idle" | "loading" | "success" | "error";

function parseErrors(stdout: string, stderr: string): string[] {
  return [stdout, stderr]
    .join("\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^E:/i.test(l));
}

function ResponsePanel({
  state,
  result,
  errorMsg,
}: {
  state: SendState;
  result: SendResult | null;
  errorMsg: string | null;
}) {
  const errors = result ? parseErrors(result.stdout, result.stderr) : [];
  const allOutput = result
    ? [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
    : "";

  return (
    <div className="flex flex-col h-full min-h-64 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          Response
        </span>
        {state !== "idle" && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              state === "loading"
                ? "bg-amber-100 text-amber-600"
                : state === "success" && errors.length === 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {state === "loading"
              ? "SENDING..."
              : state === "success" && errors.length === 0
              ? "SUCCESS"
              : "ERROR"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Keterangan: SUCCESS = terkirim, bukan proses selesai */}
        {state === "success" && (
          <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <span className="shrink-0 text-amber-500 mt-0.5">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                <path d="M6 5v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                <circle cx="6" cy="9" r="0.6" fill="currentColor" />
              </svg>
            </span>
            <p className="text-[10px] text-amber-700 leading-relaxed">
              <strong>SUCCESS</strong> berarti file <em>diterima</em> oleh router (C-STORE).
              Proses lanjutan di router (buat ImagingStudy, dll.) berjalan terpisah dan tidak
              tercermin di sini.
            </p>
          </div>
        )}

        {/* Idle */}
        {state === "idle" && (
          <div className="flex flex-col items-center justify-center h-full py-10 gap-2 text-center">
            <span className="text-3xl opacity-30">📋</span>
            <p className="text-[12px] text-slate-400">Response akan muncul di sini</p>
          </div>
        )}

        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center h-full py-10 gap-3">
            <svg className="animate-spin text-cyan-500" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="20" />
            </svg>
            <p className="text-[12px] text-slate-400">Mengirim ke DICOM Router...</p>
          </div>
        )}

        {/* Success / Error dari storescu */}
        {state === "success" && result && (
          <div className="space-y-4">
            {/* Command yang dijalankan */}
            <div className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Command</p>
              <p className="text-[11px] font-mono text-slate-600 break-all">
                storescu --call{" "}
                <span className="text-cyan-700 font-bold">{result.router.aeTitle}</span>{" "}
                {result.router.host} {result.router.port}{" "}
                <span className="text-slate-500">{result.fileName}</span>
              </p>
            </div>

            {/* Error lines (jika ada) */}
            {errors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold text-red-500 uppercase tracking-widest">
                  Errors ({errors.length})
                </p>
                <div className="bg-red-950 rounded-xl border border-red-800 px-4 py-3 space-y-1">
                  {errors.map((line, i) => (
                    <p key={i} className="text-[11px] font-mono text-red-300 break-all">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Full output */}
            {allOutput && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Full Output
                </p>
                <pre className="text-[11px] font-mono leading-relaxed bg-slate-900 text-slate-300 border border-slate-700 px-4 py-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">
                  {allOutput}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Error HTTP / jaringan */}
        {state === "error" && errorMsg && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl bg-red-50 border border-red-200">
              <span className="shrink-0 text-red-500 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 4v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="7" cy="10" r="0.75" fill="currentColor" />
                </svg>
              </span>
              <p className="text-[11px] text-red-700 font-semibold">Pengiriman gagal</p>
            </div>
            <pre className="text-[11px] font-mono leading-relaxed bg-slate-900 text-red-300 border border-slate-700 px-4 py-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all">
              {errorMsg}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// Field-field kritis yang wajib ada agar router dapat memproses file
const CRITICAL_FIELDS: { key: keyof DicomMeta; label: string }[] = [
  { key: "AccessionNumber",  label: "Accession Number" },
  { key: "StudyDescription", label: "Study Description" },
  { key: "StudyDate",        label: "Study Date" },
  { key: "Modality",         label: "Modality" },
];

function PreflightCard({
  checking,
  meta,
  metaErr,
}: {
  checking: boolean;
  meta: DicomMeta | null;
  metaErr: string | null;
}) {
  if (checking) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
        <svg className="animate-spin text-slate-400 shrink-0" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="2" strokeDasharray="16" strokeDashoffset="8" />
        </svg>
        <p className="text-[11px] text-slate-500">Memeriksa metadata DCM...</p>
      </div>
    );
  }
  if (metaErr) {
    return (
      <div className="flex gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
        <span className="text-red-400 shrink-0 mt-0.5 text-xs">⚠</span>
        <p className="text-[11px] text-red-700">Gagal baca metadata: {metaErr}</p>
      </div>
    );
  }
  if (!meta) return null;

  const missing = CRITICAL_FIELDS.filter((f) => !meta[f.key]);
  const allOk   = missing.length === 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${allOk ? "border-emerald-200" : "border-amber-300"}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2 ${allOk ? "bg-emerald-50" : "bg-amber-50"}`}>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${allOk ? "text-emerald-600" : "text-amber-600"}`}>
          Pre-flight Check
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {allOk ? "✓ OK" : `${missing.length} field kosong`}
        </span>
      </div>
      {/* Fields */}
      <div className="bg-white divide-y divide-slate-50">
        {CRITICAL_FIELDS.map(({ key, label }) => {
          const val     = meta[key];
          const isEmpty = !val;
          return (
            <div key={key} className="flex items-center justify-between px-3 py-1.5 gap-3">
              <span className="text-[10px] text-slate-500 shrink-0">{label}</span>
              {isEmpty ? (
                <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
                  KOSONG ⚠
                </span>
              ) : (
                <span className="text-[10px] font-mono text-slate-700 truncate max-w-40">{val}</span>
              )}
            </div>
          );
        })}
      </div>
      {/* Warning jika ada yang kosong */}
      {!allOk && (
        <div className="px-3 py-2 bg-amber-50 border-t border-amber-200">
          <p className="text-[10px] text-amber-700">
            Field kosong dapat menyebabkan router gagal membuat ImagingStudy di Satu Sehat.
            Gunakan converter untuk embed metadata yang lengkap.
          </p>
        </div>
      )}
    </div>
  );
}

function SendTab({ config }: { config: RouterConfig | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<SendState>("idle");
  const [result, setResult] = useState<SendResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [metaChecking, setMetaChecking] = useState(false);
  const [meta, setMeta] = useState<DicomMeta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const checkMeta = async (f: File) => {
    setMetaChecking(true); setMeta(null); setMetaErr(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/tools/verify-dcm", { method: "POST", body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Gagal baca metadata");
      setMeta(payload.meta as DicomMeta);
    } catch (err) {
      setMetaErr(err instanceof Error ? err.message : "Gagal baca metadata");
    } finally {
      setMetaChecking(false);
    }
  };

  const acceptFile = (f: File) => {
    if (!f.name.match(/\.dcm$/i)) { setErrorMsg("Hanya file .dcm yang didukung."); return; }
    setFile(f); setErrorMsg(null); setState("idle"); setResult(null);
    checkMeta(f);
  };

  const handleSend = async () => {
    if (!file) return;
    setState("loading"); setResult(null); setErrorMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tools/send-to-router", { method: "POST", body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Gagal mengirim ke router");
      setResult(payload as SendResult);
      setState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Gagal mengirim ke router");
      setState("error");
    }
  };

  const handleReset = () => {
    setFile(null); setState("idle"); setResult(null); setErrorMsg(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      {/* ── Kiri: Input ── */}
      <div className="space-y-4">
        <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-cyan-50 border border-cyan-100">
          <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
          <p className="text-[11px] text-cyan-700 leading-relaxed">
            Upload <strong>.dcm</strong>, lalu klik <strong>Kirim</strong>. Response
            ditampilkan di panel kanan.
          </p>
        </div>

        <RouterConfigCard config={config} />

        <Field
          label="File DICOM"
          required
          hint=".dcm · maks 50 MB"
          error={errorMsg && !file ? errorMsg : undefined}
        >
          <DropZone
            file={file}
            onFile={acceptFile}
            onClear={handleReset}
            disabled={state === "loading"}
          />
        </Field>

        <PreflightCard checking={metaChecking} meta={meta} metaErr={metaErr} />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={!file || state === "loading"}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              !file || state === "loading"
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                : "bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm shadow-cyan-200"
            }`}
          >
            {state === "loading" ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
                </svg>
                Mengirim...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Kirim ke DICOM Router
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={state === "loading"}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </div>

      {/* ── Kanan: Response Panel ── */}
      <ResponsePanel state={state} result={result} errorMsg={errorMsg} />
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Test Koneksi (echoscu)
// ─────────────────────────────────────────────

interface EchoResult {
  success: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  router: RouterConfig;
}

type EchoStatus = "idle" | "loading" | "success" | "error";

function EchoTab({ config }: { config: RouterConfig | null }) {
  const [status, setStatus] = useState<EchoStatus>("idle");
  const [result, setResult] = useState<EchoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEcho = async () => {
    setStatus("loading"); setResult(null); setError(null);
    try {
      const res = await fetch("/api/tools/dicom-echo", { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Echo gagal");
      setResult(payload as EchoResult);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo gagal");
      setStatus("error");
    }
  };

  const handleReset = () => { setStatus("idle"); setResult(null); setError(null); };

  const statusDot = {
    idle:    "bg-slate-300",
    loading: "bg-amber-400 animate-pulse",
    success: "bg-emerald-400",
    error:   "bg-red-400",
  }[status];

  const statusLabel = {
    idle:    "Belum diuji",
    loading: "Menghubungkan...",
    success: "Terhubung",
    error:   "Tidak terhubung",
  }[status];

  return (
    <div className="space-y-5">
      {/* Hint */}
      <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-indigo-50 border border-indigo-100">
        <span className="text-base leading-none shrink-0 mt-0.5">🔌</span>
        <p className="text-[11px] text-indigo-700 leading-relaxed">
          Uji koneksi ke DICOM Router dengan mengirimkan{" "}
          <strong>C-ECHO SCU</strong>. Sistem menjalankan{" "}
          <code className="font-mono bg-indigo-100 px-1 rounded">
            echoscu --call {config?.aeTitle ?? "…"} {config?.host ?? "…"} {config?.port ?? "…"}
          </code>{" "}
          di sisi server.
        </p>
      </div>

      <RouterConfigCard config={config} />

      {/* Status indicator */}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-2.5">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
          <span className="text-sm font-semibold text-slate-700">{statusLabel}</span>
        </div>
        {result && (
          <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">
            {result.durationMs} ms
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleEcho}
          disabled={status === "loading"}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            status === "loading"
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200"
          }`}
        >
          {status === "loading" ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
              </svg>
              Menghubungkan...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M7 4v3l2 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {status === "success" || status === "error" ? "Uji Ulang" : "Test Koneksi (C-ECHO)"}
            </>
          )}
        </button>
        {status !== "idle" && (
          <button
            type="button"
            onClick={handleReset}
            disabled={status === "loading"}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            Reset
          </button>
        )}
      </div>

      {/* Success result */}
      {status === "success" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-lg">✅</span>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                DICOM Router merespons C-ECHO
              </p>
              <p className="text-[11px] text-emerald-600">
                {result.router.host}:{result.router.port} ({result.router.aeTitle}) — {result.durationMs} ms
              </p>
            </div>
          </div>
          <TerminalOutput label="stdout" content={result.stdout} color="emerald" />
          <TerminalOutput label="stderr (info DCMTK)" content={result.stderr} color="amber" />
        </div>
      )}

      {/* Error result */}
      {status === "error" && error && (
        <div className="space-y-3">
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
            <span className="text-lg shrink-0">❌</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Koneksi gagal</p>
              <p className="text-[11px] text-red-600 mt-0.5">
                Pastikan DICOM Router aktif dan dapat dijangkau dari server.
              </p>
            </div>
          </div>
          <TerminalOutput label="Error" content={error} color="slate" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

type Tab = "send" | "echo";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "send", label: "Kirim File DICOM", icon: "📤" },
  { id: "echo", label: "Test Koneksi",     icon: "🔌" },
];

export default function DicomRouterPage() {
  const [activeTab, setActiveTab] = useState<Tab>("send");
  const [config, setConfig] = useState<RouterConfig | null>(null);

  useEffect(() => {
    fetch("/api/tools/send-to-router")
      .then((r) => r.json())
      .then((d: RouterConfig) => setConfig(d))
      .catch(() => {});
  }, []);

  return (
    <DashboardLayout
      title="DICOM Router"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "DICOM Router" },
      ]}
    >
      <div className="space-y-6 max-w-5xl">
        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-cyan-100 to-sky-100 border border-cyan-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
            📡
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">DICOM Router</h1>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-cyan-100 text-cyan-700">
                storescu
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                echoscu
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                DCMTK
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Kirim file DICOM dan uji koneksi ke DICOM Router via C-STORE / C-ECHO SCU
            </p>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        {activeTab === "send" ? (
          <SendTab config={config} />
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-2xl">
            <EchoTab config={config} />
          </div>
        )}

        {/* ── Prasyarat ── */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Prasyarat</p>
          <div className="space-y-2 text-[11px] text-slate-600">
            {[
              [
                "Install DCMTK",
                <>Pastikan <code className="font-mono bg-slate-200 px-1 rounded">storescu</code> dan <code className="font-mono bg-slate-200 px-1 rounded">echoscu</code> tersedia di PATH server.</>,
              ],
              [
                "Konfigurasi router",
                <>Edit <code className="font-mono bg-slate-200 px-1 rounded">src/app/lib/config/dicom-router.config.ts</code> sesuai host, port, dan AE title target.</>,
              ],
              [
                "Jaringan server",
                "DICOM Router harus dapat dijangkau dari server Next.js, bukan dari browser pengguna.",
              ],
            ].map(([title, desc], i) => (
              <div key={i} className="flex gap-2">
                <span className="shrink-0 text-slate-400">{"①②③"[i]}</span>
                <span><strong>{title}</strong> — {desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
