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
   * Filter tanggal via ENCODING `YYMMDD` pada sebuah kolom ter-index — jauh
   * lebih ringan (range indeks) daripada memindai kolom timestamp tak ter-index.
   * `yymmdd-prefix`: kolom diawali `YYMMDD` (mis. refId encounter `2608310007`,
   * atau `nopen` No. Pendaftaran `2608270011`).
   */
  dateKey?: {
    kind: "yymmdd-prefix";
    keyLength: number; // total panjang nilai kolom (mis. 10) untuk padding range
    /** Kolom yang di-filter. Default: keyCol. Mis. "nopen" bila keyCol bukan tanggal. */
    col?: string;
  };
  /**
   * Ketergantungan referensi: resource ini butuh resource lain terkirim dulu.
   * Bila baris belum terkirim DAN referensinya belum terbentuk (mis.
   * encounter.subject.reference = `Patient/<id>` belum ada), tampilkan notice
   * "Menunggu <label>". Deteksi via JSON_EXTRACT server-side.
   */
  dependsOn?: {
    refCol: string; // kolom JSON pemegang referensi, mis. "subject"
    refPath: string; // path ke reference, mis. "$.reference"
    label: string; // nama resource dependensi, mis. "Patient"
  };
  /**
   * Bila diisi, tiap baris menampilkan tombol "Detail" yang menuju
   * `${detailBase}/${key}` — halaman rincian resource (mis. encounter →
   * kumpulan Condition/Observation/Procedure/… berdasar No. Pendaftaran).
   */
  detailBase?: string;
  /**
   * Kondisi dasar (WHERE) untuk MEMBATASI baris modul ini pada tabel yang
   * TERCAMPUR — mis. hanya LAB (kategori "Laboratory procedure", code
   * 108252007) dari `service_request` yang juga memuat Radiologi. Diterapkan
   * ke SEMUA kueri (summary + rows). Nilai internal/tepercaya.
   */
  baseFilter?: {
    col: string; // kolom sumber (mis. "category")
    jsonPath?: string; // path skalar (mis. "$[0].coding[0].code")
    equals: string; // nilai yang harus cocok
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
    dependsOn: { refCol: "subject", refPath: "$.reference", label: "Patient" },
    detailBase: "/encounter",
  },

  allergy: {
    module: "allergy",
    resourceType: "AllergyIntolerance",
    table: "allergy_intolerance",
    keyCol: "refId",
    keyLabel: "ID Alergi",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "patient", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Alergen", type: "text", jsonPath: "$.coding[0].display" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "recordedDate", label: "Direkam", type: "date" },
    ],
    // AllergyIntolerance dikirim BERDASARKAN encounter → butuh encounter.reference.
    // Belum terkirim + reference kosong ⇒ "Menunggu Encounter" (pasien belum
    // punya kunjungan yang terkirim ke Satu Sehat).
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // ── ServiceRequest: satu resource, beberapa jenis tindakan ──
  // Semua butuh encounter.reference untuk dikirim → dependsOn Encounter.

  // Laboratorium — dari tabel `service_request` yang TERCAMPUR (LAB + Radiologi);
  // difilter hanya kategori "Laboratory procedure" (code 108252007).
  "servicerequest-lab": {
    module: "servicerequest-lab",
    resourceType: "ServiceRequest",
    table: "service_request",
    keyCol: "refId",
    keyLabel: "No. Layanan",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Layanan", type: "text", jsonPath: "$.text" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "occurrenceDateTime", label: "Waktu", type: "date" },
    ],
    baseFilter: {
      col: "category",
      jsonPath: "$[0].coding[0].code",
      equals: "108252007",
    },
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Jadwal Kontrol — tabel khusus.
  "servicerequest-jadwal": {
    module: "servicerequest-jadwal",
    resourceType: "ServiceRequest",
    table: "service_request_jadwal_kontrol",
    keyCol: "refId",
    keyLabel: "No. Layanan",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Layanan", type: "text", jsonPath: "$.coding[0].display" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "occurrenceDateTime", label: "Waktu", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Pemeriksaan EKG — tabel khusus.
  "servicerequest-ekg": {
    module: "servicerequest-ekg",
    resourceType: "ServiceRequest",
    table: "service_request_pemeriksaan_ekg",
    keyCol: "refId",
    keyLabel: "No. Layanan",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Layanan", type: "text", jsonPath: "$.coding[0].display" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "occurrenceDateTime", label: "Waktu", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Rencana Rawat Inap (Surat Perintah Rawat Inap) — tabel khusus.
  "servicerequest-ranap": {
    module: "servicerequest-ranap",
    resourceType: "ServiceRequest",
    table: "service_request_perencana_rawat_inap",
    keyCol: "refId",
    keyLabel: "No. Layanan",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Layanan", type: "text", jsonPath: "$.text" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "occurrencePeriod", label: "Mulai", type: "date", jsonPath: "$.start" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Specimen — harus terkait ServiceRequest yang SUDAH terkirim (punya id).
  // request = [{ reference: "ServiceRequest/<id>" }]; kosong ⇒ "Menunggu ServiceRequest".
  specimen: {
    module: "specimen",
    resourceType: "Specimen",
    table: "specimen",
    keyCol: "refId",
    keyLabel: "No. Spesimen",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "type", label: "Jenis", type: "text", jsonPath: "$.coding[0].display" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "receivedTime", label: "Diterima", type: "date" },
    ],
    dependsOn: {
      refCol: "request",
      refPath: "$[0].reference",
      label: "ServiceRequest",
    },
  },

  // ── Condition: satu resource, beberapa jenis (tabel berbeda) ──
  // Semua butuh encounter.reference untuk dikirim → dependsOn Encounter.

  // Diagnosis kunjungan — tabel utama.
  condition: {
    module: "condition",
    resourceType: "Condition",
    table: "condition",
    keyCol: "refId",
    keyLabel: "No. Diagnosis",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Diagnosis", type: "text", jsonPath: "$.coding[0].display" },
      { col: "code", label: "Kode", type: "code", jsonPath: "$.coding[0].code" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Anamnesis (riwayat keluhan).
  "condition-anamnesis": {
    module: "condition-anamnesis",
    resourceType: "Condition",
    table: "condition_anamnesis",
    keyCol: "refId",
    keyLabel: "No. Diagnosis",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Kondisi", type: "text", jsonPath: "$.coding[0].display" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "recordedDate", label: "Direkam", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Riwayat penyakit dahulu.
  "condition-riwayat": {
    module: "condition-riwayat",
    resourceType: "Condition",
    table: "condition_riwayat_penyakit_dahulu",
    keyCol: "refId",
    keyLabel: "No. Diagnosis",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Kondisi", type: "text", jsonPath: "$.coding[0].display" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "recordedDate", label: "Direkam", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Hasil Patologi Anatomi.
  "condition-hasil-pa": {
    module: "condition-hasil-pa",
    resourceType: "Condition",
    table: "condition_hasil_pa",
    keyCol: "refId",
    keyLabel: "No. Diagnosis",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Kondisi", type: "text", jsonPath: "$.coding[0].display" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "recordedDate", label: "Direkam", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Penilaian Tumor (staging).
  "condition-penilaian-tumor": {
    module: "condition-penilaian-tumor",
    resourceType: "Condition",
    table: "condition_penilaian_tumor",
    keyCol: "refId",
    keyLabel: "No. Diagnosis",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "code", label: "Kondisi", type: "text", jsonPath: "$.coding[0].display" },
      {
        col: "clinicalStatus",
        label: "Status",
        type: "code",
        jsonPath: "$.coding[0].code",
      },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "recordedDate", label: "Direkam", type: "date" },
    ],
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // ── CarePlan: satu resource, dua jenis (tabel berbeda) ──
  // CarePlan dikirim dalam konteks kunjungan → butuh encounter.reference
  // (baru terbentuk setelah Encounter terkirim) ⇒ dependsOn Encounter.

  // Rencana Perawatan — tabel utama.
  careplan: {
    module: "careplan",
    resourceType: "CarePlan",
    table: "care_plan",
    keyCol: "refId",
    keyLabel: "No. Rencana",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "title", label: "Rencana", type: "text" },
      {
        col: "category",
        label: "Kategori",
        type: "text",
        jsonPath: "$[0].coding[0].display",
      },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "created", label: "Dibuat", type: "date" },
    ],
    // Filter tanggal by No. Pendaftaran (nopen, ter-index, encoding YYMMDD).
    dateKey: { kind: "yymmdd-prefix", keyLength: 10, col: "nopen" },
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },

  // Rencana Kontrol (jadwal kontrol ulang) — tabel khusus.
  "careplan-jadwal": {
    module: "careplan-jadwal",
    resourceType: "CarePlan",
    table: "care_plan_jadwal_kontrol",
    keyCol: "refId",
    keyLabel: "No. Rencana",
    readyFlag: "send",
    orderCol: "refId",
    columns: [
      { col: "subject", label: "Pasien", type: "text", jsonPath: "$.display" },
      { col: "title", label: "Rencana Kontrol", type: "text" },
      { col: "status", label: "Status", type: "code" },
      { col: "nopen", label: "No. Pendaftaran", type: "code" },
      { col: "created", label: "Dibuat", type: "date" },
    ],
    // Filter tanggal by No. Pendaftaran (nopen, ter-index, encoding YYMMDD).
    dateKey: { kind: "yymmdd-prefix", keyLength: 10, col: "nopen" },
    dependsOn: { refCol: "encounter", refPath: "$.reference", label: "Encounter" },
  },
};

export function getModuleSpec(module: string): IhsModuleSpec | null {
  return IHS_MODULES[module] ?? null;
}
