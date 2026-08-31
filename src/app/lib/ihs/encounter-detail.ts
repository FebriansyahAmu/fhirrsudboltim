// lib/ihs/encounter-detail.ts
// ─────────────────────────────────────────────────────────────
// DAL READ-ONLY untuk "Detail Encounter": kumpulkan SEMUA resource
// klinis anak dari SIMGOS berdasarkan encounter refId (No. Pendaftaran).
//
// Setiap tabel klinis di skema `kemkes-ihs` punya kolom `nopen`
// (TERINDEKS) = encounter.refId. Jadi satu encounter → banyak
// Condition/Observation/CarePlan/Composition/… dijoin lewat `nopen`.
//
// Skalar tampilan diekstrak SERVER-SIDE via JSON_EXTRACT (bukan
// mentransfer seluruh blob JSON) → ringan. Satu kueri per resource,
// dijalankan paralel; masing-masing point-lookup pada indeks `nopen`.
//
// Nilai tampilan memakai model `from[]`: daftar sumber terurut, sumber
// non-null PERTAMA yang menang (mis. Observation: valueQuantity →
// valueCodeableConcept → valueString → valueInteger).
//
// 🔒 Hanya SELECT (lewat simgosQuery). TIDAK menulis apa pun ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

const SCHEMA = "kemkes-ihs";
const ITEM_LIMIT = 200; // per resource, per encounter (realistis << ini)

