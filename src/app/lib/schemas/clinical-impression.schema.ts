/**
 * lib/schemas/clinical-impression.schema.ts
 *
 * Yup validation schema untuk form ClinicalImpression.
 * Mengikuti pola yang sama dengan careplan.schema.ts agar konsisten.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/clinicalimpression.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/**
 * UUID v4 format — digunakan untuk memvalidasi semua ID referensi
 * agar tidak ada path traversal / IDOR.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kode SNOMED CT — harus berupa angka 6 hingga 18 digit.
 */
const SNOMED_CODE_REGEX = /^\d{6,18}$/;

// ─────────────────────────────────────────────
// Helper: validasi UUID opsional (boleh kosong)
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
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

/**
 * Schema validasi untuk form input ClinicalImpression (POST, PUT, PATCH).
 * Semua field wajib kecuali yang ditandai opsional.
 */
export const clinicalImpressionFormSchema = Yup.object({
  // ── Identifikasi (hanya untuk PUT/PATCH) ──
  clinicalImpressionId: optionalUuid("ClinicalImpression ID"),

  // ── Status lifecycle ──
  status: Yup.string()
    .oneOf(
      ["in-progress", "completed", "entered-in-error"],
      "Status tidak valid. Pilih salah satu: in-progress, completed, entered-in-error",
    )
    .required("Status wajib dipilih"),

  // ── Kode SNOMED CT ──
  codeSnomed: Yup.string()
    .required("Kode SNOMED wajib diisi")
    .matches(SNOMED_CODE_REGEX, "Kode SNOMED harus berupa angka 6–18 digit")
    .trim(),

  codeDisplay: Yup.string()
    .required("Display kode wajib diisi")
    .max(200, "Display kode maksimal 200 karakter")
    .trim(),

  // ── Referensi subject (Patient) ──
  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientName: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // ── Referensi Encounter ──
  encounterId: Yup.string()
    .required("Encounter ID wajib diisi")
    .trim(),

  // ── Referensi Assessor (Practitioner) ──
  practitionerId: Yup.string()
    .required("Practitioner ID wajib diisi")
    .trim(),

  // ── Tanggal efektif penilaian ──
  effectiveDateTime: Yup.string()
    .required("Tanggal efektif wajib diisi")
    .test("is-valid-datetime", "Format tanggal tidak valid", (value) => {
      if (!value) return false;
      const d = new Date(value);
      return !isNaN(d.getTime());
    }),

  // ── Tanggal dicatat ──
  date: Yup.string()
    .required("Tanggal pencatatan wajib diisi")
    .test("is-valid-date", "Format tanggal tidak valid", (value) => {
      if (!value) return false;
      const d = new Date(value);
      return !isNaN(d.getTime());
    }),

  // ── Ringkasan klinis (opsional tapi praktis selalu diisi) ──
  summary: Yup.string()
    .optional()
    .default(undefined)
    .max(5000, "Ringkasan maksimal 5000 karakter")
    .trim(),
});

export type ClinicalImpressionFormValues = {
  clinicalImpressionId?: string;
  status: "in-progress" | "completed" | "entered-in-error";
  codeSnomed: string;
  codeDisplay: string;
  patientId: string;
  patientName: string;
  encounterId: string;
  practitionerId: string;
  effectiveDateTime: string;
  date: string;
  summary?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

/**
 * Schema validasi untuk form pencarian ClinicalImpression (GET).
 * Semua field opsional — boleh kombinasi atau kosong semua.
 */
export const clinicalImpressionGetSchema = Yup.object({
  /** ID spesifik — jika diisi, query lain diabaikan */
  clinicalImpressionId: optionalUuid("ClinicalImpression ID"),

  /** Filter berdasarkan status */
  status: Yup.string()
    .oneOf(
      ["", "in-progress", "completed", "entered-in-error"],
      "Status tidak valid",
    )
    .optional()
    .default(undefined),

  /** Filter berdasarkan Patient UUID */
  patientId: optionalUuid("Patient ID"),
});

export type ClinicalImpressionGetValues = {
  clinicalImpressionId?: string;
  status?: "" | "in-progress" | "completed" | "entered-in-error";
  patientId?: string;
};
