// lib/ihs/registry.ts
// ─────────────────────────────────────────────────────────────
// Registry spec sinkronisasi 28 modul IHS (SIMGOS → Satu Sehat).
// Satu sumber kebenaran: tabel staging, kolom penanda kirim (`id`),
// kunci sumber, flag kesiapan, dan kolom yang ditampilkan.
//
// Tambah modul baru = tambah satu entri di sini (lihat workflow doc).
// Semua nilai bersifat internal/tepercaya (bukan input user).
// ─────────────────────────────────────────────────────────────

export type SyncReadyFlag = "send" | "statusRequest" | "get" | null;
export type SyncCellType =
  | "text"
  | "json-name"
  | "nik"
  | "date"
  | "datetime"
  | "code";

export interface SyncColumn {
  col: string; // nama kolom di tabel staging
  label: string; // judul kolom di UI
  type: SyncCellType;
  /**
   * Bila diisi, nilai diekstrak SERVER-SIDE dari kolom JSON via
   * JSON_EXTRACT (mis. "$.display") — hanya skalar yang ditarik, jauh lebih
   * ringan daripada mentransfer seluruh blob JSON.
   */
  jsonPath?: string;
}

export interface IhsModuleSpec {
  module: string; // slug URL, mis. "patient"
  resourceType: string; // "Patient"
  table: string; // tabel staging di `kemkes-ihs`
  keyCol: string; // kunci sumber utama (mis. refId)
  keyLabel: string; // judul kolom kunci
  readyFlag: SyncReadyFlag; // flag "siap kirim"
  orderCol: string; // kolom untuk ORDER BY DESC
  columns: SyncColumn[]; // kolom tambahan yang ditampilkan
  /** Kolom yang dikonversi ke boolean saat merakit payload FHIR. */
  boolCols?: string[];
  /** Kolom bookkeeping tambahan yang dikecualikan dari payload. */
  payloadExclude?: string[];
  /**
   * Bila true, baris "belum terkirim" bisa dirakit payload-nya langsung dari
   * tabel SUMBER (mis. `master.pasien`) — bukan dari staging yang kosong.
   * Dipakai untuk alur "POST manual". Assembler-nya modul-spesifik.
   */
  createFromMaster?: boolean;
  /**
   * Sumber "Nama" cadangan dari tabel master, untuk mengisi kolom bertipe
   * `json-name` yang kosong pada baris skeleton (belum terkirim). Di-JOIN
   * lewat `keyCol` = kunci baris (mis. NORM). Read-only.
   */
  masterName?: {
    schema: string; // mis. "master"
    table: string; // mis. "pasien"
    keyCol: string; // kolom kunci di master (cocok dgn key baris), mis. "NORM"
    nameCol: string; // kolom nama, mis. "NAMA"
  };
  /**
   * Deteksi baris "pernah dikirim tapi belum punya id": cocokkan kolom NIK
   * staging dengan identifier yang pernah di-POST (delivery_logs) untuk
   * `logResourceType`. Read dari DB kita sendiri.
   */
  attemptMatch?: {
    logResourceType: string; // mis. "Patient"
    nikCol: string; // kolom NIK di staging, mis. "nik"
  };
  /**
   * Filter tanggal via ENCODING pada keyCol (biasanya PK) — jauh lebih ringan
   * (range indeks primer) daripada memindai kolom timestamp yang tak ter-index.
   * `yymmdd-prefix`: keyCol diawali `YYMMDD` (mis. refId encounter `2608310007`).
   */
  dateKey?: {
    kind: "yymmdd-prefix";
    keyLength: number; // total panjang keyCol (mis. 10) untuk padding range
  };
}

export const IHS_MODULES: Record<string, IhsModuleSpec> = {
  patient: {
    module: "patient",
    resourceType: "Patient",
    table: "patient",
    keyCol: "refId",
    keyLabel: "NORM",
    readyFlag: "statusRequest",
    orderCol: "getDate",
    columns: [
      { col: "nik", label: "NIK", type: "code" },
      { col: "name", label: "Nama", type: "json-name" },
      { col: "httpRequest", label: "Mode", type: "code" },
      { col: "getDate", label: "Diperbarui", type: "date" },
    ],
    boolCols: ["active", "deceasedBoolean"],
    payloadExclude: ["multipleBirthBoolean", "multipleBirthInteger"],
    createFromMaster: true,
    masterName: {
      schema: "master",
      table: "pasien",
      keyCol: "NORM",
      nameCol: "NAMA",
    },
    attemptMatch: { logResourceType: "Patient", nikCol: "nik" },
  },

  encounter: {
    module: "encounter",
    resourceType: "Encounter",
    table: "encounter",
    keyCol: "refId",
    keyLabel: "No. Pendaftaran",
    readyFlag: "send",
    // refId = PK ber-encoding tanggal → ORDER pakai PK (tanpa filesort).
    orderCol: "refId",
    columns: [
      // Skalar ringan diekstrak server-side dari kolom JSON (bukan blob penuh).
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "status", label: "Status", type: "code" },
      { col: "class", label: "Kelas", type: "code", jsonPath: "$.code" },
      { col: "period", label: "Mulai", type: "datetime", jsonPath: "$.start" },
      { col: "sendDate", label: "Diproses", type: "date" },
    ],
    dateKey: { kind: "yymmdd-prefix", keyLength: 10 },
  },
};

export function getModuleSpec(module: string): IhsModuleSpec | null {
  return IHS_MODULES[module] ?? null;
}
