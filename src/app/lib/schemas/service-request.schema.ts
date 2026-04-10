/**
 * lib/schemas/service-request.schema.ts
 *
 * Yup validation schema untuk form ServiceRequest (radiologi).
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Struktur payload ServiceRequest Satu Sehat:
 *   - identifier       : nomor SR lokal + nomor ACSN (pakai Org_id dari env)
 *   - status / intent  : status lifecycle dan intent order
 *   - priority         : routine | urgent | asap | stat
 *   - category         : fixed — SNOMED 363679005 "Imaging" (tidak diinput user)
 *   - code             : pair LOINC + KPTL — dipilih dari preset atau custom
 *   - orderDetail      : modality DICOM + AE title
 *   - subject          : Patient
 *   - encounter        : Encounter
 *   - occurrenceDateTime / authoredOn : tanggal pemeriksaan & order
 *   - requester        : Practitioner (dokter pengirim)
 *   - performer        : Practitioner (radiolog)
 *   - bodySite         : SNOMED body site — dipilih dari preset atau custom
 *   - reasonCode       : ICD-10 diagnosis — dipilih dari preset atau custom
 *   - supportingInfo   : referensi opsional (Observation, AllergyIntolerance, Procedure)
 *
 * Referensi FHIR: https://www.hl7.org/fhir/servicerequest.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 — untuk ID resource FHIR */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifier lokal — alphanumeric, strip, underscore */
const LOCAL_ID_REGEX = /^[a-zA-Z0-9\-_]{1,50}$/;

// ─────────────────────────────────────────────
// Helper: UUID opsional
// ─────────────────────────────────────────────

const optionalUuid = (label: string) =>
  Yup.string()
    .optional()
    .default(undefined)
    .test(
      `uuid-if-present-${label}`,
      `${label} harus dalam format UUID`,
      (value) => {
        if (!value) return true;
        return UUID_REGEX.test(value);
      },
    )
    .trim();

// ─────────────────────────────────────────────
// Enum values
// ─────────────────────────────────────────────

export const SERVICE_REQUEST_STATUS_VALUES = [
  "draft",
  "active",
  "on-hold",
  "revoked",
  "completed",
  "entered-in-error",
  "unknown",
] as const;
export type ServiceRequestStatusValue =
  (typeof SERVICE_REQUEST_STATUS_VALUES)[number];

export const SERVICE_REQUEST_INTENT_VALUES = [
  "proposal",
  "plan",
  "directive",
  "order",
  "original-order",
  "reflex-order",
  "filler-order",
  "instance-order",
  "option",
] as const;
export type ServiceRequestIntentValue =
  (typeof SERVICE_REQUEST_INTENT_VALUES)[number];

export const SERVICE_REQUEST_PRIORITY_VALUES = [
  "routine",
  "urgent",
  "asap",
  "stat",
] as const;
export type ServiceRequestPriorityValue =
  (typeof SERVICE_REQUEST_PRIORITY_VALUES)[number];

// ─────────────────────────────────────────────
// Modality Codes (DICOM)
// ─────────────────────────────────────────────

export const MODALITY_CODES = [
  { code: "US", label: "Ultrasound (US)" },
  { code: "CR", label: "Computed Radiography / X-Ray (CR)" },
  { code: "CT", label: "Computed Tomography (CT)" },
  { code: "MR", label: "Magnetic Resonance (MR)" },
  { code: "DX", label: "Digital Radiography (DX)" },
  { code: "NM", label: "Nuclear Medicine (NM)" },
  { code: "RF", label: "Fluoroscopy (RF)" },
] as const;

// ─────────────────────────────────────────────
// Imaging Presets (LOINC + KPTL + Modality + BodySite)
// ─────────────────────────────────────────────

/**
 * Preset prosedur radiologi — pilih dari daftar atau gunakan "custom".
 * Saat preset dipilih, form akan otomatis mengisi:
 *   - loincCode / loincDisplay
 *   - kptlCode / kptlDisplay
 *   - procedureText
 *   - modalityCode
 *   - bodySiteCode / bodySiteDisplay
 */