// ── Guards (registry internal/tepercaya, tetap dijaga) ──────
function ident(s: string): string {
  if (!/^[A-Za-z0-9_]+$/.test(s)) throw new Error(`Identifier tidak valid: ${s}`);
  return s;
}
function identPath(p: string): string {
  if (!/^\$[A-Za-z0-9_.[\]']*$/.test(p)) {
    throw new Error(`JSON path tidak valid: ${p}`);
  }
  return p;
}

// ── Spec deklaratif per resource ────────────────────────────
/** Satu sumber nilai: kolom + (opsional) path JSON + (opsional) path satuan. */
interface DetailSource {
  col: string;
  path?: string; // path skalar JSON (mis. "$.coding[0].display")
  unitPath?: string; // path satuan pada kolom sama → "nilai satuan"
}
interface DetailField {
  label: string;
  from: DetailSource[]; // sumber non-null pertama yang menang
  type?: "text" | "datetime" | "code";
}
interface DetailResourceSpec {
  key: string; // slug unik
  label: string; // judul seksi (ID)
  family: string; // pengelompokan (mis. "Observasi")
  resourceType: string; // FHIR
  table: string; // tabel staging
  linkCol: string; // kolom penghubung ke encounter (nopen)
  icon: string; // emoji
  accent: string; // token warna (lihat UI ACCENT)
  orderCol: string; // ORDER BY (kolom yang pasti ada)
  primary: DetailField; // baris utama item
  meta: DetailField[]; // chip sekunder
}

// Pintasan sumber umum.
const code = (path: string): DetailSource => ({ col: "code", path });
const codeDisplay: DetailSource[] = [code("$.coding[0].display"), code("$.text")];

// Nilai Observation per-tabel (hanya kolom yang benar-benar ada di tabel itu).
const OBS_STATUS: DetailField = { label: "Status", from: [{ col: "status" }], type: "code" };
const OBS_TIME: DetailField = {
  label: "Waktu",
  from: [{ col: "effectiveDateTime" }],
  type: "datetime",
};

// Urutan resource = urutan tampil; dikelompokkan per `family`.
const RESOURCES: DetailResourceSpec[] = [
  // ── Kondisi & Diagnosis ──────────────────────────────────
  {
    key: "condition",
    label: "Diagnosis",
    family: "Kondisi & Diagnosis",
    resourceType: "Condition",
    table: "condition",
    linkCol: "nopen",
    icon: "🩺",
    accent: "rose",
    orderCol: "refId",
    primary: { label: "Diagnosis", from: codeDisplay },
    meta: [
      { label: "Kode", from: [code("$.coding[0].code")], type: "code" },
      { label: "Kategori", from: [{ col: "category", path: "$[0].coding[0].display" }] },
      {
        label: "Status klinis",
        from: [{ col: "clinicalStatus", path: "$.coding[0].code" }],
        type: "code",
      },
    ],
  },
  {
    key: "clinical_impression_diagnosa",
    label: "Kesan Klinis (Diagnosa)",
    family: "Kondisi & Diagnosis",
    resourceType: "ClinicalImpression",
    table: "clinical_impression_diagnosa",
    linkCol: "nopen",
    icon: "🧠",
    accent: "pink",
    orderCol: "refId",
    primary: {
      label: "Kesan",
      from: [{ col: "summary" }, code("$.coding[0].display")],
    },
    meta: [
      { label: "Penilaian", from: [code("$.coding[0].display")] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Tanggal", from: [{ col: "date" }], type: "datetime" },
    ],
  },
  {
    key: "clinical_impression_anamnesis",
    label: "Kesan Klinis (Anamnesis)",
    family: "Kondisi & Diagnosis",
    resourceType: "ClinicalImpression",
    table: "clinical_impression_anamnesis",
    linkCol: "nopen",
    icon: "💬",
    accent: "pink",
    orderCol: "refId",
    primary: {
      label: "Anamnesis",
      from: [{ col: "summary" }, { col: "description" }, code("$.coding[0].display")],
    },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Tanggal", from: [{ col: "date" }], type: "datetime" },
      { label: "Pemeriksa", from: [{ col: "assessor", path: "$.display" }] },
    ],
  },
  {
    key: "condition_anamnesis",
    label: "Riwayat Keluhan (Anamnesis)",
    family: "Kondisi & Diagnosis",
    resourceType: "Condition",
    table: "condition_anamnesis",
    linkCol: "nopen",
    icon: "🗒️",
    accent: "rose",
    orderCol: "refId",
    primary: { label: "Kondisi", from: codeDisplay },
    meta: [
      { label: "Catatan", from: [{ col: "note", path: "$[0].text" }] },
      { label: "Kategori", from: [{ col: "category", path: "$[0].coding[0].display" }] },
      { label: "Direkam", from: [{ col: "recordedDate" }], type: "datetime" },
    ],
  },
  {
    key: "condition_riwayat_penyakit_dahulu",
    label: "Riwayat Penyakit Dahulu",
    family: "Kondisi & Diagnosis",
    resourceType: "Condition",
    table: "condition_riwayat_penyakit_dahulu",
    linkCol: "nopen",
    icon: "📜",
    accent: "rose",
    orderCol: "refId",
    primary: { label: "Kondisi", from: codeDisplay },
    meta: [
      {
        label: "Status klinis",
        from: [{ col: "clinicalStatus", path: "$.coding[0].code" }],
        type: "code",
      },
      { label: "Kategori", from: [{ col: "category", path: "$[0].coding[0].display" }] },
      { label: "Direkam", from: [{ col: "recordedDate" }], type: "datetime" },
    ],
  },
  {
    key: "condition_hasil_pa",
    label: "Hasil Patologi Anatomi",
    family: "Kondisi & Diagnosis",
    resourceType: "Condition",
    table: "condition_hasil_pa",
    linkCol: "nopen",
    icon: "🔬",
    accent: "pink",
    orderCol: "refId",
    primary: { label: "Kondisi", from: codeDisplay },
    meta: [
      { label: "Keparahan", from: [{ col: "severity" }] },
      {
        label: "Status klinis",
        from: [{ col: "clinicalStatus", path: "$.coding[0].code" }],
        type: "code",
      },
      { label: "Direkam", from: [{ col: "recordedDate" }], type: "datetime" },
    ],
  },
  {
    key: "allergy_intolerance",
    label: "Alergi & Intoleransi",
    family: "Kondisi & Diagnosis",
    resourceType: "AllergyIntolerance",
    table: "allergy_intolerance",
    linkCol: "nopen",
    icon: "⚠️",
    accent: "orange",
    orderCol: "refId",
    primary: { label: "Alergen", from: codeDisplay },
    meta: [
      { label: "Kategori", from: [{ col: "category", path: "$[0]" }] },
      {
        label: "Status klinis",
        from: [{ col: "clinicalStatus", path: "$.coding[0].code" }],
        type: "code",
      },
      {
        label: "Verifikasi",
        from: [{ col: "verificationStatus", path: "$.coding[0].code" }],
        type: "code",
      },
      { label: "Direkam", from: [{ col: "recordedDate" }], type: "datetime" },
    ],
  },

  // ── Observasi ────────────────────────────────────────────
  {
    key: "observation",
    label: "Observation",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation",
    linkCol: "nopen",
    icon: "📈",
    accent: "sky",
    orderCol: "refId",
    primary: { label: "Pemeriksaan", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
          { col: "valueString" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_faktor_risiko",
    label: "Faktor Risiko",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_faktor_risiko",
    linkCol: "nopen",
    icon: "⚡",
    accent: "sky",
    orderCol: "refId",
    primary: { label: "Faktor risiko", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueCodeableConcept", path: "$.coding[0].display" },
          { col: "valueString" },
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_metode_penilaian_nyeri",
    label: "Penilaian Nyeri (Skor)",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_metode_penilaian_nyeri",
    linkCol: "nopen",
    icon: "📏",
    accent: "cyan",
    orderCol: "refId",
    primary: { label: "Metode", from: codeDisplay },
    meta: [
      {
        label: "Skor",
        from: [
          { col: "valueInteger" },
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
          { col: "valueCodeableConcept", path: "$.coding[0].display" },
          { col: "valueString" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_penilaian_nyeri",
    label: "Penilaian Nyeri",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_penilaian_nyeri",
    linkCol: "nopen",
    icon: "😖",
    accent: "cyan",
    orderCol: "refId",
    primary: { label: "Penilaian", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueBoolean" },
          { col: "valueCodeableConcept", path: "$.coding[0].display" },
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
          { col: "valueString" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_nutrisi",
    label: "Nutrisi",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_nutrisi",
    linkCol: "nopen",
    icon: "🥗",
    accent: "teal",
    orderCol: "refId",
    primary: { label: "Pengukuran", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
          { col: "valueString" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_anamnesis_riwayat_lainnya",
    label: "Riwayat Lainnya (Anamnesis)",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_anamnesis_riwayat_lainnya",
    linkCol: "nopen",
    icon: "🗣️",
    accent: "sky",
    orderCol: "refId",
    primary: { label: "Riwayat", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueCodeableConcept", path: "$.coding[0].display" },
          { col: "valueString" },
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },
  {
    key: "observation_pemeriksaan_ekg",
    label: "Pemeriksaan EKG",
    family: "Observasi",
    resourceType: "Observation",
    table: "observation_pemeriksaan_ekg",
    linkCol: "nopen",
    icon: "🫀",
    accent: "cyan",
    orderCol: "refId",
    primary: { label: "Pemeriksaan", from: codeDisplay },
    meta: [
      {
        label: "Nilai",
        from: [
          { col: "valueCodeableConcept", path: "$.coding[0].display" },
          { col: "valueQuantity", path: "$.value", unitPath: "$.unit" },
          { col: "valueString" },
        ],
      },
      OBS_STATUS,
      OBS_TIME,
    ],
  },

  // ── Tindakan & Obat ──────────────────────────────────────
  {
    key: "procedure",
    label: "Tindakan",
    family: "Tindakan & Obat",
    resourceType: "Procedure",
    table: "procedure",
    linkCol: "nopen",
    icon: "🛠️",
    accent: "violet",
    orderCol: "refId",
    primary: { label: "Tindakan", from: codeDisplay },
    meta: [
      { label: "Kode", from: [code("$.coding[0].code")], type: "code" },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      {
        label: "Waktu",
        from: [{ col: "performedPeriod", path: "$.start" }],
        type: "datetime",
      },
    ],
  },
  {
    key: "medication_request",
    label: "Peresepan",
    family: "Tindakan & Obat",
    resourceType: "MedicationRequest",
    table: "medication_request",
    linkCol: "nopen",
    icon: "💊",
    accent: "amber",
    orderCol: "refId",
    primary: { label: "Obat", from: [{ col: "medicationReference", path: "$.display" }] },
    meta: [
      { label: "Aturan pakai", from: [{ col: "dosageInstruction", path: "$[0].text" }] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Ditulis", from: [{ col: "authoredOn" }], type: "datetime" },
    ],
  },
  {
    key: "medication_dispanse",
    label: "Obat Diambil",
    family: "Tindakan & Obat",
    resourceType: "MedicationDispense",
    table: "medication_dispanse",
    linkCol: "nopen",
    icon: "📦",
    accent: "orange",
    orderCol: "refId",
    primary: { label: "Obat", from: [{ col: "medicationReference", path: "$.display" }] },
    meta: [
      {
        label: "Jumlah",
        from: [{ col: "quantity", path: "$.value", unitPath: "$.unit" }],
      },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Diserahkan", from: [{ col: "whenHandedOver" }], type: "datetime" },
    ],
  },

  // ── Permintaan Layanan & Lab ─────────────────────────────
  {
    key: "service_request",
    label: "Permintaan Layanan",
    family: "Permintaan Layanan & Lab",
    resourceType: "ServiceRequest",
    table: "service_request",
    linkCol: "nopen",
    icon: "📋",
    accent: "cyan",
    orderCol: "refId",
    primary: { label: "Layanan", from: [code("$.text"), code("$.coding[0].display")] },
    meta: [
      { label: "Kategori", from: [{ col: "category", path: "$[0].coding[0].display" }] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Waktu", from: [{ col: "occurrenceDateTime" }], type: "datetime" },
    ],
  },
  {
    key: "service_request_jadwal_kontrol",
    label: "Jadwal Kontrol",
    family: "Permintaan Layanan & Lab",
    resourceType: "ServiceRequest",
    table: "service_request_jadwal_kontrol",
    linkCol: "nopen",
    icon: "📅",
    accent: "blue",
    orderCol: "refId",
    primary: { label: "Layanan", from: [code("$.coding[0].display"), code("$.text")] },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Waktu", from: [{ col: "occurrenceDateTime" }], type: "datetime" },
      { label: "Instruksi", from: [{ col: "patientInstruction" }] },
    ],
  },
  {
    key: "service_request_perencana_rawat_inap",
    label: "Perencanaan Rawat Inap",
    family: "Permintaan Layanan & Lab",
    resourceType: "ServiceRequest",
    table: "service_request_perencana_rawat_inap",
    linkCol: "nopen",
    icon: "🏨",
    accent: "indigo",
    orderCol: "refId",
    primary: { label: "Layanan", from: [code("$.text"), code("$.coding[0].display")] },
    meta: [
      { label: "Detail", from: [{ col: "orderDetail", path: "$[0].text" }] },
      { label: "Catatan", from: [{ col: "note", path: "$[0].text" }] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      {
        label: "Mulai",
        from: [{ col: "occurrencePeriod", path: "$.start" }],
        type: "datetime",
      },
    ],
  },
  {
    key: "specimen",
    label: "Spesimen Lab",
    family: "Permintaan Layanan & Lab",
    resourceType: "Specimen",
    table: "specimen",
    linkCol: "nopen",
    icon: "🧪",
    accent: "teal",
    orderCol: "refId",
    primary: {
      label: "Spesimen",
      from: [{ col: "type", path: "$.coding[0].display" }, { col: "type", path: "$.text" }],
    },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Diterima", from: [{ col: "receivedTime" }], type: "datetime" },
    ],
  },

  // ── Radiologi ────────────────────────────────────────────
  {
    key: "imaging_study",
    label: "Radiologi",
    family: "Radiologi",
    resourceType: "ImagingStudy",
    table: "imaging_study",
    linkCol: "nopen",
    icon: "🩻",
    accent: "indigo",
    orderCol: "refId",
    primary: { label: "Ref", from: [{ col: "refId" }], type: "code" },
    meta: [],
  },

  // ── Rencana Perawatan ────────────────────────────────────
  {
    key: "care_plan",
    label: "Rencana Perawatan",
    family: "Rencana Perawatan",
    resourceType: "CarePlan",
    table: "care_plan",
    linkCol: "nopen",
    icon: "🗓️",
    accent: "emerald",
    orderCol: "refId",
    primary: { label: "Rencana", from: [{ col: "title" }, { col: "description" }] },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Kategori", from: [{ col: "category", path: "$[0].coding[0].display" }] },
      { label: "Dibuat", from: [{ col: "created" }], type: "datetime" },
    ],
  },
  {
    key: "care_plan_jadwal_kontrol",
    label: "Rencana Kontrol",
    family: "Rencana Perawatan",
    resourceType: "CarePlan",
    table: "care_plan_jadwal_kontrol",
    linkCol: "nopen",
    icon: "📆",
    accent: "lime",
    orderCol: "refId",
    primary: { label: "Rencana", from: [{ col: "title" }, { col: "description" }] },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Dibuat", from: [{ col: "created" }], type: "datetime" },
    ],
  },

  // ── Dokumen & Laporan ────────────────────────────────────
  {
    key: "composition",
    label: "Dokumen (Composition)",
    family: "Dokumen & Laporan",
    resourceType: "Composition",
    table: "composition",
    linkCol: "nopen",
    icon: "📄",
    accent: "blue",
    orderCol: "refId",
    primary: {
      label: "Judul",
      from: [{ col: "title" }, { col: "type", path: "$.coding[0].display" }],
    },
    meta: [
      { label: "Jenis", from: [{ col: "type", path: "$.coding[0].display" }] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Tanggal", from: [{ col: "date" }], type: "datetime" },
    ],
  },
  {
    key: "composition_resume",
    label: "Resume Medis",
    family: "Dokumen & Laporan",
    resourceType: "Composition",
    table: "composition_resume",
    linkCol: "nopen",
    icon: "📃",
    accent: "indigo",
    orderCol: "nopen",
    primary: {
      label: "Judul",
      from: [{ col: "title" }, { col: "type", path: "$.coding[0].display" }],
    },
    meta: [
      { label: "Jenis", from: [{ col: "type", path: "$.coding[0].display" }] },
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Tanggal", from: [{ col: "date" }], type: "datetime" },
    ],
  },
  {
    key: "questionnaire_response",
    label: "Kuesioner (Jawaban)",
    family: "Dokumen & Laporan",
    resourceType: "QuestionnaireResponse",
    table: "questionnaire_response",
    linkCol: "nopen",
    icon: "📝",
    accent: "violet",
    orderCol: "refId",
    primary: { label: "Kuesioner", from: [{ col: "questionnaire" }], type: "code" },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Diisi", from: [{ col: "authored" }], type: "datetime" },
    ],
  },
  {
    key: "diagnostic_report",
    label: "Laporan Diagnostik",
    family: "Dokumen & Laporan",
    resourceType: "DiagnosticReport",
    table: "diagnostic_report",
    linkCol: "nopen",
    icon: "🧾",
    accent: "fuchsia",
    orderCol: "refId",
    primary: { label: "Pemeriksaan", from: codeDisplay },
    meta: [
      { label: "Status", from: [{ col: "status" }], type: "code" },
      { label: "Kesimpulan", from: [{ col: "conclusion" }] },
      { label: "Waktu", from: [{ col: "effectiveDateTime" }], type: "datetime" },
    ],
  },
];

// ── Formatting ──────────────────────────────────────────────
function pick(x: unknown): string | null {
  if (x == null) return null;
  const s = String(x).trim();
  return s === "" || s === "null" ? null : s;
}

function fmtDateTime(raw: unknown): string | null {
  const s = pick(raw);
  if (s == null) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  try {
    return new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return s;
  }
}

// ── Tipe hasil ──────────────────────────────────────────────
export interface DetailMeta {
  label: string;
  value: string;
  type?: string;
}
export interface DetailItem {
  sent: boolean;
  satuSehatId: string | null;
  primary: string | null;
  meta: DetailMeta[];
}
export interface DetailGroup {
  key: string;
  label: string;
  family: string;
  resourceType: string;
  icon: string;
  accent: string;
  total: number;
  sent: number;
  truncated: boolean;
  items: DetailItem[];
}
export interface EncounterHead {
  refId: string;
  found: boolean;
  sent: boolean;
  satuSehatId: string | null;
  status: string | null;
  className: string | null;
  classCode: string | null;
  start: string | null;
  end: string | null;
  patient: string | null;
  patientRef: string | null;
}
export interface EncounterDetail {
  encounter: EncounterHead;
  groups: DetailGroup[];
}

// ── Builder SELECT untuk satu resource ──────────────────────
/** Fragmen SELECT untuk satu field (semua sumber di `from`), dialias f{i}_{j}. */
function fieldExprs(f: DetailField, i: number): string[] {
  const out: string[] = [];
  f.from.forEach((src, j) => {
    const col = ident(src.col);
    const main = src.path
      ? `JSON_UNQUOTE(JSON_EXTRACT(\`${col}\`, '${identPath(src.path)}'))`
      : `\`${col}\``;
    out.push(`${main} AS f${i}_${j}`);
    if (src.unitPath) {
      out.push(
        `JSON_UNQUOTE(JSON_EXTRACT(\`${col}\`, '${identPath(src.unitPath)}')) AS f${i}_${j}u`,
      );
    }
  });
  return out;
}

/** Nilai field: sumber non-null PERTAMA menang; tambahkan satuan bila ada. */
function composeField(
  f: DetailField,
  row: Record<string, unknown>,
  i: number,
): string | null {
  for (let j = 0; j < f.from.length; j++) {
    let v = pick(row[`f${i}_${j}`]);
    if (v == null) continue;
    if (f.type === "datetime") v = fmtDateTime(v) ?? v;
    const uk = `f${i}_${j}u`;
    const unit = uk in row ? pick(row[uk]) : null;
    if (unit) v = `${v} ${unit}`;
    return v;
  }
  return null;
}

async function fetchGroup(
  spec: DetailResourceSpec,
  refId: string,
): Promise<DetailGroup> {
  const table = ident(spec.table);
  const link = ident(spec.linkCol);
  const order = ident(spec.orderCol);
  const fields = [spec.primary, ...spec.meta];

  const selects = ["id AS _id"];
  fields.forEach((f, i) => selects.push(...fieldExprs(f, i)));

  const raw = await simgosQuery<Record<string, unknown>>(
    `SELECT ${selects.join(", ")}
       FROM \`${SCHEMA}\`.\`${table}\`
      WHERE \`${link}\` = ?
      ORDER BY \`${order}\` DESC
      LIMIT ${ITEM_LIMIT + 1}`,
    [refId],
  );

  const truncated = raw.length > ITEM_LIMIT;
  const sliced = truncated ? raw.slice(0, ITEM_LIMIT) : raw;

  let sent = 0;
  const items: DetailItem[] = sliced.map((r) => {
    const isSent = r._id != null;
    if (isSent) sent++;
    const meta: DetailMeta[] = [];
    spec.meta.forEach((f, idx) => {
      const value = composeField(f, r, idx + 1);
      if (value != null) meta.push({ label: f.label, value, type: f.type });
    });
    return {
      sent: isSent,
      satuSehatId: isSent ? String(r._id) : null,
      primary: composeField(spec.primary, r, 0),
      meta,
    };
  });

  return {
    key: spec.key,
    label: spec.label,
    family: spec.family,
    resourceType: spec.resourceType,
    icon: spec.icon,
    accent: spec.accent,
    total: sliced.length,
    sent,
    truncated,
    items,
  };
}

async function fetchHead(refId: string): Promise<EncounterHead> {
  const rows = await simgosQuery<Record<string, unknown>>(
    `SELECT
        refId,
        id AS _id,
        status,
        JSON_UNQUOTE(JSON_EXTRACT(\`class\`, '$.display'))    AS classDisplay,
        JSON_UNQUOTE(JSON_EXTRACT(\`class\`, '$.code'))       AS classCode,
        JSON_UNQUOTE(JSON_EXTRACT(\`period\`, '$.start'))     AS periodStart,
        JSON_UNQUOTE(JSON_EXTRACT(\`period\`, '$.end'))       AS periodEnd,
        JSON_UNQUOTE(JSON_EXTRACT(\`subject\`, '$.display'))  AS patient,
        JSON_UNQUOTE(JSON_EXTRACT(\`subject\`, '$.reference')) AS patientRef
      FROM \`${SCHEMA}\`.\`encounter\`
     WHERE refId = ?
     LIMIT 1`,
    [refId],
  );
  const r = rows[0];
  if (!r) {
    return {
      refId,
      found: false,
      sent: false,
      satuSehatId: null,
      status: null,
      className: null,
      classCode: null,
      start: null,
      end: null,
      patient: null,
      patientRef: null,
    };
  }
  return {
    refId: String(r.refId),
    found: true,
    sent: r._id != null,
    satuSehatId: r._id != null ? String(r._id) : null,
    status: pick(r.status),
    className: pick(r.classDisplay),
    classCode: pick(r.classCode),
    start: fmtDateTime(r.periodStart),
    end: fmtDateTime(r.periodEnd),
    patient: pick(r.patient),
    patientRef: pick(r.patientRef),
  };
}

/**
 * Ambil detail satu encounter: header + seluruh resource klinis anak.
 * 🔒 Read-only. Semua kueri paralel & memakai indeks `nopen`.
 */
export async function getEncounterDetail(
  refId: string,
): Promise<EncounterDetail> {
  const [encounter, ...groups] = await Promise.all([
    fetchHead(refId),
    ...RESOURCES.map((spec) => fetchGroup(spec, refId)),
  ]);
  return { encounter, groups };
}
