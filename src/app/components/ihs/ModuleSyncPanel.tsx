"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DateRangePicker from "./DateRangePicker";
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
  LuStickyNote,
  LuPencil,
  LuTrash2,
  LuUserRoundX,
  LuLayoutList,
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
  attempted: boolean;
  waitingRef: boolean;
  satuSehatId: string | null;
  cells: Cell[];
}

interface NoteCounts {
  total: number;
  merah: number;
  kuning: number;
  hijau: number;
  biru: number;
}
interface SyncResponse {
  keyLabel: string;
  columns: { label: string; type: string }[];
  summary: {
    total: number;
    terkirim: number;
    belum: number;
    siap: number;
    menunggu: number;
  };
  filter: SyncFilter;
  page: number;
  totalRows: number;
  totalPages: number;
  rows: Row[];
  createFromMaster?: boolean;
  dependsOnLabel?: string | null;
  detailBase?: string | null;
  notes?: Record<string, RowNoteApi>;
  noteCounts?: NoteCounts;
  noteFilter?: string;
  supportsDate?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
}
interface PayloadResponse {
  resourceType: string;
  payload: unknown;
  /** Field wajib yang kosong di sumber (hanya saat source=master). */
  missing?: string[];
}

type PayloadSource = "staging" | "master";

interface RowNoteApi {
  mark: string | null;
  note: string | null;
  nik: string | null;
  updatedAt: string;
}

// Penanda warna → kelas Tailwind (dot, tint baris, aksen).
const MARK_META: Record<
  string,
  { label: string; dot: string; row: string; chip: string }
