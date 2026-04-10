/**
 * lib/schemas/patient.schema.ts
 *
 * Yup validation schema untuk form Patient.
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Struktur payload Patient Satu Sehat:
 *   - meta.profile      : fixed URL profil Satu Sehat (tidak diinput user)
 *   - identifier        : NIK wajib + nomor lokal opsional
 *   - active            : status aktif pasien
 *   - name              : nama resmi pasien
 *   - gender            : male | female | other | unknown
 *   - birthDate         : tanggal lahir (YYYY-MM-DD)
 *   - deceasedBoolean   : status meninggal
 *   - address           : alamat + kode wilayah administratif (BPS)
 *   - maritalStatus     : status pernikahan (v3-MaritalStatus)
 *   - multipleBirthInteger: 0 = bukan kembar, ≥1 = urutan kembar
 *   - contact           : kontak darurat (opsional)
 *   - communication     : bahasa (default Indonesian)
 *
 * Referensi FHIR: https://www.hl7.org/fhir/patient.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 — untuk ID resource FHIR */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** NIK Indonesia — 16 digit */
const NIK_REGEX = /^\d{16}$/;

/** Kode pos — 5 digit */
const POSTAL_CODE_REGEX = /^\d{5}$/;

/** Kode provinsi BPS — 2 digit */
const PROVINCE_REGEX = /^\d{2}$/;

/** Kode kota/kabupaten BPS — 4 digit */
const CITY_CODE_REGEX = /^\d{4}$/;

/** Kode kecamatan BPS — 6 digit */
const DISTRICT_REGEX = /^\d{6}$/;

/** Kode kelurahan/desa BPS — 10 digit */
const VILLAGE_REGEX = /^\d{10}$/;

// ─────────────────────────────────────────────
// Helpers
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

export const PATIENT_GENDER_VALUES = [
  "male",
  "female",
  "other",
  "unknown",
] as const;
export type PatientGenderValue = (typeof PATIENT_GENDER_VALUES)[number];

/**
 * Kode status pernikahan dari CodeSystem v3-MaritalStatus.
 * Ref: http://terminology.hl7.org/CodeSystem/v3-MaritalStatus
 */
export const MARITAL_STATUS_CODES = {
  U: "Unmarried",
  M: "Married",
  D: "Divorced",
  W: "Widowed",
  S: "Separated",
  L: "Legally Separated",
  T: "Domestic partner",
  A: "Annulled",
} as const;
export type MaritalStatusCode = keyof typeof MARITAL_STATUS_CODES;

/**
 * Kode hubungan kontak darurat dari CodeSystem v2-0131.
 * Ref: http://terminology.hl7.org/CodeSystem/v2-0131
 */
