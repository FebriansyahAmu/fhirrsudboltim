"use client";

import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/app/components/layout/DashboardLayout";
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

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-400 transition-all duration-150";
const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-300/40 focus:border-red-400 transition-all duration-150";

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
        {hint && <span className="text-slate-400 font-normal text-[11px]">— {hint}</span>}
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
          ? "border-orange-400 bg-orange-50"
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
          <span className="text-3xl">📂</span>
          <p className="text-sm font-medium text-slate-500">
            {dragOver ? "Lepaskan file di sini" : "Klik atau drag & drop file .dcm"}
          </p>
          <p className="text-[11px] text-slate-400">Maks 50 MB</p>
        </div>
      )}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string | null }) {
  const empty = !value;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500 shrink-0">{label}</span>
      {empty ? (
        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
          KOSONG
        </span>
      ) : (
        <span className="text-[11px] font-mono text-slate-700 truncate max-w-48 text-right">{value}</span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function PatchAcsnPage() {
  const [file, setFile]           = useState<File | null>(null);
  const [acsn, setAcsn]           = useState("");
  const [acsnErr, setAcsnErr]     = useState<string | undefined>();
  const [studyDesc, setStudyDesc] = useState("");

  const [checking, setChecking]   = useState(false);
  const [curMeta, setCurMeta]     = useState<DicomMeta | null>(null);
  const [metaErr, setMetaErr]     = useState<string | null>(null);

  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [patchErr, setPatchErr]   = useState<string | null>(null);

  const verifyCurrent = async (f: File) => {
    setChecking(true); setCurMeta(null); setMetaErr(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/tools/verify-dcm", { method: "POST", body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Gagal baca metadata");
      const m = payload.meta as DicomMeta;
      setCurMeta(m);
      setAcsn(m.AccessionNumber ?? "");
      setStudyDesc(m.StudyDescription ?? "");
    } catch (err) {
      setMetaErr(err instanceof Error ? err.message : "Gagal baca metadata");
    } finally {
      setChecking(false);
    }
  };

  const acceptFile = (f: File) => {
    if (!f.name.match(/\.dcm$/i)) { setPatchErr("Hanya file .dcm yang didukung."); return; }
    setFile(f); setPatchErr(null); setDone(false); setCurMeta(null);
    verifyCurrent(f);
  };

  const handlePatch = async () => {
    if (!acsn.trim()) { setAcsnErr("Accession Number wajib diisi"); return; }
    if (!file) return;
    setLoading(true); setPatchErr(null); setDone(false);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("acsn", acsn.trim());
      if (studyDesc.trim()) fd.append("studyDescription", studyDesc.trim());

      const res = await fetch("/api/tools/patch-acsn", { method: "POST", body: fd });

      if (!res.ok) {
        const p = await res.json().catch(() => ({ error: "Patch gagal" }));
        throw new Error(p.error ?? "Patch gagal");
      }

      const blob = await res.blob();
      const outName = file.name.replace(/\.dcm$/i, "_patched.dcm");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      setPatchErr(err instanceof Error ? err.message : "Patch gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null); setAcsn(""); setAcsnErr(undefined); setStudyDesc("");
    setChecking(false); setCurMeta(null); setMetaErr(null);
    setLoading(false); setDone(false); setPatchErr(null);
  };

  return (
    <DashboardLayout
      title="Patch ACSN"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Patch ACSN" },
      ]}
    >
      <div className="space-y-6 max-w-2xl">
        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-orange-100 to-amber-100 border border-orange-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
            ✏️
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">Patch ACSN</h1>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                AccessionNumber
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                DICOM 3.0
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Tambahkan atau ubah Accession Number pada file .dcm yang sudah ada
            </p>
          </div>
        </div>

        {/* ── Content Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          {/* Hint */}
          <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-orange-50 border border-orange-100">
            <span className="text-base leading-none shrink-0 mt-0.5">✏️</span>
            <p className="text-[11px] text-orange-700 leading-relaxed">
              Upload file <strong>.dcm</strong> yang belum memiliki Accession Number, isi ACSN baru,
              lalu klik <strong>Patch & Unduh</strong>. File baru (<code className="font-mono bg-orange-100 px-1 rounded">_patched.dcm</code>) akan diunduh.
              Verifikasi hasil dengan halaman <strong>Verifikasi DICOM</strong>.
            </p>
          </div>

          {/* File upload */}
          <Field label="File DICOM" required hint=".dcm · maks 50 MB"
            error={patchErr && !file ? patchErr : undefined}>
            <DropZone
              file={file}
              onFile={acceptFile}
              onClear={handleReset}
              disabled={loading}
            />
          </Field>

          {/* Metadata saat ini */}
          {(checking || curMeta || metaErr) && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Metadata Saat Ini
                </span>
                {checking && (
                  <svg className="animate-spin text-slate-400" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="2" strokeDasharray="16" strokeDashoffset="8" />
                  </svg>
                )}
              </div>
              {checking && (
                <div className="px-3 py-3">
                  <div className="h-3 bg-slate-100 rounded animate-pulse w-3/4" />
                </div>
              )}
              {metaErr && (
                <p className="px-3 py-2.5 text-[11px] text-red-600">{metaErr}</p>
              )}
              {curMeta && !checking && (
                <div className="bg-white">
                  <MetaField label="Accession Number"  value={curMeta.AccessionNumber} />
                  <MetaField label="Study Description" value={curMeta.StudyDescription} />
                  <MetaField label="Study Date"        value={curMeta.StudyDate} />
                  <MetaField label="Modality"          value={curMeta.Modality} />
                </div>
              )}
            </div>
          )}

          {/* Input ACSN baru */}
          <Field label="Accession Number Baru" required
            hint="akan di-embed ke dalam file .dcm" error={acsnErr}>
            <input
              type="text"
              value={acsn}
              onChange={(e) => { setAcsn(e.target.value); setAcsnErr(undefined); }}
              className={`${acsnErr ? inputErr : inputBase} font-mono`}
              placeholder="Contoh: RAD2604201001"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
            />
          </Field>

          {/* Study Description */}
          <Field label="Study Description" hint="opsional — patch jika ingin mengubah atau mengisi">
            <input
              type="text"
              value={studyDesc}
              onChange={(e) => setStudyDesc(e.target.value)}
              className={inputBase}
              placeholder="Contoh: Thorax PA"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
            />
          </Field>

          {/* Success */}
          {done && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-lg">✅</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800">Patch berhasil!</p>
                <p className="text-[11px] text-emerald-600">
                  File <code className="font-mono">_patched.dcm</code> telah diunduh.
                  Verifikasi di halaman <strong>Konversi DICOM → Verifikasi DICOM</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {patchErr && file && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <span className="text-lg shrink-0">❌</span>
              <div>
                <p className="text-sm font-semibold text-red-800">Patch gagal</p>
                <p className="text-[11px] text-red-600 mt-0.5 break-all">{patchErr}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handlePatch}
              disabled={!file || loading || checking}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                !file || loading || checking
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700 text-white shadow-sm shadow-orange-200"
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
                  </svg>
                  Memproses...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 10l2-2 6-6 2 2-6 6-2 2-2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    <path d="M8 4l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  Patch & Unduh DICOM
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors disabled:opacity-40"
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
