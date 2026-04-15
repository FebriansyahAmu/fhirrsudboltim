/**
 * lib/schemas/allergy-intolerance.schema.ts
 *
 * Yup validation schema untuk form AllergyIntolerance.
 * Pola konsisten dengan clinical-impression.schema.ts dan careplan.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/allergyintolerance.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants — sama di semua schema untuk konsistensi
// ─────────────────────────────────────────────

/**
 * UUID v4 — validasi ID referensi FHIR untuk mencegah IDOR dan path traversal.
 * Catatan: beberapa ID Satu Sehat menggunakan format non-UUID (e.g. "N10000001"),
 * sehingga kita buat validasi lebih longgar khusus untuk practitioner ID.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kode SNOMED CT — angka 6–18 digit.
 */
const SNOMED_CODE_REGEX = /^\d{6,18}$/;

/**
 * Nomor identifier lokal — alphanumeric, boleh ada strip.
 * Contoh: "98457729", "RMK-001", "2022-06-001"
 */
const LOCAL_ID_REGEX = /^[a-zA-Z0-9\-_]{1,50}$/;

// ─────────────────────────────────────────────
// Helper: UUID opsional (boleh kosong)
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
 * Schema validasi untuk form input AllergyIntolerance (POST, PUT, PATCH).
 *
 * Catatan desain:
 * - `identifierValue` dipisah dari sistem URI karena URI menggunakan Org_id
 *   yang sudah tersimpan di env (tidak perlu diinput user).
 * - `category` dibatasi ke nilai enum FHIR R4.
 * - `recordedDate` menggunakan datetime-local HTML input.
 */
export const allergyIntoleranceFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  allergyIntoleranceId: optionalUuid("AllergyIntolerance ID"),

  // ── Identifier lokal ──
  identifierValue: Yup.string()
    .required("Nomor identifier wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Identifier hanya boleh berisi huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // ── Status klinis ──
  clinicalStatusCode: Yup.string()
    .oneOf(["active", "inactive", "resolved"], "Status klinis tidak valid")
    .required("Status klinis wajib dipilih"),

  // ── Status verifikasi ──
  verificationStatusCode: Yup.string()
    .oneOf(
      ["unconfirmed", "confirmed", "refuted", "entered-in-error"],
      "Status verifikasi tidak valid",
    )
    .required("Status verifikasi wajib dipilih"),

  // ── Kategori alergen ──
  category: Yup.string()
    .oneOf(
      ["", "food", "medication", "environment", "biologic"],
      "Kategori tidak valid",
    )
    .default(""),

  // ── Kode SNOMED substansi penyebab alergi ──
  codeSnomed: Yup.string()
    .required("Kode SNOMED wajib diisi")
    .matches(SNOMED_CODE_REGEX, "Kode SNOMED harus berupa angka 6–18 digit")
    .trim(),

  codeDisplay: Yup.string()
    .required("Nama substansi wajib diisi")
    .max(200, "Nama substansi maksimal 200 karakter")
    .trim(),

  /** Teks bebas keterangan alergi — opsional */
  codeText: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Keterangan alergi maksimal 500 karakter")
    .trim(),

  // ── Referensi Pasien ──
  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // ── Referensi Encounter ──
  encounterId: Yup.string()
    .required("Encounter ID wajib diisi")
    .trim(),

  encounterDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(300, "Display encounter maksimal 300 karakter")
    .trim(),

  // ── Tanggal pencatatan ──
  recordedDate: Yup.string()
    .required("Tanggal pencatatan wajib diisi")
    .test("is-valid-datetime", "Format tanggal tidak valid", (value) => {
      if (!value) return false;
      const d = new Date(value);
      return !isNaN(d.getTime());
    }),

  // ── Praktisi yang mencatat ──
  recorderPractitionerId: Yup.string()
    .required("Practitioner ID wajib diisi")
    .trim(),
});

/** Tipe form untuk POST/PUT/PATCH — optional fields ditandai eksplisit */
export type AllergyIntoleranceFormValues = {
  allergyIntoleranceId?: string;
  identifierValue: string;
  clinicalStatusCode: "active" | "inactive" | "resolved";
  verificationStatusCode: "unconfirmed" | "confirmed" | "refuted" | "entered-in-error";
  category: "" | "food" | "medication" | "environment" | "biologic";
  codeSnomed: string;
  codeDisplay: string;
  codeText?: string;
  patientId: string;
  patientDisplay: string;
  encounterId: string;
  encounterDisplay?: string;
  recordedDate: string;
  recorderPractitionerId: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

/**
 * Schema validasi untuk pencarian AllergyIntolerance (GET).
 * Semua field opsional — boleh kombinasi atau kosong semua.
 */
export const allergyIntoleranceGetSchema = Yup.object({
  /** ID spesifik — jika diisi, filter lain diabaikan */
  allergyIntoleranceId: optionalUuid("AllergyIntolerance ID").default(undefined),

  /** Filter berdasarkan Patient UUID */
  patientId: optionalUuid("Patient ID").default(undefined),

  /** Filter berdasarkan status klinis */
  clinicalStatus: Yup.string()
    .oneOf(["", "active", "inactive", "resolved"], "Status klinis tidak valid")
    .optional()
    .default(undefined),

  /** Filter berdasarkan kategori alergen */
  category: Yup.string()
    .oneOf(
      ["", "food", "medication", "environment", "biologic"],
      "Kategori tidak valid",
    )
    .optional()
    .default(undefined),
});

export type AllergyIntoleranceGetValues = {
  allergyIntoleranceId?: string;
  patientId?: string;
  clinicalStatus?: "" | "active" | "inactive" | "resolved";
  category?: "" | "food" | "medication" | "environment" | "biologic";
};
