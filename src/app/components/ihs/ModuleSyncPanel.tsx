"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  LuCircleX,
  LuWandSparkles,
  LuStickyNote,
  LuPencil,
  LuTrash2,
  LuUserRoundX,
  LuLayoutList,
  LuListChecks,
  LuSearch,
  LuZap,
  LuWrench,
} from "react-icons/lu";

type SyncFilter = "semua" | "terkirim" | "belum" | "siap";

// Label ramah untuk field yang dilengkapi otomatis server-side (enriched).
const ENRICHED_LABEL: Record<string, string> = {
  subject: "Pasien (subject)",
  patient: "Pasien (patient)",
  participant: "DPJP (participant)",
  encounter: "Encounter (ranap)",
};

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
  waitingFor?: string[];
  satuSehatId: string | null;
  reputDone?: boolean;
  cells: Cell[];
  hint?: { name?: string; nik?: string };
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
  searchLabel?: string;
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
  dependsOnLabels?: string[];
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
  /** Field yang dilengkapi otomatis server-side (mis. Encounter.participant/DPJP). */
  enriched?: string[];
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

/** Status satu baris dalam antrian kirim otomatis. */
type QueueState = "pending" | "sending" | "ok" | "fail";

function QueueStatusBadge({ state }: { state: QueueState }) {
  if (state === "sending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
        <LuRefreshCw className="h-3 w-3 animate-spin" />
        Mengirim…
      </span>
    );
  if (state === "ok")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
        <LuCircleCheck className="h-3 w-3" />
        Terkirim
      </span>
    );
  if (state === "fail")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
        <LuCircleX className="h-3 w-3" />
        Gagal
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
      <LuClock className="h-3 w-3" />
      Antre
    </span>
  );
}

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
  enableQueue = false,
  enableKeySearch = false,
  enableLabRebuild = false,
}: {
  module: string;
  title?: string;
  defaultOpen?: boolean;
  /**
   * Dipanggil saat user menekan "Autofill ke form" pada modal payload. `source`
   * membawa identitas baris staging (module+key) agar halaman bisa meneruskannya
   * sebagai query-param POST → server write-back id/subject/encounter ke baris itu.
   */
  onUsePayload?: (
    payload: unknown,
    resourceType: string,
    source?: { module: string; key: string },
  ) => void;
  /**
   * Aktifkan tombol "Kirim Antrian": POST berurutan semua baris HALAMAN ini
   * yang siap (belum terkirim & tidak menunggu referensi), langsung + write-back
   * di server. Baris "Menunggu <ref>" & sudah terkirim otomatis dilewati.
   */
  enableQueue?: boolean;
  /** Aktifkan kotak pencarian berdasarkan key (mis. No. Pendaftaran = refId). */
  enableKeySearch?: boolean;
  /**
   * Aktifkan tombol "Perbaiki LOINC" pada baris LAB (jenis=6) belum-terkirim:
   * rakit ulang code + nilai + interpretation dari peta LOINC kita lalu
   * WRITE-BACK ke `kemkes-ihs.observation` (UPDATE by refId) agar bisa dikirim.
   */
  enableLabRebuild?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [filter, setFilter] = useState<SyncFilter>("semua");
  const [noteFilter, setNoteFilter] = useState<string>("");
  // Sub-filter jenis observasi: "" (semua), "lab" (jenis=6), "ttv" (≠6).
  const [jenis, setJenis] = useState<"" | "lab" | "ttv">("");
  // LAB: sembunyikan baris yang kodenya sudah diperbaiki (PUT sukses).
  const [hideDone, setHideDone] = useState(false);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState(""); // teks di kotak cari
  const [keyQuery, setKeyQuery] = useState(""); // kata kunci yang diterapkan
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SyncResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tooltip "calon pasien" (nama + NIK) untuk baris Menunggu Patient.
  // Dibuka dengan KLIK (pinned) agar tidak langsung tertutup → NIK bisa disalin.
  const [pinnedHint, setPinnedHint] = useState<{
    key: string;
    name?: string;
    nik?: string;
    top: number;
    left: number;
  } | null>(null);
  const [hintCopied, setHintCopied] = useState(false);
  const hintPopRef = useRef<HTMLDivElement>(null);

  // Tutup tooltip pinned saat klik di luar (bukan popover & bukan pemicu) / Escape.
  useEffect(() => {
    setHintCopied(false);
    if (!pinnedHint) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (hintPopRef.current?.contains(t)) return; // klik di dalam popover
      if (t instanceof Element && t.closest("[data-hint-trigger]")) return; // biar onClick pemicu yang menoggle
      setPinnedHint(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedHint(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinnedHint]);

  const copyHintNik = async () => {
    if (!pinnedHint?.nik) return;
    try {
      await navigator.clipboard.writeText(pinnedHint.nik);
      setHintCopied(true);
      setTimeout(() => setHintCopied(false), 1200);
    } catch {
      /* abaikan kegagalan clipboard */
    }
  };

  // Modal payload
  const [payloadKey, setPayloadKey] = useState<string | null>(null);
  const [payloadSource, setPayloadSource] = useState<PayloadSource>("staging");
  const [payloadData, setPayloadData] = useState<PayloadResponse | null>(null);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Perbaiki LOINC (rakit ulang + write-back SIMGOS) per baris LAB.
  const [rebuildingKey, setRebuildingKey] = useState<string | null>(null);
  const [rebuildMsg, setRebuildMsg] = useState<{
    key: string;
    ok: boolean;
    text: string;
  } | null>(null);

  // Antrian kirim otomatis (send queue)
  const [queueRunning, setQueueRunning] = useState(false);
  const [queueArmed, setQueueArmed] = useState(false);
  const [queueResults, setQueueResults] = useState<Record<string, QueueState>>({});
  const [queueSummary, setQueueSummary] = useState<{
    ok: number;
    fail: number;
    total: number;
  } | null>(null);
  const queueStopRef = useRef(false);

  // Auto-kirim: antrian KONTINU lintas halaman + backoff saat kena rate limit.
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoArmed, setAutoArmed] = useState(false);
  const [autoStats, setAutoStats] = useState({ ok: 0, fail: 0 });
  const [autoWait, setAutoWait] = useState<number | null>(null); // detik sisa jeda
  const [autoWaitReason, setAutoWaitReason] = useState<"limit" | "batch" | null>(
    null,
  );
  const [autoSummary, setAutoSummary] = useState<{ ok: number; fail: number } | null>(
    null,
  );
  const autoStopRef = useRef(false);

  // Re-PUT retroaktif: perbaiki Observation LAB yang SUDAH terkirim (kode salah
  // 11477-7) dengan payload rakit-ulang. Kontinu lintas halaman, sadar rate limit.
  const [rePutRunning, setRePutRunning] = useState(false);
  const [rePutArmed, setRePutArmed] = useState(false);
  const [rePutStats, setRePutStats] = useState({ ok: 0, fail: 0, skip: 0 });
  const [rePutSummary, setRePutSummary] = useState<{
    ok: number;
    fail: number;
    skip: number;
  } | null>(null);
  const rePutStopRef = useRef(false);

  // Reconcile SIMGOS: sesuaikan baris LAB (masih 11477-7) dengan katalog LOINC
  // lalu tulis-balik ke SIMGOS agar staging KONSISTEN — dijalankan SEBELUM PUT.
  // Hanya menyentuh SIMGOS (tanpa Satu Sehat), jadi cepat & tanpa batas kirim.
  const [reconRunning, setReconRunning] = useState(false);
  const [reconArmed, setReconArmed] = useState(false);
  const [reconStats, setReconStats] = useState({ scanned: 0, updated: 0 });
  const [reconSummary, setReconSummary] = useState<{
    scanned: number;
    updated: number;
  } | null>(null);
  const reconStopRef = useRef(false);

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
      kq: string,
      signal?: AbortSignal,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const noteQs = nf ? `&note=${nf}` : "";
        const dateQs =
          (df ? `&from=${df}` : "") + (dt ? `&to=${dt}` : "");
        const keyQs = kq ? `&key=${encodeURIComponent(kq)}` : "";
        const jenisQs = jenis ? `&jenis=${jenis}` : "";
        const res = await fetch(
          `/api/ihs/${module}?filter=${f}&page=${p}${noteQs}${dateQs}${keyQs}${jenisQs}`,
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
    [module, jenis],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(filter, page, noteFilter, dateFrom, dateTo, keyQuery, ctrl.signal);
    return () => ctrl.abort();
  }, [filter, page, noteFilter, dateFrom, dateTo, keyQuery, load]);

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

  // Rakit ulang Observation LAB (code+nilai+interpretation) & write-back ke
  // SIMGOS by refId, lalu muat ulang halaman agar kolom ter-refresh.
  const rebuildLab = useCallback(
    async (key: string) => {
      setRebuildingKey(key);
      setRebuildMsg(null);
      try {
        const res = await fetch(
          `/api/ihs/${module}/${encodeURIComponent(key)}/rebuild`,
          { method: "POST", credentials: "same-origin" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Gagal rakit ulang");
        setRebuildMsg({
          key,
          ok: true,
          text: `${json.codeDisplay ?? "OK"}${json.valueDisplay ? " · " + json.valueDisplay : ""}`,
        });
        await load(filter, page, noteFilter, dateFrom, dateTo, keyQuery);
      } catch (e) {
        setRebuildMsg({
          key,
          ok: false,
          text: e instanceof Error ? e.message : "Gagal",
        });
      } finally {
        setRebuildingKey(null);
      }
    },
    [module, load, filter, page, noteFilter, dateFrom, dateTo, keyQuery],
  );

  useEffect(() => {
    if (!payloadKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPayloadKey(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [payloadKey]);

  // Kontrol yang memicu muat-ulang dikunci selama auto-kirim/antrian berjalan
  // (agar tidak balapan dengan loop pengiriman yang meng-setData langsung).
  const busy = autoRunning || queueRunning || rePutRunning || reconRunning;

  const changeFilter = (f: SyncFilter) => {
    if (busy) return;
    setFilter(f);
    setNoteFilter("");
    setPage(1);
  };

  const changeJenis = (v: "" | "lab" | "ttv") => {
    if (busy) return;
    setJenis(v);
    setPage(1);
  };

  const changeNoteFilter = (nf: string) => {
    if (busy) return;
    setNoteFilter((cur) => (cur === nf ? "" : nf));
    setPage(1);
  };

  const changeDate = (f: string | null, t: string | null) => {
    if (busy) return;
    setDateFrom(f);
    setDateTo(t);
    setPage(1);
  };

  const applyKeySearch = () => {
    if (busy) return;
    setNoteFilter(""); // pencarian key diprioritaskan atas filter catatan
    setPage(1);
    setKeyQuery(keyInput.trim());
  };

  const clearKeySearch = () => {
    if (busy) return;
    setKeyInput("");
    setKeyQuery("");
    setPage(1);
  };

  const summary = data?.summary;
  const rangeStart =
    data && data.totalRows > 0 ? (data.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd =
    data && data.totalRows > 0 ? rangeStart + data.rows.length - 1 : 0;

  // Baris yang ditampilkan: sembunyikan yang sudah diperbaiki bila diminta
  // (khusus tampilan LAB). Tak mengubah paginasi/hitungan server.
  const displayRows =
    data && hideDone && jenis === "lab"
      ? data.rows.filter((r) => !r.reputDone)
      : (data?.rows ?? []);

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
  // Gabungan label semua dependensi (mis. "Medication / Encounter") untuk header.
  const dependsOnAll =
    data?.dependsOnLabels && data.dependsOnLabels.length
      ? data.dependsOnLabels.join(" / ")
      : dependsOnLabel;
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
      onUsePayload(payloadData.payload, payloadData.resourceType, {
        module,
        key: payloadKey ?? "",
      });
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

  // ── Antrian kirim otomatis ──
  const stopQueue = useCallback(() => {
    queueStopRef.current = true;
  }, []);

  const runQueue = useCallback(async () => {
    if (!data || queueRunning) return;
    // Eligible = baris halaman ini yang belum terkirim & TIDAK menunggu
    // referensi (mis. "Menunggu Patient" dilewati). Data problematik diabaikan.
    const eligible = data.rows.filter((r) => !r.sent && !r.waitingRef);
    if (eligible.length === 0) return;

    queueStopRef.current = false;
    setQueueArmed(false);
    setQueueRunning(true);
    setQueueSummary(null);
    setQueueResults(
      Object.fromEntries(eligible.map((r) => [r.key, "pending" as QueueState])),
    );

    let ok = 0;
    let fail = 0;
    for (const r of eligible) {
      if (queueStopRef.current) break;
      setQueueResults((s) => ({ ...s, [r.key]: "sending" }));
      try {
        // 1. Rakit payload dari baris SIMGOS (read-only).
        const pres = await fetch(
          `/api/ihs/${module}/${encodeURIComponent(r.key)}`,
          { credentials: "same-origin" },
        );
        const pjson = await pres.json();
        if (!pres.ok) throw new Error(pjson?.error ?? "payload gagal");
        const resourceType = String(pjson.resourceType);

        // 2. POST ke Satu Sehat (server melakukan write-back id / catatan gagal).
        //    module+key diteruskan agar server bisa write-back id/subject/
        //    encounter ke baris staging klinis yang tepat.
        const sres = await fetch(
          `/api/fhir/${encodeURIComponent(resourceType)}?module=${encodeURIComponent(module)}&key=${encodeURIComponent(r.key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(pjson.payload),
          },
        );
        await sres.text().catch(() => null);

        if (sres.ok) {
          ok++;
          setQueueResults((s) => ({ ...s, [r.key]: "ok" }));
        } else {
          fail++;
          setQueueResults((s) => ({ ...s, [r.key]: "fail" }));
        }
      } catch {
        fail++;
        setQueueResults((s) => ({ ...s, [r.key]: "fail" }));
      }
      // Jeda kecil — ramah rate-limit & agar progres terlihat.
      await new Promise((res) => setTimeout(res, 250));
    }

    setQueueSummary({ ok, fail, total: eligible.length });
    setQueueRunning(false);
    // Muat ulang status otoritatif (terkirim → Terkirim, gagal → catatan kuning).
    await load(filter, page, noteFilter, dateFrom, dateTo, keyQuery);
    setQueueResults({});
  }, [data, queueRunning, module, load, filter, page, noteFilter, dateFrom, dateTo]);

  // ── Auto-kirim (kontinu lintas halaman, sadar rate limit) ──
  const stopAuto = useCallback(() => {
    autoStopRef.current = true;
  }, []);

  const autoSend = useCallback(async () => {
    if (autoRunning || queueRunning) return;
    autoStopRef.current = false;
    setAutoArmed(false);
    setAutoRunning(true);
    setAutoSummary(null);
    setAutoStats({ ok: 0, fail: 0 });

    // Snapshot filter aktif (kontrol dinonaktifkan selama berjalan).
    const f = filter,
      nf = noteFilter,
      df = dateFrom,
      dt = dateTo,
      kq = keyQuery;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Hitung mundur jeda (detik), tampil di UI. Return false bila dihentikan.
    const countdown = async (
      secs: number,
      reason: "limit" | "batch",
    ): Promise<boolean> => {
      for (let s = secs; s > 0; s--) {
        if (autoStopRef.current) {
          setAutoWait(null);
          setAutoWaitReason(null);
          return false;
        }
        setAutoWait(s);
        setAutoWaitReason(reason);
        await sleep(1000);
      }
      setAutoWait(null);
      setAutoWaitReason(null);
      return true;
    };

    // Tunggu sampai rate limit reset (pakai header Retry-After).
    const backoff = async (res: Response): Promise<boolean> => {
      const raw = Number(res.headers.get("Retry-After"));
      let secs = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
      secs = Math.min(secs, 120) + 1; // batasi + buffer 1 dtk
      return countdown(secs, "limit");
    };

    // Kirim satu baris; ulangi baris yang sama bila kena 429 (setelah backoff).
    const sendOne = async (
      key: string,
    ): Promise<"ok" | "fail" | "stopped"> => {
      for (;;) {
        if (autoStopRef.current) return "stopped";
        let pres: Response;
        try {
          pres = await fetch(`/api/ihs/${module}/${encodeURIComponent(key)}`, {
            credentials: "same-origin",
          });
        } catch {
          return "fail";
        }
        if (pres.status === 429) {
          if (!(await backoff(pres))) return "stopped";
          continue;
        }
        let pjson: { resourceType?: string; payload?: unknown };
        try {
          pjson = await pres.json();
        } catch {
          return "fail";
        }
        if (!pres.ok || !pjson.resourceType) return "fail";
        let sres: Response;
        try {
          sres = await fetch(
            `/api/fhir/${encodeURIComponent(pjson.resourceType)}?module=${encodeURIComponent(module)}&key=${encodeURIComponent(key)}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              credentials: "same-origin",
              body: JSON.stringify(pjson.payload),
            },
          );
        } catch {
          return "fail";
        }
        if (sres.status === 429) {
          if (!(await backoff(sres))) return "stopped";
          continue;
        }
        await sres.text().catch(() => null);
        return sres.ok ? "ok" : "fail";
      }
    };

    let ok = 0,
      fail = 0,
      processed = 0, // total entri terkirim (ok+gagal) untuk jeda tiap 100
      p = 1,
      guard = 0;
    const MAX_LOOPS = 10000; // pengaman anti-loop tak berujung
    const BATCH_PAUSE_EVERY = 100; // jeda 1 menit tiap 100 entri
    const BATCH_PAUSE_SECS = 60;
    // Baris yang GAGAL (respons ≠ 2xx / error) TIDAK di-write-back → tetap
    // `!sent`, jadi akan muncul lagi saat muat ulang. Catat & LEWATI agar tidak
    // dikirim berulang tanpa henti (skip on fail). Reset tiap run baru.
    const failedKeys = new Set<string>();

    try {
      while (!autoStopRef.current && guard++ < MAX_LOOPS) {
        // Ambil satu halaman (GET juga kena rate limit → backoff).
        const noteQs = nf ? `&note=${nf}` : "";
        const dateQs = (df ? `&from=${df}` : "") + (dt ? `&to=${dt}` : "");
        const keyQs = kq ? `&key=${encodeURIComponent(kq)}` : "";
        let resp: SyncResponse;
        try {
          const res = await fetch(
            `/api/ihs/${module}?filter=${f}&page=${p}${noteQs}${dateQs}${keyQs}`,
            { credentials: "same-origin" },
          );
          if (res.status === 429) {
            if (!(await backoff(res))) break;
            continue;
          }
          const json = await res.json();
          if (!res.ok) break;
          resp = json as SyncResponse;
        } catch {
          break;
        }

        setData(resp);
        setNotesMap(resp.notes ?? {});
        const eligible = resp.rows.filter(
          (r) => !r.sent && !r.waitingRef && !failedKeys.has(r.key),
        );

        if (eligible.length > 0) {
          setQueueResults(
            Object.fromEntries(
              eligible.map((r) => [r.key, "pending" as QueueState]),
            ),
          );
          for (const r of eligible) {
            if (autoStopRef.current) break;
            setQueueResults((s) => ({ ...s, [r.key]: "sending" }));
            const outcome = await sendOne(r.key);
            if (outcome === "stopped") break;
            if (outcome === "ok") {
              ok++;
              setQueueResults((s) => ({ ...s, [r.key]: "ok" }));
            } else {
              fail++;
              failedKeys.add(r.key); // gagal → lewati di iterasi berikutnya
              setQueueResults((s) => ({ ...s, [r.key]: "fail" }));
            }
            setAutoStats({ ok, fail });
            processed++;
            // Jeda 1 menit tiap 100 entri terkirim (ramah beban server).
            if (processed % BATCH_PAUSE_EVERY === 0) {
              if (!(await countdown(BATCH_PAUSE_SECS, "batch"))) break;
            } else {
              await sleep(120); // pacing kecil
            }
          }
          // Muat ulang halaman yang sama: baris terkirim rontok (filter belum/
          // siap) atau jadi ineligible (semua) → iterasi berikut menilai ulang.
          continue;
        }
        // Tak ada yang eligible di halaman ini → maju halaman, atau selesai.
        if (p < resp.totalPages) {
          p++;
          continue;
        }
        break;
      }
    } finally {
      setAutoRunning(false);
      setAutoWait(null);
      setAutoWaitReason(null);
      setQueueResults({});
      setAutoSummary({ ok, fail });
      // Kembalikan tampilan normal + hitungan otoritatif (page 1).
      setPage(1);
      await load(f, 1, nf, df, dt, kq);
    }
  }, [
    autoRunning,
    queueRunning,
    module,
    load,
    filter,
    noteFilter,
    dateFrom,
    dateTo,
    keyQuery,
  ]);

  // ── Re-PUT retroaktif: perbaiki Observation LAB yang SUDAH terkirim ──
  const stopRePut = useCallback(() => {
    rePutStopRef.current = true;
  }, []);

  const rePutSend = useCallback(async () => {
    if (rePutRunning || autoRunning || queueRunning) return;
    rePutStopRef.current = false;
    setRePutArmed(false);
    setRePutRunning(true);
    setRePutSummary(null);
    setRePutStats({ ok: 0, fail: 0, skip: 0 });
    // Selaraskan tampilan: hanya baris LAB yang sudah terkirim.
    setFilter("terkirim");
    setNoteFilter("");
    setPage(1);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const countdown = async (
      secs: number,
      reason: "limit" | "batch",
    ): Promise<boolean> => {
      for (let s = secs; s > 0; s--) {
        if (rePutStopRef.current) {
          setAutoWait(null);
          setAutoWaitReason(null);
          return false;
        }
        setAutoWait(s);
        setAutoWaitReason(reason);
        await sleep(1000);
      }
      setAutoWait(null);
      setAutoWaitReason(null);
      return true;
    };
    const backoff = async (res: Response): Promise<boolean> => {
      const raw = Number(res.headers.get("Retry-After"));
      let secs = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
      secs = Math.min(secs, 120) + 1;
      return countdown(secs, "limit");
    };

    // Re-PUT satu baris terkirim: rakit ulang payload → PUT. "skip" bila tak ada
    // koreksi kode (parameter belum dipetakan / tanpa nilai valid).
    const rePutOne = async (
      r: Row,
    ): Promise<"ok" | "fail" | "skip" | "stopped"> => {
      if (!r.satuSehatId) return "skip";
      for (;;) {
        if (rePutStopRef.current) return "stopped";
        let pres: Response;
        try {
          pres = await fetch(`/api/ihs/${module}/${encodeURIComponent(r.key)}`, {
            credentials: "same-origin",
          });
        } catch {
          return "fail";
        }
        if (pres.status === 429) {
          if (!(await backoff(pres))) return "stopped";
          continue;
        }
        let pjson: {
          resourceType?: string;
          payload?: Record<string, unknown>;
          enriched?: string[];
        };
        try {
          pjson = await pres.json();
        } catch {
          return "fail";
        }
        if (!pres.ok || !pjson.resourceType || !pjson.payload) return "fail";
        // Hanya PUT bila memang ada koreksi kode (mapping aktif + nilai valid).
        if (!pjson.enriched?.includes("code")) return "skip";
        const body = { ...pjson.payload, id: r.satuSehatId };
        let sres: Response;
        try {
          sres = await fetch(
            `/api/fhir/${encodeURIComponent(pjson.resourceType)}/${encodeURIComponent(r.satuSehatId)}?module=${encodeURIComponent(module)}&key=${encodeURIComponent(r.key)}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              credentials: "same-origin",
              body: JSON.stringify(body),
            },
          );
        } catch {
          return "fail";
        }
        if (sres.status === 429) {
          if (!(await backoff(sres))) return "stopped";
          continue;
        }
        await sres.text().catch(() => null);
        return sres.ok ? "ok" : "fail";
      }
    };

    let ok = 0,
      fail = 0,
      skip = 0,
      processed = 0,
      p = 1,
      totalPages = 1,
      guard = 0;
    const MAX_LOOPS = 20000;
    const BATCH_PAUSE_EVERY = 100;
    const BATCH_PAUSE_SECS = 60;
    // Baris terkirim TIDAK rontok dari filter → maju halaman (bukan muat-ulang
    // halaman yang sama), dgn `seen` mencegah proses ganda saat paging bergeser.
    const seen = new Set<string>();

    try {
      while (!rePutStopRef.current && p <= totalPages && guard++ < MAX_LOOPS) {
        let resp: SyncResponse;
        try {
          const res = await fetch(
            `/api/ihs/${module}?filter=terkirim&page=${p}&jenis=lab`,
            { credentials: "same-origin" },
          );
          if (res.status === 429) {
            if (!(await backoff(res))) break;
            continue;
          }
          const json = await res.json();
          if (!res.ok) break;
          resp = json as SyncResponse;
        } catch {
          break;
        }
        totalPages = resp.totalPages;
        setData(resp);
        setNotesMap(resp.notes ?? {});
        const rows = resp.rows.filter(
          // Lewati yang SUDAH diperbaiki (PUT sukses tercatat) → hanya yang
          // masih salah yang di-PUT. Idempotent: aman dijalankan berulang.
          (r) => r.sent && r.satuSehatId && !r.reputDone && !seen.has(r.key),
        );
        setQueueResults(
          Object.fromEntries(rows.map((r) => [r.key, "pending" as QueueState])),
        );
        for (const r of rows) {
          if (rePutStopRef.current) break;
          seen.add(r.key);
          setQueueResults((s) => ({ ...s, [r.key]: "sending" }));
          const outcome = await rePutOne(r);
          if (outcome === "stopped") break;
          if (outcome === "ok") {
            ok++;
            setQueueResults((s) => ({ ...s, [r.key]: "ok" }));
          } else if (outcome === "skip") {
            skip++;
            setQueueResults((s) => {
              const n = { ...s };
              delete n[r.key];
              return n;
            });
          } else {
            fail++;
            setQueueResults((s) => ({ ...s, [r.key]: "fail" }));
          }
          setRePutStats({ ok, fail, skip });
          if (outcome !== "skip") {
            processed++;
            if (processed % BATCH_PAUSE_EVERY === 0) {
              if (!(await countdown(BATCH_PAUSE_SECS, "batch"))) break;
            } else {
              await sleep(120);
            }
          }
        }
        p++;
      }
    } finally {
      setRePutRunning(false);
      setAutoWait(null);
      setAutoWaitReason(null);
      setQueueResults({});
      setRePutSummary({ ok, fail, skip });
      setPage(1);
      await load("terkirim", 1, "", dateFrom, dateTo, keyQuery);
    }
  }, [rePutRunning, autoRunning, queueRunning, module, load, dateFrom, dateTo, keyQuery]);

  // ── Sesuaikan SIMGOS (reconcile massal, tanpa Satu Sehat) ──
  const stopRecon = useCallback(() => {
    reconStopRef.current = true;
  }, []);

  // Loop batch: minta server memproses N baris LAB (masih 11477-7) per panggilan,
  // maju lewat cursor refId sampai `done`. Hanya menulis SIMGOS → tak kena batas
  // kirim Satu Sehat; hanya backoff pada rate-limit API kita sendiri (429).
  const reconRun = useCallback(async () => {
    if (busy) return;
    reconStopRef.current = false;
    setReconArmed(false);
    setReconRunning(true);
    setReconSummary(null);
    setReconStats({ scanned: 0, updated: 0 });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let cursor = 0;
    let scanned = 0;
    let updated = 0;
    let guard = 0;
    const MAX_LOOPS = 100000;

    try {
      for (;;) {
        if (reconStopRef.current) break;
        if (guard++ > MAX_LOOPS) break;
        let res: Response;
        try {
          res = await fetch(`/api/ihs/${module}/reconcile`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            credentials: "same-origin",
            body: JSON.stringify({ cursor, batchSize: 1000 }),
          });
        } catch {
          break;
        }
        if (res.status === 429) {
          const raw = Number(res.headers.get("Retry-After"));
          let secs = Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 60;
          secs = Math.min(secs, 120) + 1;
          for (let s = secs; s > 0; s--) {
            if (reconStopRef.current) break;
            setAutoWait(s);
            setAutoWaitReason("limit");
            await sleep(1000);
          }
          setAutoWait(null);
          setAutoWaitReason(null);
          continue; // ulangi cursor yang sama
        }
        let json: {
          scanned?: number;
          updated?: number;
          nextCursor?: number;
          done?: boolean;
          error?: string;
        };
        try {
          json = await res.json();
        } catch {
          break;
        }
        if (!res.ok) break;
        scanned += Number(json.scanned ?? 0);
        updated += Number(json.updated ?? 0);
        setReconStats({ scanned, updated });
        if (json.done || !json.nextCursor || json.nextCursor <= cursor) break;
        cursor = Number(json.nextCursor);
        await sleep(120); // jeda kecil ramah rate-limit
      }
    } finally {
      setReconRunning(false);
      setAutoWait(null);
      setAutoWaitReason(null);
      setReconSummary({ scanned, updated });
      // Muat ulang tampilan (kode di panel kini ikut benar).
      await load(filter, page, noteFilter, dateFrom, dateTo, keyQuery);
    }
  }, [busy, module, load, filter, page, noteFilter, dateFrom, dateTo, keyQuery]);

  // Reset kontrol antrian saat pindah filter/halaman/tanggal/pencarian.
  useEffect(() => {
    setQueueArmed(false);
    setQueueSummary(null);
    setQueueResults({});
    setAutoArmed(false);
    setRePutArmed(false);
    setReconArmed(false);
  }, [filter, page, noteFilter, dateFrom, dateTo, keyQuery, jenis]);

  const eligibleCount = data
    ? data.rows.filter((r) => !r.sent && !r.waitingRef).length
    : 0;
  const queueTotal = Object.keys(queueResults).length;
  const queueDone = Object.values(queueResults).filter(
    (v) => v === "ok" || v === "fail",
  ).length;

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
                  {fmt(summary.menunggu)} menunggu {dependsOnAll ?? "ref"}
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
                  onClick={() => load(filter, page, noteFilter, dateFrom, dateTo, keyQuery)}
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
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
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
                      load(filter, page, noteFilter, dateFrom, dateTo, keyQuery)
                    }
                    disabled={loading || busy}
                    className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
                  >
                    <LuRefreshCw
                      className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                    />
                    Muat ulang
                  </button>

                  {/* Kirim Antrian (opsional per modul) */}
                  {enableQueue &&
                    (queueRunning ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                          <LuRefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Mengirim {queueDone}/{queueTotal}
                        </span>
                        <button
                          type="button"
                          onClick={stopQueue}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <LuX className="h-3.5 w-3.5" />
                          Stop
                        </button>
                      </div>
                    ) : queueArmed ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1 ring-1 ring-amber-200">
                        <span className="pl-1 text-[11px] font-semibold text-amber-800">
                          Kirim {eligibleCount} item?
                        </span>
                        <button
                          type="button"
                          onClick={runQueue}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-teal-700"
                        >
                          <LuSend className="h-3.5 w-3.5" />
                          Ya, kirim
                        </button>
                        <button
                          type="button"
                          onClick={() => setQueueArmed(false)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setQueueArmed(true)}
                        disabled={loading || eligibleCount === 0 || busy}
                        title={
                          eligibleCount === 0
                            ? "Tidak ada baris siap kirim di halaman ini (menunggu referensi & sudah terkirim dilewati)"
                            : `POST ${eligibleCount} baris halaman ini ke Satu Sehat secara berurutan, langsung write-back`
                        }
                        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LuListChecks className="h-3.5 w-3.5" />
                        Kirim Antrian
                        <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] tabular-nums">
                          {eligibleCount}
                        </span>
                      </button>
                    ))}

                  {/* Auto Kirim: kontinu lintas halaman + backoff rate limit */}
                  {enableQueue &&
                    (autoRunning ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                          {autoWait != null ? (
                            <>
                              <LuClock className="h-3.5 w-3.5" />
                              {autoWaitReason === "batch"
                                ? `Jeda ${autoWait}s`
                                : `Tunggu limit ${autoWait}s`}
                            </>
                          ) : (
                            <>
                              <LuRefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Auto {fmt(autoStats.ok)}✓
                              {autoStats.fail > 0 && ` · ${fmt(autoStats.fail)}✗`}
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={stopAuto}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <LuX className="h-3.5 w-3.5" />
                          Stop
                        </button>
                      </div>
                    ) : autoArmed ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 ring-1 ring-violet-200">
                        <span className="pl-1 text-[11px] font-semibold text-violet-800">
                          Kirim SEMUA yang siap?
                        </span>
                        <button
                          type="button"
                          onClick={autoSend}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700"
                        >
                          <LuZap className="h-3.5 w-3.5" />
                          Ya, auto-kirim
                        </button>
                        <button
                          type="button"
                          onClick={() => setAutoArmed(false)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAutoArmed(true)}
                        disabled={loading || busy}
                        title="Kirim SEMUA baris siap di seluruh halaman secara otomatis (per halaman lalu muat ulang); menunggu otomatis saat kena rate limit"
                        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LuZap className="h-3.5 w-3.5" />
                        Auto Kirim
                      </button>
                    ))}
                </div>
              </div>

              {/* Sub-filter jenis (LAB/TTV) + Re-PUT retroaktif — khusus Observation */}
              {enableLabRebuild && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-3">
                  <span className="text-[11px] font-semibold text-slate-400">
                    Jenis:
                  </span>
                  <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
                    {([
                      ["", "Semua"],
                      ["lab", "Hasil Lab"],
                      ["ttv", "TTV"],
                    ] as const).map(([val, lab]) => (
                      <button
                        key={val || "all"}
                        type="button"
                        onClick={() => changeJenis(val)}
                        disabled={busy}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                          jenis === val
                            ? "bg-white text-teal-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {lab}
                      </button>
                    ))}
                  </div>

                  {jenis === "lab" && (
                    <label
                      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                        busy ? "opacity-50" : "cursor-pointer text-slate-600"
                      }`}
                      title="Sembunyikan baris yang kodenya SUDAH diperbaiki (PUT sukses) — sisakan hanya yang masih salah"
                    >
                      <input
                        type="checkbox"
                        checked={hideDone}
                        disabled={busy}
                        onChange={(e) => setHideDone(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-fuchsia-600 focus:ring-fuchsia-400"
                      />
                      Hanya yang belum diperbaiki
                    </label>
                  )}

                  {/* Fase 1: sesuaikan SIMGOS dulu (write-back massal, tanpa Satu
                      Sehat) — bikin staging konsisten sebelum di-PUT. */}
                  {jenis === "lab" &&
                    (reconRunning ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          {autoWait != null ? (
                            <>
                              <LuClock className="h-3.5 w-3.5" />
                              {`Tunggu limit ${autoWait}s`}
                            </>
                          ) : (
                            <>
                              <LuRefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Sesuaikan {fmt(reconStats.updated)}✓
                              <span className="font-normal opacity-70">
                                {" "}
                                / {fmt(reconStats.scanned)} dipindai
                              </span>
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={stopRecon}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <LuX className="h-3.5 w-3.5" />
                          Stop
                        </button>
                      </div>
                    ) : reconArmed ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 ring-1 ring-emerald-200">
                        <span className="pl-1 text-[11px] font-semibold text-emerald-800">
                          Tulis kode/nilai benar ke SIMGOS untuk SEMUA LAB salah?
                        </span>
                        <button
                          type="button"
                          onClick={reconRun}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700"
                        >
                          <LuDatabase className="h-3.5 w-3.5" />
                          Ya, sesuaikan
                        </button>
                        <button
                          type="button"
                          onClick={() => setReconArmed(false)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReconArmed(true)}
                        disabled={loading || busy}
                        title="Fase 1 (sebelum PUT): tulis-balik kode LOINC + nilai + interpretasi yang benar ke SIMGOS untuk SEMUA Observasi LAB yang masih 11477-7. Hanya menyentuh SIMGOS (tanpa Satu Sehat) → cepat, tanpa batas kirim. Parameter belum dipetakan / tanpa nilai dilewati. Idempotent."
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LuDatabase className="h-3.5 w-3.5" />
                        Sesuaikan SIMGOS
                      </button>
                    ))}

                  {reconSummary && !reconRunning && (
                    <span className="text-[11px] font-medium text-slate-500">
                      SIMGOS: {fmt(reconSummary.updated)} disesuaikan
                      {` (${fmt(reconSummary.scanned)} dipindai)`}
                    </span>
                  )}

                  {jenis === "lab" &&
                    (rePutRunning ? (
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-700">
                          {autoWait != null ? (
                            <>
                              <LuClock className="h-3.5 w-3.5" />
                              {autoWaitReason === "batch"
                                ? `Jeda ${autoWait}s`
                                : `Tunggu limit ${autoWait}s`}
                            </>
                          ) : (
                            <>
                              <LuRefreshCw className="h-3.5 w-3.5 animate-spin" />
                              rePUT {fmt(rePutStats.ok)}✓
                              {rePutStats.fail > 0 && ` · ${fmt(rePutStats.fail)}✗`}
                              {rePutStats.skip > 0 && ` · ${fmt(rePutStats.skip)} lewat`}
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={stopRePut}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                        >
                          <LuX className="h-3.5 w-3.5" />
                          Stop
                        </button>
                      </div>
                    ) : rePutArmed ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-50 px-2 py-1 ring-1 ring-fuchsia-200">
                        <span className="pl-1 text-[11px] font-semibold text-fuchsia-800">
                          PUT ulang SEMUA LAB terkirim dgn kode benar?
                        </span>
                        <button
                          type="button"
                          onClick={rePutSend}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-fuchsia-700"
                        >
                          <LuWrench className="h-3.5 w-3.5" />
                          Ya, perbaiki
                        </button>
                        <button
                          type="button"
                          onClick={() => setRePutArmed(false)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-white"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRePutArmed(true)}
                        disabled={loading || busy}
                        title="PUT ulang SEMUA Observasi LAB yang sudah terkirim dengan kode LOINC yang benar (retroaktif, lintas halaman, sadar rate limit). Parameter tanpa pemetaan aktif / tanpa nilai dilewati."
                        className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-1.5 text-xs font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LuWrench className="h-3.5 w-3.5" />
                        Perbaiki Terkirim (rePUT)
                      </button>
                    ))}

                  {rePutSummary && !rePutRunning && (
                    <span className="text-[11px] font-medium text-slate-500">
                      Selesai: {fmt(rePutSummary.ok)} diperbaiki
                      {rePutSummary.skip > 0 && `, ${fmt(rePutSummary.skip)} dilewati`}
                      {rePutSummary.fail > 0 && `, ${fmt(rePutSummary.fail)} gagal`}
                    </span>
                  )}
                </div>
              )}

              {/* Pencarian berdasarkan key (mis. No. Pendaftaran = refId) */}
              {enableKeySearch && (
                <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
                  <div className="relative w-full max-w-xs">
                    <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={keyInput}
                      inputMode="numeric"
                      onChange={(e) =>
                        setKeyInput(e.target.value.replace(/[^A-Za-z0-9]/g, ""))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyKeySearch();
                      }}
                      placeholder={`Cari ${data?.searchLabel ?? data?.keyLabel ?? "No. Pendaftaran"}…`}
                      aria-label={`Cari ${data?.searchLabel ?? data?.keyLabel ?? "No. Pendaftaran"}`}
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
                        className="font-semibold text-teal-600 hover:underline"
                      >
                        reset
                      </button>
                    </span>
                  )}
                </div>
              )}

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

              {/* Banner auto-kirim */}
              {enableQueue && (autoRunning || autoSummary) && (
                <div className="px-4 pb-3">
                  <div
                    className={`rounded-xl border px-4 py-3 ${
                      autoRunning
                        ? "border-violet-100 bg-violet-50/60"
                        : autoSummary && autoSummary.fail > 0
                          ? "border-amber-100 bg-amber-50/60"
                          : "border-emerald-100 bg-emerald-50/60"
                    }`}
                  >
                    {autoRunning ? (
                      <div className="flex items-center gap-2 text-xs font-semibold text-violet-800">
                        {autoWait != null ? (
                          <>
                            <LuClock className="h-3.5 w-3.5 shrink-0" />
                            {autoWaitReason === "batch"
                              ? `Jeda tiap 100 entri — melanjutkan dalam ${autoWait}s…`
                              : `Kena rate limit — menunggu ${autoWait}s sampai reset, lalu lanjut otomatis…`}
                          </>
                        ) : (
                          <>
                            <LuRefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
                            Auto-kirim berjalan… {fmt(autoStats.ok)} terkirim
                            {autoStats.fail > 0 &&
                              ` · ${fmt(autoStats.fail)} gagal (dicatat kuning)`}
                          </>
                        )}
                      </div>
                    ) : autoSummary ? (
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium text-slate-700">
                          <span className="font-bold">Auto-kirim selesai.</span>{" "}
                          <span className="font-semibold text-emerald-700">
                            {fmt(autoSummary.ok)} terkirim
                          </span>
                          {autoSummary.fail > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-amber-700">
                                {fmt(autoSummary.fail)} gagal (dicatat kuning)
                              </span>
                            </>
                          )}
                          . Baris{" "}
                          <span className="font-semibold">
                            Menunggu {dependsOnAll ?? "referensi"}
                          </span>{" "}
                          dilewati.
                        </p>
                        <button
                          type="button"
                          onClick={() => setAutoSummary(null)}
                          aria-label="Tutup ringkasan auto-kirim"
                          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        >
                          <LuX className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {/* Banner antrian kirim */}
              {enableQueue && (queueRunning || queueSummary) && (
                <div className="px-4 pb-3">
                  <div
                    className={`rounded-xl border px-4 py-3 ${
                      queueRunning
                        ? "border-blue-100 bg-blue-50/60"
                        : queueSummary && queueSummary.fail > 0
                          ? "border-amber-100 bg-amber-50/60"
                          : "border-emerald-100 bg-emerald-50/60"
                    }`}
                  >
                    {queueRunning ? (
                      <div className="space-y-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-blue-800">
                          <LuRefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Mengirim antrian… {queueDone}/{queueTotal}
                        </p>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{
                              width: `${queueTotal ? (queueDone / queueTotal) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    ) : queueSummary ? (
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-medium text-slate-700">
                          <span className="font-bold">Antrian selesai.</span>{" "}
                          <span className="font-semibold text-emerald-700">
                            {fmt(queueSummary.ok)} terkirim
                          </span>
                          {queueSummary.fail > 0 && (
                            <>
                              {" · "}
                              <span className="font-semibold text-amber-700">
                                {fmt(queueSummary.fail)} gagal (dicatat kuning)
                              </span>
                            </>
                          )}{" "}
                          dari {fmt(queueSummary.total)} baris. Baris{" "}
                          <span className="font-semibold">
                            Menunggu {dependsOnAll ?? "referensi"}
                          </span>{" "}
                          &amp; sudah terkirim dilewati.
                        </p>
                        <button
                          type="button"
                          onClick={() => setQueueSummary(null)}
                          aria-label="Tutup ringkasan antrian"
                          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        >
                          <LuX className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

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
                    ) : data && displayRows.length > 0 ? (
                      displayRows.map((r) => {
                        const noteFor = notesMap[r.key];
                        const qs = queueResults[r.key];
                        // Highlight baris berdasarkan status antrian (menang atas tint catatan).
                        const qRow =
                          qs === "sending"
                            ? "bg-blue-50 ring-2 ring-inset ring-blue-300"
                            : qs === "ok"
                              ? "bg-emerald-50/70"
                              : qs === "fail"
                                ? "bg-red-50/70"
                                : qs === "pending"
                                  ? "opacity-55"
                                  : "";
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
                          className={`transition-colors hover:bg-slate-50/60 ${qs ? qRow : tint}`}
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                            {qs === "sending" && (
                              <span className="relative mr-2 inline-flex h-2 w-2 align-middle">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                              </span>
                            )}
                            {r.hint && (r.hint.name || r.hint.nik) ? (
                              <button
                                type="button"
                                data-hint-trigger="true"
                                title="Lihat calon pasien (nama & NIK)"
                                className="cursor-pointer appearance-none border-0 border-b border-dotted border-orange-300 bg-transparent p-0 font-mono text-xs text-slate-700 underline-offset-2 hover:border-orange-500"
                                onClick={(e) => {
                                  if (pinnedHint?.key === r.key) {
                                    setPinnedHint(null);
                                    return;
                                  }
                                  const rect =
                                    e.currentTarget.getBoundingClientRect();
                                  const openUp =
                                    rect.bottom > window.innerHeight - 140;
                                  setPinnedHint({
                                    key: r.key,
                                    name: r.hint?.name,
                                    nik: r.hint?.nik,
                                    top: openUp
                                      ? rect.top - 140
                                      : rect.bottom + 6,
                                    left: rect.left,
                                  });
                                }}
                              >
                                {r.key}
                              </button>
                            ) : (
                              r.key
                            )}
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
                            {qs ? (
                              <QueueStatusBadge state={qs} />
                            ) : r.sent ? (
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
                                {r.reputDone && (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700"
                                    title="Kode LOINC sudah diperbaiki (PUT ulang sukses)"
                                  >
                                    <LuWrench className="h-2.5 w-2.5" />
                                    LOINC ✓
                                  </span>
                                )}
                              </span>
                            ) : r.waitingRef ? (
                              (() => {
                                const miss =
                                  r.waitingFor && r.waitingFor.length
                                    ? r.waitingFor.join(" & ")
                                    : (dependsOnAll ?? "referensi");
                                return (
                                  <span
                                    className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700"
                                    title={`Belum bisa dikirim: ${miss} belum ada di Satu Sehat`}
                                  >
                                    <LuUserRoundX className="h-3 w-3" />
                                    Menunggu {miss}
                                  </span>
                                );
                              })()
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
                              {rebuildMsg?.key === r.key && (
                                <span
                                  className={`max-w-40 truncate text-[10px] font-medium ${rebuildMsg.ok ? "text-emerald-600" : "text-rose-600"}`}
                                  title={rebuildMsg.text}
                                >
                                  {rebuildMsg.ok ? "✓ " : "✕ "}
                                  {rebuildMsg.text}
                                </span>
                              )}
                              {enableLabRebuild &&
                                !r.sent &&
                                r.key.split("_")[1] === "6" && (
                                  <button
                                    type="button"
                                    onClick={() => rebuildLab(r.key)}
                                    disabled={rebuildingKey === r.key || busy}
                                    title="Perbaiki kode & nilai LOINC lalu tulis ke SIMGOS (agar bisa dikirim)"
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <LuWrench
                                      className={`h-3.5 w-3.5 ${rebuildingKey === r.key ? "animate-spin" : ""}`}
                                    />
                                    {rebuildingKey === r.key
                                      ? "Memperbaiki…"
                                      : "Perbaiki LOINC"}
                                  </button>
                                )}
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
                      disabled={data.page <= 1 || loading || busy}
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
                      disabled={data.page >= data.totalPages || loading || busy}
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
              ) : payloadData?.enriched && payloadData.enriched.length > 0 ? (
                <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-teal-700">
                  <LuWandSparkles className="h-3.5 w-3.5 shrink-0" />
                  {payloadData.enriched.map((f) => ENRICHED_LABEL[f] ?? f).join(", ")}{" "}
                  dilengkapi otomatis dari SIMGOS
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

      {/* Tooltip "calon pasien" — di-portal ke body (fixed) agar tak terpotong
          overflow tabel. Dibuka dengan KLIK No. Pendaftaran (pinned) → interaktif
          agar NIK bisa disalin. Tutup via klik di luar / Escape / tombol X. */}
      {pinnedHint &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={hintPopRef}
            style={{
              position: "fixed",
              top: pinnedHint.top,
              left: pinnedHint.left,
              zIndex: 60,
            }}
            className="max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-500">
                Calon pasien · belum di Satu Sehat
              </p>
              <button
                type="button"
                onClick={() => setPinnedHint(null)}
                aria-label="Tutup"
                className="-mr-1 -mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <LuX className="h-3.5 w-3.5" />
              </button>
            </div>
            {pinnedHint.name && (
              <p className="mt-0.5 text-xs font-bold text-slate-800">
                {pinnedHint.name}
              </p>
            )}
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-500">
                NIK: {pinnedHint.nik ?? "—"}
              </span>
              {pinnedHint.nik && (
                <button
                  type="button"
                  onClick={copyHintNik}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                >
                  {hintCopied ? (
                    <LuCheck className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <LuCopy className="h-3 w-3" />
                  )}
                  {hintCopied ? "Tersalin" : "Salin"}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