> = {
  merah: {
    label: "Perlu koreksi",
    dot: "bg-red-500",
    row: "bg-red-50/70",
    chip: "bg-red-50 text-red-700 ring-red-200",
  },
  kuning: {
    label: "Ditinjau",
    dot: "bg-amber-500",
    row: "bg-amber-50/70",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  hijau: {
    label: "Selesai",
    dot: "bg-emerald-500",
    row: "bg-emerald-50/70",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  biru: {
    label: "Catatan",
    dot: "bg-blue-500",
    row: "bg-blue-50/70",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
  },
};
const MARK_ORDER = ["merah", "kuning", "hijau", "biru"] as const;

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
  const [noteFilter, setNoteFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal payload
  const [payloadKey, setPayloadKey] = useState<string | null>(null);
  const [payloadSource, setPayloadSource] = useState<PayloadSource>("staging");
  const [payloadData, setPayloadData] = useState<PayloadResponse | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Anotasi (catatan + mark warna) per baris
  const [notesMap, setNotesMap] = useState<Record<string, RowNoteApi>>({});
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [noteMark, setNoteMark] = useState<string>("");
  const [noteText, setNoteText] = useState<string>("");
  const [noteNik, setNoteNik] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(
    async (
      f: SyncFilter,
      p: number,
      nf: string,
      df: string | null,
      dt: string | null,
      signal?: AbortSignal,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const noteQs = nf ? `&note=${nf}` : "";
        const dateQs =
          (df ? `&from=${df}` : "") + (dt ? `&to=${dt}` : "");
        const res = await fetch(
          `/api/ihs/${module}?filter=${f}&page=${p}${noteQs}${dateQs}`,
          { credentials: "same-origin", signal },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal memuat data");
        setData(json as SyncResponse);
        setNotesMap((json as SyncResponse).notes ?? {});
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
    load(filter, page, noteFilter, dateFrom, dateTo, ctrl.signal);
    return () => ctrl.abort();
  }, [filter, page, noteFilter, dateFrom, dateTo, load]);

  const openPayload = useCallback(
    async (key: string, source: PayloadSource = "staging") => {
      setPayloadKey(key);
      setPayloadSource(source);
      setPayloadData(null);
      setPayloadError(null);
      setCopied(false);
      setPayloadLoading(true);
      try {
        const qs = source === "master" ? "?source=master" : "";
        const res = await fetch(
          `/api/ihs/${module}/${encodeURIComponent(key)}${qs}`,
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
    setNoteFilter("");
    setPage(1);
  };

  const changeNoteFilter = (nf: string) => {
    setNoteFilter((cur) => (cur === nf ? "" : nf));
    setPage(1);
  };

  const changeDate = (f: string | null, t: string | null) => {
    setDateFrom(f);
    setDateTo(t);
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

  const colCount = (data?.columns.length ?? 4) + 4;
  const supportsMaster = data?.createFromMaster ?? false;
  const supportsDate = data?.supportsDate ?? false;
  const dependsOnLabel = data?.dependsOnLabel ?? null;
  const detailBase = data?.detailBase ?? null;
  const noteCounts = data?.noteCounts;

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

  // ── Editor catatan ──
  const openNoteEditor = useCallback(
    (r: Row) => {
      const existing = notesMap[r.key];
      setNoteKey(r.key);
      setNoteMark(existing?.mark ?? "");
      setNoteText(existing?.note ?? "");
      const nikCell = r.cells.find((c) => c.label.toUpperCase() === "NIK");
      setNoteNik(existing?.nik ?? nikCell?.value ?? null);
      setNoteError(null);
    },
    [notesMap],
  );

  const submitNote = useCallback(
    async (clear = false) => {
      if (!noteKey) return;
      setNoteSaving(true);
      setNoteError(null);
      try {
        const res = await fetch(`/api/ihs/${module}/notes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            clear
              ? { key: noteKey, mark: "", note: "" }
              : { key: noteKey, mark: noteMark, note: noteText, nik: noteNik },
          ),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal menyimpan catatan");
        setNotesMap((m) => {
          const next = { ...m };
          if (json.note) next[noteKey] = json.note as RowNoteApi;
          else delete next[noteKey];
          return next;
        });
        setNoteKey(null);
      } catch (e) {
        setNoteError(e instanceof Error ? e.message : "Gagal menyimpan catatan");
      } finally {
        setNoteSaving(false);
      }
    },
    [noteKey, noteMark, noteText, noteNik, module],
  );

  useEffect(() => {
    if (!noteKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNoteKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [noteKey]);

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
              {summary.menunggu > 0 && (
                <span className="inline-flex items-center gap-1 text-orange-600">
                  <LuUserRoundX className="h-3.5 w-3.5" />
                  {fmt(summary.menunggu)} menunggu {dependsOnLabel ?? "ref"}
                </span>
              )}
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
                  onClick={() => load(filter, page, noteFilter, dateFrom, dateTo)}
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
                <div className="flex flex-wrap items-center gap-2">
                  {supportsDate && (
                    <DateRangePicker
                      from={dateFrom}
                      to={dateTo}
                      onChange={changeDate}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      load(filter, page, noteFilter, dateFrom, dateTo)
                    }
                    disabled={loading}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    <LuRefreshCw
                      className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                    />
                    Muat ulang
                  </button>
                </div>
              </div>

              {/* Filter catatan (warna) */}
              <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
                <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                  <LuStickyNote className="h-3.5 w-3.5" />
                  Catatan:
                </span>
                <button
                  type="button"
                  onClick={() => changeNoteFilter("ada")}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    noteFilter === "ada"
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  Ada catatan
                  <span className="tabular-nums opacity-80">
                    {fmt(noteCounts?.total ?? 0)}
                  </span>
                </button>
                {MARK_ORDER.map((m) => {
                  const active = noteFilter === m;
                  const meta = MARK_META[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => changeNoteFilter(m)}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold ring-1 transition-colors ${
                        active
                          ? meta.chip
                          : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50"
                      }`}
                      title={meta.label}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                      <span className="tabular-nums">
                        {fmt(noteCounts?.[m] ?? 0)}
                      </span>
                    </button>
                  );
                })}
                {noteFilter && (
                  <span className="ml-1 text-[11px] text-slate-400">
                    · menampilkan baris bercatatan
                  </span>
                )}
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
                      <th className="px-4 py-2.5 font-semibold">Catatan</th>
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
                      data.rows.map((r) => {
                        const noteFor = notesMap[r.key];
                        const tint = noteFor?.mark
                          ? (MARK_META[noteFor.mark]?.row ?? "")
                          : r.waitingRef
                            ? "bg-orange-50/50"
                            : r.attempted
                              ? "bg-amber-50/40"
                              : "";
                        return (
                        <tr
                          key={r.key}
                          className={`transition-colors hover:bg-slate-50/60 ${tint}`}
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
                            ) : r.waitingRef ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700"
                                title={`Belum bisa dikirim: ${dependsOnLabel ?? "referensi"} belum ada di Satu Sehat`}
                              >
                                <LuUserRoundX className="h-3 w-3" />
                                Menunggu {dependsOnLabel ?? "referensi"}
                              </span>
                            ) : r.attempted ? (
                              <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700"
                                title="Pernah di-POST tapi belum dapat id Satu Sehat"
                              >
                                <LuTriangleAlert className="h-3 w-3" />
                                Dikirim · tanpa ID
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
                          <td className="px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => openNoteEditor(r)}
                              className="inline-flex max-w-56 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-100"
                              title="Tamb/ubah catatan"
                            >
                              {noteFor && (noteFor.mark || noteFor.note) ? (
                                <>
                                  {noteFor.mark && (
                                    <span
                                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${MARK_META[noteFor.mark]?.dot ?? "bg-slate-400"}`}
                                    />
                                  )}
                                  <span className="truncate text-xs text-slate-600">
                                    {noteFor.note ??
                                      MARK_META[noteFor.mark ?? ""]?.label ??
                                      "—"}
                                  </span>
                                  <LuPencil className="h-3 w-3 shrink-0 text-slate-300" />
                                </>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-teal-600">
                                  <LuStickyNote className="h-3.5 w-3.5" />
                                  Catat
                                </span>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              {detailBase && (
                                <Link
                                  href={`${detailBase}/${encodeURIComponent(r.key)}`}
                                  title="Lihat rincian resource klinis pada kunjungan ini"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                >
                                  <LuLayoutList className="h-3.5 w-3.5" />
                                  Detail
                                </Link>
                              )}
                              {!r.sent && supportsMaster ? (
                                <button
                                  type="button"
                                  onClick={() => openPayload(r.key, "master")}
                                  title="Rakit payload dari data master & isikan ke form"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[11px] font-semibold text-teal-700 transition-colors hover:bg-teal-100"
                                >
                                  <LuWandSparkles className="h-3.5 w-3.5" />
                                  Salin ke form
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openPayload(r.key, "staging")}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                                >
                                  <LuCode className="h-3.5 w-3.5" />
                                  Payload
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })
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
              {payloadData?.missing && payloadData.missing.length > 0 ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700">
                  <LuTriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  Field wajib kosong: {payloadData.missing.join(", ")} — lengkapi di form
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  {payloadSource === "master"
                    ? "Dirakit dari master SIMGOS · tinjau sebelum POST manual"
                    : "Draft dari SIMGOS · tinjau sebelum dikirim"}
                </p>
              )}
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
      {/* Modal catatan */}
      {noteKey && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setNoteKey(null)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Catatan baris"
            className="relative flex w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <LuStickyNote className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800">Catatan</p>
                  <p className="truncate font-mono text-[11px] text-slate-400">
                    {data?.keyLabel ?? "Ref"}: {noteKey}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteKey(null)}
                aria-label="Tutup"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <LuX className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Penanda warna
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNoteMark("")}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      noteMark === ""
                        ? "border-slate-400 bg-slate-100 text-slate-700"
                        : "border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full border border-slate-300 bg-white" />
                    Tanpa
                  </button>
                  {MARK_ORDER.map((m) => {
                    const meta = MARK_META[m];
                    const active = noteMark === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNoteMark(m)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? `border-transparent ring-1 ${meta.chip}`
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-500">
                  Catatan
                </p>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="mis. NIK salah rekam — pasien sudah ada di Satu Sehat dgn NIK benar; perlu koreksi di pendaftaran."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 transition-all focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                />
              </div>

              {noteError && (
                <p className="wrap-break-word text-xs text-red-600">{noteError}</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => submitNote(true)}
                disabled={noteSaving || !notesMap[noteKey]}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
              >
                <LuTrash2 className="h-3.5 w-3.5" />
                Hapus
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNoteKey(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => submitNote(false)}
                  disabled={noteSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-linear-to-r from-teal-600 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50"
                >
                  {noteSaving ? "Menyimpan…" : "Simpan"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