export const CONTACT_RELATIONSHIP_CODES = {
  C: "Emergency Contact",
  N: "Next-of-Kin",
  E: "Employer",
  F: "Federal Agency",
  I: "Insurance Company",
  U: "Unknown",
} as const;
export type ContactRelationshipCode = keyof typeof CONTACT_RELATIONSHIP_CODES;

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const patientFormSchema = Yup.object({
  // ── ID resource (hanya untuk PUT/PATCH) ──
  patientId: optionalUuid("Patient ID"),

  // ── Identifikasi ──
  nik: Yup.string()
    .required("NIK wajib diisi")
    .matches(NIK_REGEX, "NIK harus 16 digit angka")
    .trim(),

  // ── Status aktif ──
  active: Yup.boolean().default(true),

  // ── Data pribadi ──
  name: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama maksimal 200 karakter")
    .trim(),

  gender: Yup.string()
    .oneOf(PATIENT_GENDER_VALUES, "Jenis kelamin tidak valid")
    .required("Jenis kelamin wajib dipilih"),

  birthDate: Yup.string()
    .required("Tanggal lahir wajib diisi")
    .test("valid-date", "Format tanggal tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    })
    .test("not-future", "Tanggal lahir tidak boleh di masa depan", (v) => {
      if (!v) return true;
      return new Date(v) <= new Date();
    }),

  deceasedBoolean: Yup.boolean().default(false),

  // ── Alamat ──
  addressLine: Yup.string()
    .required("Alamat wajib diisi")
    .max(300, "Alamat maksimal 300 karakter")
    .trim(),

  addressCity: Yup.string()
    .required("Kota wajib diisi")
    .max(100, "Kota maksimal 100 karakter")
    .trim(),

  addressPostalCode: Yup.string()
    .optional()
    .default(undefined)
    .test("postal-code", "Kode pos harus 5 digit angka", (v) => {
      if (!v) return true;
      return POSTAL_CODE_REGEX.test(v);
    })
    .trim(),

  addressCountry: Yup.string().default("ID").trim(),

  // ── Kode wilayah administratif (BPS) ──
  province: Yup.string()
    .required("Kode provinsi wajib diisi")
    .matches(PROVINCE_REGEX, "Kode provinsi harus 2 digit angka")
    .trim(),

  cityCode: Yup.string()
    .required("Kode kota/kabupaten wajib diisi")
    .matches(CITY_CODE_REGEX, "Kode kota harus 4 digit angka")
    .trim(),

  district: Yup.string()
    .required("Kode kecamatan wajib diisi")
    .matches(DISTRICT_REGEX, "Kode kecamatan harus 6 digit angka")
    .trim(),

  village: Yup.string()
    .required("Kode kelurahan wajib diisi")
    .matches(VILLAGE_REGEX, "Kode kelurahan harus 10 digit angka")
    .trim(),

  rw: Yup.string()
    .optional()
    .default(undefined)
    .max(3, "RW maksimal 3 digit")
    .trim(),

  rt: Yup.string()
    .optional()
    .default(undefined)
    .max(3, "RT maksimal 3 digit")
    .trim(),

  // ── Status pernikahan (opsional) ──
  maritalStatusCode: Yup.string()
    .oneOf(["", ...Object.keys(MARITAL_STATUS_CODES)], "Kode tidak valid")
    .optional()
    .default(undefined),

  // ── Status kelahiran kembar ──
  multipleBirthInteger: Yup.number()
    .integer("Harus bilangan bulat")
    .min(0, "Minimal 0")
    .default(0),

  // ── Kontak darurat (semua opsional — disertakan hanya jika nama diisi) ──
  contactName: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama maksimal 200 karakter")
    .trim(),

  contactPhone: Yup.string()
    .optional()
    .default(undefined)
    .max(20, "Nomor telepon maksimal 20 karakter")
    .trim(),

  contactRelationship: Yup.string()
    .oneOf(["", ...Object.keys(CONTACT_RELATIONSHIP_CODES)], "Hubungan tidak valid")
    .optional()
    .default("C"),
});

export type PatientFormValues = {
  patientId?: string;
  nik: string;
  active: boolean;
  name: string;
  gender: PatientGenderValue;
  birthDate: string;
  deceasedBoolean: boolean;
  addressLine: string;
  addressCity: string;
  addressPostalCode?: string;
  addressCountry: string;
  province: string;
  cityCode: string;
  district: string;
  village: string;
  rw?: string;
  rt?: string;
  maritalStatusCode?: string;
  multipleBirthInteger: number;
  contactName?: string;
  contactPhone?: string;
  contactRelationship?: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const patientGetSchema = Yup.object({
  patientId: optionalUuid("Patient ID"),

  nik: Yup.string()
    .optional()
    .default(undefined)
    .test("nik-if-present", "NIK harus 16 digit angka", (v) => {
      if (!v) return true;
      return NIK_REGEX.test(v);
    })
    .trim(),

  name: Yup.string()
    .optional()
    .default(undefined)
    .max(200)
    .trim(),
});

export type PatientGetValues = {
  patientId?: string;
  nik?: string;
  name?: string;
};
