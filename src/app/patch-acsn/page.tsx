"use client";

import { useState, useRef, useCallback } from "react";
import {
  LuUpload,
  LuFileDigit,
  LuFileSearch,
  LuX,
  LuCopy,
  LuCheck,
  LuDownload,
  LuRotateCcw,
  LuLoaderCircle,
  LuCircleCheck,
  LuCircleAlert,
  LuArrowRight,
  LuArrowRightLeft,
  LuTag,
  LuFileText,
  LuPencil,
  LuInfo,
} from "react-icons/lu";
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
  "w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-4 focus:ring-orange-400/15 focus:border-orange-400 transition-all duration-150";
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

function CopyButton({ value }: { value: string }) {
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
      className="inline-flex shrink-0 items-center rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
    >
      {copied ? (
        <LuCheck className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <LuCopy className="h-3.5 w-3.5" />
      )}
    </button>
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
      className={`group relative rounded-2xl border-2 border-dashed transition-all duration-150 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${
        dragOver
          ? "scale-[1.01] border-orange-400 bg-orange-50"
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
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <LuCircleCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {file.name}
            </p>
            <p className="text-[11px] text-slate-400">{fmtSize(file.size)}</p>
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
            className={`grid h-12 w-12 place-items-center rounded-2xl shadow-sm transition-colors ${
              dragOver
                ? "bg-orange-100 text-orange-500"
                : "bg-white text-slate-400 group-hover:text-slate-500"
            }`}
          >
            {dragOver ? (
              <LuUpload className="h-6 w-6" />
            ) : (
              <LuFileDigit className="h-6 w-6" />
            )}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-600">
              {dragOver ? "Lepaskan di sini" : "Klik untuk pilih file"}
            </p>
            <p className="text-[11px] text-slate-400">
              atau drag &amp; drop file .dcm · maks 50 MB
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

/** Baris metadata saat ini — highlight merah bila KOSONG, tombol salin bila ada. */
function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const empty = !value;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="shrink-0 text-[11px] font-medium text-slate-500">
        {label}
      </span>
      {empty ? (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
          KOSONG
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate text-right font-mono text-[11px] text-slate-700">
            {value}
          </span>
          <CopyButton value={String(value)} />
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────

export default function PatchAcsnPage() {
  const [file, setFile] = useState<File | null>(null);
  const [acsn, setAcsn] = useState("");
  const [acsnErr, setAcsnErr] = useState<string | undefined>();
  const [studyDesc, setStudyDesc] = useState("");

  const [checking, setChecking] = useState(false);
  const [curMeta, setCurMeta] = useState<DicomMeta | null>(null);
  const [metaErr, setMetaErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
  const [outputName, setOutputName] = useState("");

  const verifyCurrent = async (f: File) => {
    setChecking(true);
    setCurMeta(null);
    setMetaErr(null);
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
    if (!f.name.match(/\.dcm$/i)) {
      setPatchErr("Hanya file .dcm yang didukung.");
      return;
    }
    setFile(f);
    setPatchErr(null);
    setOutputBlob(null);
    setCurMeta(null);
    verifyCurrent(f);
  };

  const handlePatch = async () => {
    if (!acsn.trim()) {
      setAcsnErr("Accession Number wajib diisi");
      return;
    }
    if (!file) return;
    setLoading(true);
    setPatchErr(null);
    setOutputBlob(null);

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
      setOutputBlob(blob);
      setOutputName(outName);
      downloadBlob(blob, outName);
    } catch (err) {
      setPatchErr(err instanceof Error ? err.message : "Patch gagal");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setAcsn("");
    setAcsnErr(undefined);
    setStudyDesc("");
    setChecking(false);
    setCurMeta(null);
    setMetaErr(null);
    setLoading(false);
    setPatchErr(null);
    setOutputBlob(null);
  };

  // Ringkasan perubahan (live)
  const curAcsn = curMeta?.AccessionNumber ?? "";
  const newAcsn = acsn.trim();
  const acsnChange = !curAcsn && newAcsn ? "add" : curAcsn !== newAcsn ? "change" : "same";

  return (
    <DashboardLayout
      title="Patch ACSN"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Utilitas" },
        { label: "Patch ACSN" },
      ]}
    >
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-orange-200 bg-linear-to-br from-orange-100 to-amber-100 text-2xl shadow-sm">
              ✏️
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Patch ACSN</h1>
                <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold text-orange-700">
                  AccessionNumber
                </span>
                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
                  DICOM 3.0
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                Tambah atau ubah Accession Number pada file .dcm yang sudah ada
              </p>
            </div>
          </div>

          {/* Alur ringkas */}
          <div className="hidden items-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 py-2.5 text-[11px] font-medium text-slate-500 shadow-sm md:flex">
            <span className="flex items-center gap-1.5">
              <LuFileSearch className="h-3.5 w-3.5 text-orange-500" /> Baca
            </span>
            <LuArrowRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex items-center gap-1.5">
              <LuPencil className="h-3.5 w-3.5 text-orange-500" /> Patch
            </span>
            <LuArrowRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex items-center gap-1.5">
              <LuDownload className="h-3.5 w-3.5 text-emerald-500" /> Unduh
            </span>
          </div>
        </div>

        {/* ── Content: dua kolom ── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Kolom kiri: unggah & edit */}
          <div className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-100 text-[13px] font-bold text-orange-600">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-800">Unggah &amp; Edit</h3>
            </div>

            <Field
              label="File DICOM"
              required
              hint=".dcm · maks 50 MB"
              error={patchErr && !file ? patchErr : undefined}
            >
              <DropZone
                file={file}
                onFile={acceptFile}
                onClear={handleReset}
                disabled={loading}
              />
            </Field>

            <Field
              label="Accession Number Baru"
              required
              hint="di-embed ke dalam file .dcm"
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
                  placeholder="Contoh: RAD2604201001"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading || checking}
                />
              </div>
            </Field>

            <Field
              label="Study Description"
              hint="opsional — isi untuk mengubah/menambah"
            >
              <div className="relative">
                <LuFileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={studyDesc}
                  onChange={(e) => setStudyDesc(e.target.value)}
                  className={`${inputBase} pl-9`}
                  placeholder="Contoh: Thorax PA"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading || checking}
                />
              </div>
            </Field>

            {patchErr && file && (
              <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
                <LuCircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Patch gagal</p>
                  <p className="mt-0.5 break-all text-[11px] text-red-600">
                    {patchErr}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-0.5">
              <button
                type="button"
                onClick={handlePatch}
                disabled={!file || loading || checking}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  !file || loading || checking
                    ? "cursor-not-allowed bg-slate-100 text-slate-400"
                    : "bg-orange-600 text-white shadow-sm shadow-orange-200 hover:bg-orange-700"
                }`}
              >
                {loading ? (
                  <>
                    <LuLoaderCircle className="h-4 w-4 animate-spin" />
                    Memproses…
                  </>
                ) : (
                  <>
                    <LuPencil className="h-4 w-4" />
                    Patch &amp; Unduh
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

          {/* Kolom kanan: metadata & perubahan */}
          <div className="space-y-5">
            {!file ? (
              <div className="h-full rounded-2xl border border-slate-100 bg-white shadow-sm">
                <EmptyState
                  icon={<LuFileSearch className="h-7 w-7" />}
                  title="Belum ada file"
                  desc="Unggah file .dcm — metadata saat ini akan dibaca otomatis dan ditampilkan di sini."
                />
              </div>
            ) : (
              <>
                {/* Perubahan (before → after) */}
                <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5 text-slate-500">
                    <LuArrowRightLeft className="h-3.5 w-3.5" />
                    <p className="text-[11px] font-bold uppercase tracking-widest">
                      Ringkasan Perubahan
                    </p>
                  </div>
                  <div className="space-y-3 p-4">
                    {/* ACSN */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="w-28 shrink-0 text-[11px] font-semibold text-slate-500">
                        Accession No.
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span
                          className={`min-w-0 flex-1 truncate rounded-lg border px-2.5 py-1.5 font-mono text-[12px] ${
                            curAcsn
                              ? "border-slate-200 bg-slate-50 text-slate-500 line-through"
                              : "border-red-100 bg-red-50 text-red-400"
                          }`}
                        >
                          {curAcsn || "kosong"}
                        </span>
                        <LuArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                        <span
                          className={`min-w-0 flex-1 truncate rounded-lg border px-2.5 py-1.5 font-mono text-[12px] font-semibold ${
                            newAcsn
                              ? "border-orange-200 bg-orange-50 text-orange-700"
                              : "border-slate-200 bg-white text-slate-300"
                          }`}
                        >
                          {newAcsn || "—"}
                        </span>
                      </div>
                    </div>
                    {/* Badge status */}
                    <div className="flex items-center gap-2 pl-0 sm:pl-[7.75rem]">
                      {acsnChange === "add" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                          <LuCircleCheck className="h-3 w-3" /> Menambahkan ACSN baru
                        </span>
                      )}
                      {acsnChange === "change" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                          <LuPencil className="h-3 w-3" /> Mengubah ACSN
                        </span>
                      )}
                      {acsnChange === "same" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                          Tidak ada perubahan
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Metadata saat ini */}
                <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                      <LuFileSearch className="h-3.5 w-3.5" />
                      Metadata Saat Ini
                    </p>
                    {checking && (
                      <LuLoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-400" />
                    )}
                  </div>
                  {checking ? (
                    <div className="space-y-2 p-4">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="h-3 animate-pulse rounded bg-slate-100"
                          style={{ width: `${70 - i * 8}%` }}
                        />
                      ))}
                    </div>
                  ) : metaErr ? (
                    <p className="px-4 py-3 text-[11px] text-red-600">{metaErr}</p>
                  ) : curMeta ? (
                    <div className="divide-y divide-slate-50">
                      <MetaRow label="Accession Number" value={curMeta.AccessionNumber} />
                      <MetaRow label="Study Description" value={curMeta.StudyDescription} />
                      <MetaRow label="Study Date" value={curMeta.StudyDate} />
                      <MetaRow label="Modality" value={curMeta.Modality} />
                      <MetaRow label="Body Part" value={curMeta.BodyPartExamined} />
                      <MetaRow label="Study Instance UID" value={curMeta.StudyInstanceUID} />
                    </div>
                  ) : null}
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
                          Patch berhasil!
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
                    <p className="mt-2.5 flex items-start gap-1.5 border-t border-emerald-200/60 pt-2.5 text-[11px] leading-relaxed text-emerald-700">
                      <LuInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Verifikasi hasil di halaman <strong>Konversi DICOM →
                      Verifikasi DICOM</strong>.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