export const IMAGING_PRESETS = {
  usg_ginjal: {
    label: "USG Ginjal",
    loinc: { code: "38036-0", display: "US Kidney" },
    kptl: { code: "31537", display: "USG Ginjal" },
    text: "Pemeriksaan USG Ginjal",
    modalityCode: "US",
    bodySite: { code: "64033007", display: "Kidney structure" },
  },
  usg_abdomen: {
    label: "USG Abdomen",
    loinc: { code: "24558-9", display: "US Abdomen" },
    kptl: { code: "31536", display: "USG Abdomen" },
    text: "Pemeriksaan USG Abdomen",
    modalityCode: "US",
    bodySite: { code: "818983003", display: "Abdominal structure" },
  },
  usg_hepar: {
    label: "USG Hepar / Liver",
    loinc: { code: "24885-6", display: "US Liver" },
    kptl: { code: "31538", display: "USG Hepar" },
    text: "Pemeriksaan USG Hepar",
    modalityCode: "US",
    bodySite: { code: "10200004", display: "Liver structure" },
  },
  xray_thorax: {
    label: "Foto Thorax (X-Ray PA)",
    loinc: { code: "24627-2", display: "XR Chest" },
    kptl: { code: "31525", display: "Foto Thorax" },
    text: "Pemeriksaan Foto Thorax PA",
    modalityCode: "CR",
    bodySite: { code: "51185008", display: "Thoracic structure" },
  },
  xray_ekstremitas: {
    label: "Foto Ekstremitas (X-Ray)",
    loinc: { code: "36643-5", display: "XR Extremity" },
    kptl: { code: "31527", display: "Foto Ekstremitas" },
    text: "Pemeriksaan Foto Ekstremitas",
    modalityCode: "CR",
    bodySite: { code: "66019005", display: "Extremity structure" },
  },
  ct_kepala: {
    label: "CT Scan Kepala",
    loinc: { code: "24725-4", display: "CT Head" },
    kptl: { code: "31529", display: "CT Scan Kepala" },
    text: "Pemeriksaan CT Scan Kepala",
    modalityCode: "CT",
    bodySite: { code: "69536005", display: "Head structure" },
  },
  ct_thorax: {
    label: "CT Scan Thorax",
    loinc: { code: "25056-3", display: "CT Chest" },
    kptl: { code: "31530", display: "CT Scan Thorax" },
    text: "Pemeriksaan CT Scan Thorax",
    modalityCode: "CT",
    bodySite: { code: "51185008", display: "Thoracic structure" },
  },
  ct_abdomen: {
    label: "CT Scan Abdomen",
    loinc: { code: "24550-6", display: "CT Abdomen" },
    kptl: { code: "31531", display: "CT Scan Abdomen" },
    text: "Pemeriksaan CT Scan Abdomen",
    modalityCode: "CT",
    bodySite: { code: "818983003", display: "Abdominal structure" },
  },
  mri_kepala: {
    label: "MRI Kepala",
    loinc: { code: "24590-2", display: "MR Head" },
    kptl: { code: "31535", display: "MRI Kepala" },
    text: "Pemeriksaan MRI Kepala",
    modalityCode: "MR",
    bodySite: { code: "69536005", display: "Head structure" },
  },
  mri_spine: {
    label: "MRI Spine",
    loinc: { code: "36801-9", display: "MR Spine" },
    kptl: { code: "31534", display: "MRI Spine" },
    text: "Pemeriksaan MRI Spine",
    modalityCode: "MR",
    bodySite: { code: "421060004", display: "Vertebral column structure" },
  },
  custom: {
    label: "Custom / Lainnya",
    loinc: { code: "", display: "" },
    kptl: { code: "", display: "" },
    text: "",
    modalityCode: "",
    bodySite: { code: "", display: "" },
  },
} as const;

export type ImagingPresetKey = keyof typeof IMAGING_PRESETS;

// ─────────────────────────────────────────────
// ICD-10 Diagnosis Presets
// ─────────────────────────────────────────────

/**
 * Preset diagnosis ICD-10 umum untuk permintaan radiologi.
 * Pilih "custom" untuk memasukkan kode dan display manual.
 * Pilih "none" untuk tidak menyertakan reasonCode dalam payload.
 */
export const ICD10_PRESETS = {
  none: { code: "", display: "" },
  n18_5: { code: "N18.5", display: "Chronic kidney disease, stage 5" },
  n18_3: { code: "N18.3", display: "Chronic kidney disease, stage 3" },
  n20_0: { code: "N20.0", display: "Calculus of kidney" },
  k80_2: { code: "K80.2", display: "Calculus of gallbladder without cholecystitis" },
  r10_4: { code: "R10.4", display: "Other and unspecified abdominal pain" },
  j18_9: { code: "J18.9", display: "Pneumonia, unspecified organism" },
  i21_9: { code: "I21.9", display: "Acute myocardial infarction, unspecified" },
  i61_9: { code: "I61.9", display: "Intracerebral haemorrhage, unspecified" },
  s09_9: { code: "S09.9", display: "Unspecified injury of head" },
  custom: { code: "", display: "" },
} as const;

