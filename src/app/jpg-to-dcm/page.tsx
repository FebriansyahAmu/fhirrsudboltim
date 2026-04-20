"use client";

import { useState, useRef, useCallback } from "react";
import DashboardLayout from "@/app/components/layout/DashboardLayout";
import type { DicomMeta } from "@/app/api/tools/verify-dcm/route";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400/40 focus:border-teal-400 transition-all duration-150";
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
  accept,
  file,
  onFile,
  onClear,
  hint,
  disabled,
}: {
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  hint: string;
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
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer"
      } ${
        dragOver
          ? "border-violet-400 bg-violet-50"
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
        accept={accept}
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
            {dragOver ? "Lepaskan file di sini" : `Klik atau drag & drop ${hint}`}
          </p>
          <p className="text-[11px] text-slate-400">Maks {accept.includes("dcm") ? "50 MB" : "20 MB"}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Konversi
// ─────────────────────────────────────────────

function ConvertTab() {
  const [file, setFile] = useState<File | null>(null);
  const [acsn, setAcsn] = useState("");
  const [studyDate, setStudyDate] = useState(todayStr());
  const [studyTime, setStudyTime] = useState(nowTimeStr());
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acsnErr, setAcsnErr] = useState<string | undefined>();

  const acceptFile = (f: File) => {
    if (!f.name.match(/\.(jpg|jpeg)$/i)) { setError("Hanya file JPG/JPEG yang didukung."); return; }
    if (f.size > 20 * 1024 * 1024) { setError("Ukuran file maksimal 20 MB."); return; }
    setFile(f); setError(null); setDone(false);
  };

  const handleConvert = async () => {
    if (!acsn.trim()) { setAcsnErr("Accession Number wajib diisi"); return; }
    if (!file) return;
    setLoading(true); setError(null); setDone(false);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("acsn", acsn.trim());
      fd.append("studyDate", studyDate);
      fd.append("studyTime", studyTime);

      const res = await fetch("/api/tools/jpg-to-dcm", { method: "POST", body: fd });
      if (!res.ok) {
        const p = await res.json().catch(() => ({ error: "Konversi gagal" }));
        throw new Error(p.error ?? "Konversi gagal");
      }

      const blob = await res.blob();
      const outName = file.name.replace(/\.(jpg|jpeg)$/i, ".dcm");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = outName;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konversi gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null); setAcsn(""); setStudyDate(todayStr()); setStudyTime(nowTimeStr());
    setLoading(false); setDone(false); setError(null); setAcsnErr(undefined);
  };

  return (
    <div className="space-y-5">
      {/* Hint */}
      <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100">
        <span className="text-base leading-none shrink-0 mt-0.5">💡</span>
        <p className="text-[11px] text-blue-700 leading-relaxed">
          Upload JPG/JPEG, isi <strong>Accession Number</strong> dan tanggal/waktu studi,
          lalu klik <strong>Konversi</strong>. File DICOM (.dcm) langsung diunduh.
        </p>
      </div>

      {/* File */}
      <Field label="File Gambar" required hint="JPG/JPEG · maks 20 MB">
        <DropZone
          accept=".jpg,.jpeg,image/jpeg"
          file={file}
          onFile={acceptFile}
          onClear={() => { setFile(null); setDone(false); setError(null); }}
          hint="file JPG/JPEG"
          disabled={loading}
        />
      </Field>

      {/* ACSN */}
      <Field label="Accession Number (ACSN)" required hint="identifier FHIR ImagingStudy SatuSehat" error={acsnErr}>
        <input
          type="text"
          value={acsn}
          onChange={(e) => { setAcsn(e.target.value); setAcsnErr(undefined); }}
          className={acsnErr ? inputErr : inputBase}
          placeholder="Contoh: MR.221102.062"
          autoComplete="off" spellCheck={false}
          disabled={loading}
        />
      </Field>

      {/* Tanggal & Waktu */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Tanggal Studi" hint="StudyDate DICOM">
          <input type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)}
            className={inputBase} disabled={loading} />
        </Field>
        <Field label="Waktu Studi" hint="StudyTime DICOM">
          <input type="time" value={studyTime} onChange={(e) => setStudyTime(e.target.value)}
            className={inputBase} disabled={loading} />
        </Field>
      </div>

      {/* Status */}
      {done && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <span className="text-lg">✅</span>
          <div>
            <p className="text-sm font-semibold text-emerald-800">Konversi berhasil!</p>
            <p className="text-[11px] text-emerald-600">File DICOM telah diunduh ke perangkat Anda.</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <span className="text-lg shrink-0">❌</span>
          <div>
            <p className="text-sm font-semibold text-red-800">Konversi gagal</p>
            <p className="text-[11px] text-red-600 mt-0.5 break-all">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleConvert}
          disabled={!file || loading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            !file || loading
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-violet-600 hover:bg-violet-700 text-white shadow-sm shadow-violet-200"
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
              </svg>
              Mengkonversi...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Konversi & Unduh DICOM
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

      {/* Info teknis */}
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Metadata DICOM yang dihasilkan</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
          {[
            ["Modality", "CR (Computed Radiography)"],
            ["SOP Class", "1.2.840.10008.5.1.4.1.1.1"],
            ["Body Part", "CHEST"],
            ["View Position", "PA (Posteroanterior)"],
            ["Manufacturer", "FUJIFILM FCR PRIMA T2"],
            ["Bits Allocated", "8 bit"],
            ["Transfer Syntax", "Explicit VR Little Endian"],
            ["Pixel Spacing", "0.254 × 0.254 mm"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-slate-400 font-medium">{k}</span>
              <span className="text-slate-700 font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Verifikasi
// ─────────────────────────────────────────────

const META_SECTIONS: { title: string; keys: (keyof DicomMeta)[] }[] = [
  {
    title: "Identifikasi Utama",
    keys: ["AccessionNumber", "StudyDate", "StudyTime", "StudyDescription"],
  },
  {
    title: "Modalitas & Anatomi",
    keys: ["Modality", "BodyPartExamined", "ViewPosition", "SeriesDescription"],
  },
  {
    title: "Instance UIDs",
    keys: ["StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID", "SOPClassUID"],
  },
  {
    title: "Perangkat",
    keys: ["Manufacturer", "ManufacturerModelName", "StationName", "InstitutionName"],
  },
  {
    title: "Piksel & Encoding",
    keys: ["Rows", "Columns", "BitsAllocated", "SamplesPerPixel", "PhotometricInterpretation", "TransferSyntaxUID"],
  },
];

const META_LABEL: Partial<Record<keyof DicomMeta, string>> = {
  AccessionNumber: "Accession Number",
  StudyDate: "Tanggal Studi",
  StudyTime: "Waktu Studi",
  StudyDescription: "Deskripsi Studi",
  Modality: "Modality",
  BodyPartExamined: "Body Part",
  ViewPosition: "View Position",
  SeriesDescription: "Deskripsi Series",
  StudyInstanceUID: "Study Instance UID",
  SeriesInstanceUID: "Series Instance UID",
  SOPInstanceUID: "SOP Instance UID",
  SOPClassUID: "SOP Class UID",
  Manufacturer: "Manufacturer",
  ManufacturerModelName: "Model",
  StationName: "Station Name",
  InstitutionName: "Institusi",
  Rows: "Baris (Rows)",
  Columns: "Kolom (Columns)",
  BitsAllocated: "Bits Allocated",
  SamplesPerPixel: "Samples/Pixel",
  PhotometricInterpretation: "Photometric Interpretation",
  TransferSyntaxUID: "Transfer Syntax UID",
};

function VerifyTab() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<DicomMeta | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (f: File) => {
    if (!f.name.match(/\.dcm$/i)) { setError("Hanya file .dcm yang didukung."); return; }
    setFile(f); setError(null); setMeta(null);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true); setError(null); setMeta(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/tools/verify-dcm", { method: "POST", body: fd });
      const payload = await res.json();

      if (!res.ok) throw new Error(payload.error ?? "Verifikasi gagal");

      setMeta(payload.meta);
      setFileName(payload.fileName ?? file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verifikasi gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null); setLoading(false); setMeta(null); setFileName(""); setError(null);
  };

  return (
    <div className="space-y-5">
      {/* Hint */}
      <div className="flex gap-2.5 px-3.5 py-3 rounded-xl bg-sky-50 border border-sky-100">
        <span className="text-base leading-none shrink-0 mt-0.5">🔍</span>
        <p className="text-[11px] text-sky-700 leading-relaxed">
          Upload file <strong>.dcm</strong> hasil konversi untuk memverifikasi metadata yang tersimpan,
          termasuk <strong>Accession Number</strong>, tanggal studi, modality, dan UID.
        </p>
      </div>

      {/* File */}
      <Field label="File DICOM" required hint=".dcm · maks 50 MB">
        <DropZone
          accept=".dcm"
          file={file}
          onFile={acceptFile}
          onClear={() => { setFile(null); setMeta(null); setError(null); }}
          hint="file .dcm"
          disabled={loading}
        />
      </Field>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
          <span className="text-lg shrink-0">❌</span>
          <div>
            <p className="text-sm font-semibold text-red-800">Verifikasi gagal</p>
            <p className="text-[11px] text-red-600 mt-0.5 break-all">{error}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleVerify}
          disabled={!file || loading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
            !file || loading
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-sky-600 hover:bg-sky-700 text-white shadow-sm shadow-sky-200"
          }`}
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" strokeDasharray="20" strokeDashoffset="10" />
              </svg>
              Membaca metadata...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Verifikasi Metadata
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

      {/* Hasil metadata */}
      {meta && (
        <div className="space-y-4">
          {/* Header hasil */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-lg">✅</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">Metadata berhasil dibaca</p>
              <p className="text-[11px] text-emerald-600 truncate">{fileName}</p>
            </div>
          </div>

          {/* ACSN highlight */}
          <div className="px-4 py-4 rounded-2xl bg-violet-50 border border-violet-200">
            <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-1">
              Accession Number
            </p>
            <p className={`text-xl font-bold font-mono ${meta.AccessionNumber ? "text-violet-800" : "text-slate-300"}`}>
              {meta.AccessionNumber ?? "—"}
            </p>
          </div>

          {/* Sections */}
          {META_SECTIONS.map((section) => (
            <div key={section.title} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {section.title}
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {section.keys.map((key) => {
                  const val = meta[key];
                  const isUID = key.toLowerCase().includes("uid");
                  return (
                    <div key={key} className="flex items-start justify-between gap-4 px-4 py-2.5">
                      <span className="text-[11px] text-slate-500 font-medium shrink-0 min-w-36">
                        {META_LABEL[key] ?? key}
                      </span>
                      <span
                        className={`text-[11px] text-right break-all ${
                          val
                            ? isUID
                              ? "text-slate-600 font-mono text-[10px]"
                              : "text-slate-800 font-semibold"
                            : "text-slate-300"
                        }`}
                      >
                        {val ?? "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

type Tab = "convert" | "verify";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "convert", label: "Konversi JPG → DICOM", icon: "🔄" },
  { id: "verify",  label: "Verifikasi DICOM",      icon: "🔍" },
];

export default function JpgToDicomPage() {
  const [activeTab, setActiveTab] = useState<Tab>("convert");

  return (
    <DashboardLayout
      title="Konversi DICOM"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Konversi JPG → DICOM" },
      ]}
    >
      <div className="space-y-6 max-w-2xl">
        {/* ── Header ── */}
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-violet-100 to-purple-100 border border-violet-200 flex items-center justify-center text-2xl shrink-0 shadow-sm">
            🔄
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">Konversi JPG → DICOM</h1>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                CR Thorax PA
              </span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                DICOM 3.0
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Konversi & verifikasi file DICOM untuk radiologi — Satu Sehat Integration
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
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          {activeTab === "convert" ? <ConvertTab /> : <VerifyTab />}
        </div>
      </div>
    </DashboardLayout>
  );
}
