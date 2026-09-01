/**
 * lib/schemas/medication.schema.ts
 *
 * Yup validation schema untuk form Medication (definisi obat / KFA).
 * Pola konsisten dengan observation.schema.ts & procedure.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/medication.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → Medication.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kode KFA / bentuk sediaan — angka/huruf. */
const CODE_REGEX = /^[A-Za-z0-9.\-]{1,20}$/;

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

export const medicationFormSchema = Yup.object({
  // Identifikasi resource (hanya untuk PUT/PATCH)
  medicationId: optionalUuid("Medication ID"),

  // Status
  status: Yup.string()
    .oneOf(["active", "inactive", "entered-in-error"], "Status tidak valid")
    .required("Status wajib dipilih"),

  // Kode obat (KFA)
  kfaCode: Yup.string()
    .required("Kode KFA wajib diisi")
    .matches(CODE_REGEX, "Kode KFA tidak valid (huruf/angka)")
    .trim(),
  kfaDisplay: Yup.string()
    .required("Nama obat wajib diisi")
    .max(500, "Nama obat maksimal 500 karakter")
    .trim(),

  // Bentuk sediaan (opsional)
  formCode: Yup.string()
    .optional()
    .default(undefined)
    .test("form-code", "Kode bentuk tidak valid", (v) => {
      if (!v) return true;
      return CODE_REGEX.test(v);
    })
    .trim(),
  formDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama bentuk maksimal 200 karakter")
    .trim(),

  // Pabrik (Organization) — opsional
  manufacturerId: Yup.string().optional().default(undefined).trim(),

  // Identifier lokal (opsional)
  identifierValue: Yup.string()
    .optional()
    .default(undefined)
    .max(100, "Identifier maksimal 100 karakter")
    .trim(),
});

export type MedicationFormValues = {
  medicationId?: string;
  status: "active" | "inactive" | "entered-in-error";
  kfaCode: string;
  kfaDisplay: string;
  formCode?: string;
  formDisplay?: string;
  manufacturerId?: string;
  identifierValue?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (Medication dicari berdasarkan ID)
// ─────────────────────────────────────────────

export const medicationGetSchema = Yup.object({
  medicationId: optionalUuid("Medication ID").default(undefined),
});

export type MedicationGetValues = {
  medicationId?: string;
};
