/**
 * lib/schemas/specimen.schema.ts
 *
 * Yup validation schema untuk form Specimen.
 * Pola konsisten dengan allergy-intolerance.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/specimen.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" → Specimen.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNOMED_CODE_REGEX = /^\d{6,18}$/;
const LOCAL_ID_REGEX = /^[a-zA-Z0-9\-_]{1,50}$/;

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

export const specimenFormSchema = Yup.object({
  // Identifikasi resource (hanya untuk PUT/PATCH)
  specimenId: optionalUuid("Specimen ID"),

  // Identifier lokal (nomor spesimen fasilitas)
  identifierValue: Yup.string()
    .required("Nomor spesimen wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Nomor spesimen hanya boleh huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // Status spesimen
  status: Yup.string()
    .oneOf(
      ["available", "unavailable", "unsatisfactory", "entered-in-error"],
      "Status tidak valid",
    )
    .required("Status wajib dipilih"),

  // Jenis spesimen (SNOMED CT)
  typeCode: Yup.string()
    .required("Kode jenis spesimen wajib diisi")
    .matches(SNOMED_CODE_REGEX, "Kode SNOMED harus berupa angka 6–18 digit")
    .trim(),

  typeDisplay: Yup.string()
    .required("Nama jenis spesimen wajib diisi")
    .max(200, "Nama jenis spesimen maksimal 200 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi ServiceRequest — WAJIB (spesimen mengikuti permintaan lab yang terkirim)
  requestServiceRequestId: Yup.string()
    .required("ServiceRequest ID wajib diisi — spesimen butuh permintaan terkirim")
    .trim(),

  // Waktu pengambilan (opsional)
  collectedDateTime: Yup.string()
    .optional()
    .default(undefined)
    .test("collected-valid", "Format tanggal tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    }),

  // Waktu diterima lab (opsional)
  receivedTime: Yup.string()
    .optional()
    .default(undefined)
    .test("received-valid", "Format tanggal tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    }),
});

export type SpecimenFormValues = {
  specimenId?: string;
  identifierValue: string;
  status: "available" | "unavailable" | "unsatisfactory" | "entered-in-error";
  typeCode: string;
  typeDisplay: string;
  subjectPatientId: string;
  subjectDisplay: string;
  requestServiceRequestId: string;
  collectedDateTime?: string;
  receivedTime?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const specimenGetSchema = Yup.object({
  /** ID spesifik — jika diisi, filter lain diabaikan */
  specimenId: optionalUuid("Specimen ID").default(undefined),

  /** Filter berdasarkan Patient */
  patientId: Yup.string().optional().default(undefined).trim(),

  /** Filter berdasarkan ServiceRequest */
  requestId: Yup.string().optional().default(undefined).trim(),

  /** Filter berdasarkan tanggal pengambilan (YYYY-MM-DD) */
  collected: Yup.string()
    .optional()
    .default(undefined)
    .matches(/^$|^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
});

export type SpecimenGetValues = {
  specimenId?: string;
  patientId?: string;
  requestId?: string;
  collected?: string;
};
