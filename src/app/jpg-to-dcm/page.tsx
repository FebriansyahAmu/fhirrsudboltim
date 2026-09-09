"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  LuUpload,
  LuFileImage,
  LuImage,
  LuX,
  LuCopy,
  LuCheck,
  LuDownload,
  LuRotateCcw,
  LuLoaderCircle,
  LuCircleCheck,
  LuCircleAlert,
  LuScan,
  LuInfo,
  LuArrowRight,
  LuCalendar,
  LuClock,
  LuTag,
  LuLayers,
  LuMonitor,
  LuFileDigit,
} from "react-icons/lu";
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
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// UI primitives
// ─────────────────────────────────────────────

const inputBase =
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-teal-400/15 focus:border-teal-400 transition-all duration-150";
const inputErr =
  "w-full bg-white border border-red-300 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-red-300/20 focus:border-red-400 transition-all duration-150";

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
        {required && <span className="font-bold text-red-400">*</span>}
        {hint && (
          <span className="text-[11px] font-normal text-slate-400">— {hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-[11px] text-red-600" role="alert">
          <LuCircleAlert className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Salin ke clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard tidak tersedia */
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      {copied ? (
        <LuCheck className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <LuCopy className="h-3.5 w-3.5" />
      )}
      {label && (
        <span className="text-[11px] font-medium">
          {copied ? "Tersalin" : label}
        </span>
      )}
    </button>
  );
}

function DropZone({
  accept,
  file,
  onFile,
  onClear,
  hint,
  maxLabel,
  accent,
  disabled,
  icon,
}: {
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  hint: string;
  maxLabel: string;
  accent: "violet" | "sky";
  disabled?: boolean;
  icon: React.ReactNode;
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

  const accentRing =
    accent === "violet"
      ? "border-violet-400 bg-violet-50"
      : "border-sky-400 bg-sky-50";

  return (
    <div
      className={`group relative rounded-2xl border-2 border-dashed transition-all duration-150 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${
        dragOver
          ? `${accentRing} scale-[1.01]`
          : file
            ? "border-emerald-300 bg-emerald-50"
            : "border-slate-200 bg-slate-50/60 hover:border-slate-300 hover:bg-slate-100"
      }`}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
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
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <LuCircleCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {file.name}
            </p>
            <p className="text-[11px] text-slate-400">{fmtSize(file.size)} · siap diproses</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            disabled={disabled}
            aria-label="Hapus file"
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400 disabled:pointer-events-none"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2.5 py-9 text-center">
          <span
            className={`grid h-12 w-12 place-items-center rounded-2xl text-slate-400 transition-colors ${
              dragOver
                ? accent === "violet"
                  ? "bg-violet-100 text-violet-500"
                  : "bg-sky-100 text-sky-500"
                : "bg-white text-slate-400 group-hover:text-slate-500"
            } shadow-sm`}
          >
            {dragOver ? <LuUpload className="h-6 w-6" /> : icon}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-600">
              {dragOver ? "Lepaskan di sini" : "Klik untuk pilih file"}
            </p>
            <p className="text-[11px] text-slate-400">
              atau drag &amp; drop {hint} · maks {maxLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-300">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Konversi
// ─────────────────────────────────────────────

const GEN_META: [string, string][] = [
  ["Modality", "CR"],
  ["SOP Class", "1.2.840.10008.5.1.4.1.1.1"],
  ["Body Part", "CHEST"],
  ["View Position", "PA"],
  ["Manufacturer", "FUJIFILM FCR PRIMA T2"],
  ["Bits Allocated", "8 bit"],
  ["Transfer Syntax", "Explicit VR LE"],
  ["Pixel Spacing", "0.254 × 0.254 mm"],
];

function ConvertTab() {
  const [file, setFile] = useState<File | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [acsn, setAcsn] = useState("");
  const [studyDate, setStudyDate] = useState(todayStr());
  const [studyTime, setStudyTime] = useState(nowTimeStr());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acsnErr, setAcsnErr] = useState<string | undefined>();
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputName, setOutputName] = useState("");

  // Pratinjau gambar (objectURL) — dibuat murni dari file, dibersihkan saat ganti.
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const acceptFile = (f: File) => {
    if (!f.name.match(/\.(jpg|jpeg)$/i)) {
      setError("Hanya file JPG/JPEG yang didukung.");
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError("Ukuran file maksimal 20 MB.");
      return;
    }
    setFile(f);
    setDims(null);
    setError(null);
    setOutputBlob(null);
  };

  const clearFile = () => {
    setFile(null);
    setDims(null);
    setError(null);
    setOutputBlob(null);
  };

  const handleConvert = async () => {
    if (!acsn.trim()) {
      setAcsnErr("Accession Number wajib diisi");
      return;
    }
    if (!file) return;
    setLoading(true);
    setError(null);
    setOutputBlob(null);

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
      setOutputBlob(blob);
      setOutputName(outName);
      downloadBlob(blob, outName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konversi gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setDims(null);
    setAcsn("");
    setStudyDate(todayStr());
    setStudyTime(nowTimeStr());
    setLoading(false);
    setError(null);
    setAcsnErr(undefined);
    setOutputBlob(null);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Kolom kiri: input ── */}
      <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-100 text-[13px] font-bold text-violet-600">
            1
          </span>
          <h3 className="text-sm font-bold text-slate-800">Unggah &amp; Metadata</h3>
        </div>

        <Field label="File Gambar" required hint="JPG/JPEG · maks 20 MB">
          <DropZone
            accept=".jpg,.jpeg,image/jpeg"
            file={file}
            onFile={acceptFile}
            onClear={clearFile}
            hint="file JPG/JPEG"
            maxLabel="20 MB"
            accent="violet"
            disabled={loading}
            icon={<LuFileImage className="h-6 w-6" />}
          />
        </Field>

        <Field
          label="Accession Number (ACSN)"
          required
          hint="identifier ImagingStudy Satu Sehat"
          error={acsnErr}
        >
          <div className="relative">
            <LuTag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={acsn}
              onChange={(e) => {
                setAcsn(e.target.value);
                setAcsnErr(undefined);
              }}
              className={`${acsnErr ? inputErr : inputBase} pl-9 font-mono`}
              placeholder="Contoh: MR.221102.062"
              autoComplete="off"
              spellCheck={false}
              disabled={loading}
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tanggal Studi" hint="StudyDate">
            <div className="relative">
              <LuCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={studyDate}
                onChange={(e) => setStudyDate(e.target.value)}
                className={`${inputBase} pl-9`}
                disabled={loading}
              />
            </div>
          </Field>
          <Field label="Waktu Studi" hint="StudyTime">
            <div className="relative">
              <LuClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="time"
                value={studyTime}
                onChange={(e) => setStudyTime(e.target.value)}
                className={`${inputBase} pl-9`}
                disabled={loading}
              />
            </div>
          </Field>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Konversi gagal</p>
              <p className="mt-0.5 break-all text-[11px] text-red-600">{error}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            onClick={handleConvert}
            disabled={!file || loading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              !file || loading
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-violet-600 text-white shadow-sm shadow-violet-200 hover:bg-violet-700"
            }`}
          >
            {loading ? (
              <>
                <LuLoaderCircle className="h-4 w-4 animate-spin" />
                Mengkonversi…
              </>
            ) : (
              <>
                <LuScan className="h-4 w-4" />
                Konversi ke DICOM
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            title="Reset form"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <LuRotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Kolom kanan: pratinjau + output ── */}
      <div className="space-y-5">
        {/* Pratinjau gambar (viewer gaya radiologi) */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              <LuImage className="h-3.5 w-3.5" />
              Pratinjau
            </p>
            {dims && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                {dims.w} × {dims.h} px
              </span>
            )}
          </div>
          {previewUrl ? (
            <div className="bg-slate-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={file?.name ?? "Pratinjau"}
                onLoad={(e) =>
                  setDims({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                className="mx-auto max-h-[340px] w-auto object-contain"
              />
            </div>
          ) : (
            <EmptyState
              icon={<LuImage className="h-7 w-7" />}
              title="Belum ada gambar"
              desc="Pratinjau JPG akan muncul di sini setelah Anda memilih file."
            />
          )}
        </div>

        {/* Output */}
        {outputBlob && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
                <LuCircleCheck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-emerald-800">
                  Konversi berhasil!
                </p>
                <p className="truncate font-mono text-[11px] text-emerald-600">
                  {outputName} · {fmtSize(outputBlob.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => downloadBlob(outputBlob, outputName)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100"
              >
                <LuDownload className="h-3.5 w-3.5" />
                Unduh lagi
              </button>
            </div>
          </div>
        )}

        {/* Metadata yang dihasilkan */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
              <LuLayers className="h-3.5 w-3.5" />
              Metadata yang dihasilkan
            </p>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-600">
              Template CR Thorax PA
            </span>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {GEN_META.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-3 border-b border-slate-50 pb-2"
              >
                <span className="text-[11px] font-medium text-slate-400">{k}</span>
                <span className="truncate font-mono text-[11px] text-slate-700">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-400">
            <LuInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Accession Number, tanggal, dan waktu diambil dari form; sisanya
            mengikuti template baku modalitas CR.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Tab: Verifikasi
// ─────────────────────────────────────────────

const META_SECTIONS: {
  title: string;
  icon: React.ReactNode;
  keys: (keyof DicomMeta)[];
}[] = [
  {
    title: "Identifikasi Utama",
    icon: <LuTag className="h-3.5 w-3.5" />,
    keys: ["AccessionNumber", "StudyDate", "StudyTime", "StudyDescription"],
  },
  {
    title: "Modalitas & Anatomi",
    icon: <LuScan className="h-3.5 w-3.5" />,
    keys: ["Modality", "BodyPartExamined", "ViewPosition", "SeriesDescription"],
  },
  {
    title: "Instance UIDs",
    icon: <LuFileDigit className="h-3.5 w-3.5" />,
    keys: ["StudyInstanceUID", "SeriesInstanceUID", "SOPInstanceUID", "SOPClassUID"],
  },
  {
    title: "Perangkat",
    icon: <LuMonitor className="h-3.5 w-3.5" />,
    keys: ["Manufacturer", "ManufacturerModelName", "StationName", "InstitutionName"],
  },
  {
    title: "Piksel & Encoding",
    icon: <LuLayers className="h-3.5 w-3.5" />,
    keys: [
      "Rows",
      "Columns",
      "BitsAllocated",
      "SamplesPerPixel",
      "PhotometricInterpretation",
      "TransferSyntaxUID",
    ],
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
    if (!f.name.match(/\.dcm$/i)) {
      setError("Hanya file .dcm yang didukung.");
      return;
    }
    setFile(f);
    setError(null);
    setMeta(null);
  };

  const handleVerify = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMeta(null);
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
    setFile(null);
    setLoading(false);
    setMeta(null);
    setFileName("");
    setError(null);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
      {/* ── Kolom kiri: upload ── */}
      <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-100 text-sky-600">
            <LuScan className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-bold text-slate-800">Verifikasi DICOM</h3>
        </div>

        <p className="text-[12px] leading-relaxed text-slate-500">
          Unggah file <strong>.dcm</strong> hasil konversi untuk membaca metadata
          yang tersimpan — Accession Number, tanggal studi, modality, hingga UID.
        </p>

        <Field label="File DICOM" required hint=".dcm · maks 50 MB">
          <DropZone
            accept=".dcm"
            file={file}
            onFile={acceptFile}
            onClear={() => {
              setFile(null);
              setMeta(null);
              setError(null);
            }}
            hint="file .dcm"
            maxLabel="50 MB"
            accent="sky"
            disabled={loading}
            icon={<LuFileDigit className="h-6 w-6" />}
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
            <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-800">Verifikasi gagal</p>
              <p className="mt-0.5 break-all text-[11px] text-red-600">{error}</p>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleVerify}
            disabled={!file || loading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
              !file || loading
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-sky-600 text-white shadow-sm shadow-sky-200 hover:bg-sky-700"
            }`}
          >
            {loading ? (
              <>
                <LuLoaderCircle className="h-4 w-4 animate-spin" />
                Membaca…
              </>
            ) : (
              <>
                <LuScan className="h-4 w-4" />
                Baca Metadata
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            title="Reset"
            className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
          >
            <LuRotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Kolom kanan: hasil ── */}
      <div>
        {meta ? (
          <div className="space-y-4">
            {/* Header + ACSN highlight */}
            <div className="overflow-hidden rounded-2xl border border-violet-200 bg-linear-to-br from-violet-50 to-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-violet-100 bg-white/60 px-4 py-2.5">
                <LuCircleCheck className="h-4 w-4 text-emerald-500" />
                <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-600">
                  {fileName}
                </p>
              </div>
              <div className="flex items-end justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-violet-500">
                    Accession Number
                  </p>
                  <p
                    className={`truncate font-mono text-2xl font-bold ${
                      meta.AccessionNumber ? "text-violet-800" : "text-slate-300"
                    }`}
                  >
                    {meta.AccessionNumber ?? "—"}
                  </p>
                </div>
                {meta.AccessionNumber && (
                  <CopyButton value={meta.AccessionNumber} label="Salin" />
                )}
              </div>
            </div>

            {/* Sections grid */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {META_SECTIONS.map((section) => (
                <div
                  key={section.title}
                  className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm"
                >
                  <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-slate-500">
                    {section.icon}
                    <p className="text-[10px] font-bold uppercase tracking-widest">
                      {section.title}
                    </p>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {section.keys.map((key) => {
                      const val = meta[key];
                      const isUID = key.toLowerCase().includes("uid");
                      return (
                        <div
                          key={key}
                          className="group flex items-start justify-between gap-3 px-4 py-2.5"
                        >
                          <span className="min-w-28 shrink-0 text-[11px] font-medium text-slate-500">
                            {META_LABEL[key] ?? key}
                          </span>
                          <div className="flex min-w-0 items-center justify-end gap-1">
                            <span
                              className={`break-all text-right ${
                                val
                                  ? isUID
                                    ? "font-mono text-[10px] text-slate-600"
                                    : "text-[11px] font-semibold text-slate-800"
                                  : "text-[11px] text-slate-300"
                              }`}
                            >
                              {val ?? "—"}
                            </span>
                            {val && isUID && (
                              <span className="opacity-0 transition-opacity group-hover:opacity-100">
                                <CopyButton value={String(val)} />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full rounded-2xl border border-slate-100 bg-white shadow-sm">
            <EmptyState
              icon={<LuFileDigit className="h-7 w-7" />}
              title="Belum ada hasil"
              desc="Unggah file .dcm lalu klik “Baca Metadata” untuk menampilkan detail di sini."
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

type Tab = "convert" | "verify";

const TABS: { id: Tab; label: string; short: string; icon: React.ReactNode }[] = [
  { id: "convert", label: "Konversi JPG → DICOM", short: "Konversi", icon: <LuScan className="h-4 w-4" /> },
  { id: "verify", label: "Verifikasi DICOM", short: "Verifikasi", icon: <LuFileDigit className="h-4 w-4" /> },
];

export default function JpgToDicomPage() {
  const [activeTab, setActiveTab] = useState<Tab>("convert");

  return (
    <DashboardLayout
      title="Konversi DICOM"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Utilitas" },
        { label: "Konversi JPG → DICOM" },
      ]}
    >
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-200 bg-linear-to-br from-violet-100 to-purple-100 text-2xl shadow-sm">
              🩻
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Konversi DICOM</h1>
                <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-bold text-violet-700">
                  CR Thorax PA
                </span>
                <span className="rounded-full bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700">
                  DICOM 3.0
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                Konversi & verifikasi file DICOM untuk radiologi — Satu Sehat Integration
              </p>
            </div>
          </div>

          {/* Alur ringkas */}
          <div className="hidden items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-2.5 text-[11px] font-medium text-slate-500 shadow-sm md:flex">
            <span className="flex items-center gap-1.5">
              <LuFileImage className="h-3.5 w-3.5 text-violet-500" /> JPG
            </span>
            <LuArrowRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex items-center gap-1.5">
              <LuScan className="h-3.5 w-3.5 text-violet-500" /> Konversi
            </span>
            <LuArrowRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex items-center gap-1.5">
              <LuFileDigit className="h-3.5 w-3.5 text-sky-500" /> DICOM
            </span>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex w-full gap-1 rounded-2xl bg-slate-100 p-1 sm:w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all sm:flex-none ${
                activeTab === tab.id
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.short}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {activeTab === "convert" ? <ConvertTab /> : <VerifyTab />}
      </div>
    </DashboardLayout>
  );
}
