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
export type SyncCellType = "text" | "json-name" | "nik" | "date" | "code";

export interface SyncColumn {
  col: string; // nama kolom di tabel staging
  label: string; // judul kolom di UI
  type: SyncCellType;
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
  },
};

export function getModuleSpec(module: string): IhsModuleSpec | null {
  return IHS_MODULES[module] ?? null;
}