export type Icd10PresetKey = keyof typeof ICD10_PRESETS;

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const serviceRequestFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  serviceRequestId: optionalUuid("ServiceRequest ID"),

  // ── Nomor ServiceRequest lokal ──
  identifierValue: Yup.string()
    .required("Nomor ServiceRequest wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Identifier hanya boleh huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // ── Nomor ACSN ──
  acsnValue: Yup.string()
    .required("Nomor ACSN wajib diisi")
    .max(50, "ACSN maksimal 50 karakter")
    .trim(),

  // ── Status, intent, prioritas ──
  status: Yup.string()
    .oneOf(SERVICE_REQUEST_STATUS_VALUES, "Status tidak valid")
    .required("Status wajib dipilih"),

  intent: Yup.string()
    .oneOf(SERVICE_REQUEST_INTENT_VALUES, "Intent tidak valid")
    .required("Intent wajib dipilih"),

  priority: Yup.string()
    .oneOf(SERVICE_REQUEST_PRIORITY_VALUES, "Prioritas tidak valid")
    .required("Prioritas wajib dipilih"),

  // ── Preset prosedur ──
  procedurePreset: Yup.string().required(),

  // ── Kode prosedur (LOINC + KPTL) ──
  loincCode: Yup.string().required("Kode LOINC wajib diisi").max(20).trim(),
  loincDisplay: Yup.string().required("Nama LOINC wajib diisi").max(100).trim(),
  kptlCode: Yup.string().required("Kode KPTL wajib diisi").max(20).trim(),
  kptlDisplay: Yup.string().required("Nama KPTL wajib diisi").max(100).trim(),
  procedureText: Yup.string()
    .required("Nama prosedur wajib diisi")
    .max(200, "Nama prosedur maksimal 200 karakter")
    .trim(),

  // ── Modalitas (DICOM) + AE Title ──
  modalityCode: Yup.string()
    .required("Kode modalitas wajib dipilih")
    .trim(),
  aeTitleDisplay: Yup.string()
    .required("AE Title wajib diisi")
    .max(50, "AE Title maksimal 50 karakter")
    .trim(),

  // ── Referensi Patient & Encounter ──
  patientId: Yup.string().required("Patient ID wajib diisi").trim(),
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // ── Tanggal pemeriksaan & order ──
  occurrenceDateTime: Yup.string()
    .required("Tanggal pemeriksaan wajib diisi")
    .test("valid-dt", "Format tanggal tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),

  authoredOn: Yup.string()
    .required("Tanggal order wajib diisi")
    .test("valid-dt", "Format tanggal tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),

  // ── Dokter pengirim (requester) ──
  requesterId: Yup.string().required("ID dokter pengirim wajib diisi").trim(),
  requesterDisplay: Yup.string()
    .required("Nama dokter pengirim wajib diisi")
    .max(200)
    .trim(),

  // ── Radiolog (performer) ──
  performerId: Yup.string().required("ID radiolog wajib diisi").trim(),
  performerDisplay: Yup.string()
    .required("Nama radiolog wajib diisi")
    .max(200)
    .trim(),

  // ── Body site (opsional — "none" = tidak disertakan) ──
  bodySitePreset: Yup.string().required(),
  bodySiteCode: Yup.string().optional().default(undefined).trim(),
  bodySiteDisplay: Yup.string().optional().default(undefined).trim(),

  // ── Diagnosis ICD-10 (opsional — "none" = tidak disertakan) ──
  diagnosisPreset: Yup.string().required(),
  diagnosisCode: Yup.string().optional().default(undefined).trim(),
  diagnosisDisplay: Yup.string().optional().default(undefined).trim(),

  // ── Informasi pendukung (semua opsional) ──
  observationId: Yup.string().optional().default(undefined).trim(),
  allergyId: Yup.string().optional().default(undefined).trim(),
  procedureId: Yup.string().optional().default(undefined).trim(),
});

export type ServiceRequestFormValues = {
  serviceRequestId?: string;
  identifierValue: string;
  acsnValue: string;
  status: ServiceRequestStatusValue;
  intent: ServiceRequestIntentValue;
  priority: ServiceRequestPriorityValue;
  procedurePreset: string;
  loincCode: string;
  loincDisplay: string;
  kptlCode: string;
  kptlDisplay: string;
  procedureText: string;
  modalityCode: string;
  aeTitleDisplay: string;
  patientId: string;
  encounterId: string;
  occurrenceDateTime: string;
  authoredOn: string;
  requesterId: string;
  requesterDisplay: string;
  performerId: string;
  performerDisplay: string;
  bodySitePreset: string;
  bodySiteCode?: string;
  bodySiteDisplay?: string;
  diagnosisPreset: string;
  diagnosisCode?: string;
  diagnosisDisplay?: string;
  observationId?: string;
  allergyId?: string;
  procedureId?: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const serviceRequestGetSchema = Yup.object({
  serviceRequestId: optionalUuid("ServiceRequest ID"),

  patientId: Yup.string().optional().default(undefined).trim(),

  status: Yup.string()
    .oneOf(["", ...SERVICE_REQUEST_STATUS_VALUES], "Status tidak valid")
    .optional()
    .default(undefined),
});

export type ServiceRequestGetValues = {
  serviceRequestId?: string;
  patientId?: string;
  status?: "" | ServiceRequestStatusValue;
};
