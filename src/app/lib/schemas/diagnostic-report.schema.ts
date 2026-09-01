/**
 * lib/schemas/diagnostic-report.schema.ts
 *
 * Yup validation schema untuk form DiagnosticReport (laporan diagnostik / lab).
 * Pola konsisten dengan medication-dispense.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/diagnosticreport.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → DiagnosticReport.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = [
  "registered",
  "partial",
  "preliminary",
  "final",
  "amended",
  "corrected",
  "appended",
  "cancelled",
  "entered-in-error",
  "unknown",
] as const;

const optionalUuid = (label: string) =>
  Yup.string()
    .optional()
    .default(undefined)
    .test(`uuid-if-present-${label}`, `${label} harus dalam format UUID`, (v) => {
      if (!v) return true;
      return UUID_REGEX.test(v);
    })
    .trim();

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const diagnosticReportFormSchema = Yup.object({
  diagnosticReportId: optionalUuid("DiagnosticReport ID"),

  status: Yup.string()
    .oneOf(STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),

  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(100, "Nama kategori maksimal 100 karakter")
    .trim(),

  // Kode pemeriksaan (biasanya LOINC)
  codeSystem: Yup.string().required("System kode wajib diisi").trim(),
  codeCode: Yup.string().required("Kode pemeriksaan wajib diisi").trim(),
  codeDisplay: Yup.string()
    .required("Nama pemeriksaan wajib diisi")
    .max(300, "Nama pemeriksaan maksimal 300 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter (konteks kunjungan — harus terkirim dulu)
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Hasil Observation (result[]) — satu UUID per baris. Observasi harus
  // terkirim dulu. Opsional di form (pakai Autofill/Raw untuk daftar penuh).
  resultObservationIds: Yup.string().optional().default(undefined),

  // Referensi pendukung — opsional
  basedOnServiceRequestId: optionalUuid("ServiceRequest ID"),
  specimenId: optionalUuid("Specimen ID"),
  performerPractitionerId: Yup.string().optional().default(undefined).trim(),
  performerOrganizationId: Yup.string().optional().default(undefined).trim(),

  effectiveDateTime: Yup.string()
    .required("Waktu pemeriksaan wajib diisi")
    .test("valid-date", "Waktu tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),
  issued: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-issued", "Waktu terbit tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    }),

  conclusion: Yup.string()
    .optional()
    .default(undefined)
    .max(2000, "Kesimpulan maksimal 2000 karakter")
    .trim(),
});

export type DiagnosticReportFormValues = {
  diagnosticReportId?: string;
  status: (typeof STATUS)[number];
  categoryCode: string;
  categoryDisplay: string;
  codeSystem: string;
  codeCode: string;
  codeDisplay: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  resultObservationIds?: string;
  basedOnServiceRequestId?: string;
  specimenId?: string;
  performerPractitionerId?: string;
  performerOrganizationId?: string;
  effectiveDateTime: string;
  issued?: string;
  conclusion?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const diagnosticReportGetSchema = Yup.object({
  diagnosticReportId: optionalUuid("DiagnosticReport ID").default(undefined),
  patientId: Yup.string().optional().default(undefined).trim(),
  encounterId: Yup.string().optional().default(undefined).trim(),
  specimenId: Yup.string().optional().default(undefined).trim(),
});

export type DiagnosticReportGetValues = {
  diagnosticReportId?: string;
  patientId?: string;
  encounterId?: string;
  specimenId?: string;
};
