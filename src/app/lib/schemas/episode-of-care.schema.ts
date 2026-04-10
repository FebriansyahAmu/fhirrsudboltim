/**
 * lib/schemas/episode-of-care.schema.ts
 *
 * Yup validation schema untuk form EpisodeOfCare.
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Catatan desain untuk EpisodeOfCare:
 *   - statusHistory dan diagnosis adalah array — dimodelkan sebagai
 *     nested Yup array schema dengan validasi per item.
 *   - period (start/end) divalidasi sebagai pasangan: end tidak boleh
 *     sebelum start jika keduanya diisi.
 *   - careManager ID menggunakan regex longgar (sama dengan Practitioner
 *     di AllergyIntolerance) karena bisa berupa "N10000001".
 *
 * Referensi FHIR: https://www.hl7.org/fhir/episodeofcare.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 — untuk ID referensi FHIR */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nomor identifier lokal — alphanumeric, strip, underscore */
const LOCAL_ID_REGEX = /^[a-zA-Z0-9\-_]{1,50}$/;

/**
 * Kode tipe episode — alphanumeric dengan strip.
 * Contoh: "TB-SO", "TB-RO", "DM", "HT"
 */
const EPISODE_TYPE_CODE_REGEX = /^[a-zA-Z0-9\-]{2,20}$/;

/**
 * Kode peran diagnosis.
 * Contoh: "DD" (Discharged), "AD" (Admission), "CM" (Comorbidity), "pre-op", "post-op"
 */
const DIAGNOSIS_ROLE_CODE_REGEX = /^[a-zA-Z0-9\-]{2,10}$/;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** UUID opsional — validasi format hanya jika ada nilai */
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

/**
 * Validasi tanggal — string datetime-local HTML atau ISO 8601.
 * Mengembalikan false jika string tidak bisa di-parse ke Date valid.
 */
const isValidDate = (value: string | undefined): boolean => {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
};

// ─────────────────────────────────────────────
// Sub-schema: StatusHistory item
// ─────────────────────────────────────────────

/**
 * Schema untuk satu entri statusHistory.
 * Digunakan sebagai elemen dalam Yup.array().
 */
export const statusHistoryItemSchema = Yup.object({
  status: Yup.string()
    .oneOf(
      [
        "planned",
        "waitlist",
        "active",
        "onhold",
        "finished",
        "cancelled",
        "entered-in-error",
      ],
      "Status history tidak valid",
    )
    .required("Status wajib dipilih"),

  periodStart: Yup.string()
    .required("Tanggal mulai wajib diisi")
    .test("valid-date", "Format tanggal tidak valid", isValidDate),

  periodEnd: Yup.string()
    .optional()
    .test("valid-date-if-present", "Format tanggal tidak valid", (value) => {
      if (!value) return true;
      return isValidDate(value);
    })
    .test(
      "end-after-start",
      "Tanggal akhir tidak boleh sebelum tanggal mulai",
      function (endValue) {
        const { periodStart } = this.parent as { periodStart: string };
        if (!endValue || !periodStart) return true;
        return new Date(endValue) >= new Date(periodStart);
      },
    ),
});

export type StatusHistoryItemValues = Yup.InferType<
  typeof statusHistoryItemSchema
>;

// ─────────────────────────────────────────────
// Sub-schema: Diagnosis item
// ─────────────────────────────────────────────

/**
 * Schema untuk satu entri diagnosis dalam EpisodeOfCare.
 * conditionId adalah UUID referensi ke resource Condition.
 */
export const diagnosisItemSchema = Yup.object({
  /** UUID dari resource Condition yang direferensikan */
  conditionId: Yup.string()
    .required("Condition ID wajib diisi")
    .matches(UUID_REGEX, "Condition ID harus dalam format UUID")
    .trim(),

  /** Display label Condition — ditampilkan di UI dan payload */
  conditionDisplay: Yup.string()
    .required("Display kondisi wajib diisi")
    .max(300, "Display kondisi maksimal 300 karakter")
    .trim(),

  /** Kode peran diagnosis dalam episode — dari CodeSystem diagnosis-role HL7 */
  roleCode: Yup.string()
    .required("Kode peran diagnosis wajib diisi")
    .matches(
      DIAGNOSIS_ROLE_CODE_REGEX,
      "Kode peran tidak valid (contoh: DD, AD, CM)",
    )
    .trim(),

  /** Display label role */
  roleDisplay: Yup.string()
    .required("Display peran wajib diisi")
    .max(100, "Display peran maksimal 100 karakter")
    .trim(),

  /** Urutan prioritas — 1 = primer */
  rank: Yup.number()
    .typeError("Rank harus berupa angka")
    .integer("Rank harus bilangan bulat")
    .min(1, "Rank minimal 1")
    .max(99, "Rank maksimal 99")
    .required("Rank wajib diisi"),
});

export type DiagnosisItemValues = Yup.InferType<typeof diagnosisItemSchema>;

// ─────────────────────────────────────────────
// Schema utama: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const episodeOfCareFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  episodeOfCareId: optionalUuid("EpisodeOfCare ID"),

  // ── Identifier lokal ──
  identifierValue: Yup.string()
    .required("Nomor identifier wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Identifier hanya boleh huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // ── Status saat ini ──
  status: Yup.string()
    .oneOf(
      [
        "planned",
        "waitlist",
        "active",
        "onhold",
        "finished",
        "cancelled",
        "entered-in-error",
      ],
      "Status tidak valid",
    )
    .required("Status wajib dipilih"),

  // ── Status history (array, minimal 1 item) ──
  statusHistory: Yup.array()
    .of(statusHistoryItemSchema)
    .min(1, "Minimal 1 riwayat status harus diisi")
    .required("Status history wajib diisi"),

  // ── Tipe episode ──
  typeCode: Yup.string()
    .required("Kode tipe episode wajib diisi")
    .matches(
      EPISODE_TYPE_CODE_REGEX,
      "Kode tipe tidak valid (contoh: TB-SO, DM, HT)",
    )
    .trim(),

  typeDisplay: Yup.string()
    .required("Display tipe episode wajib diisi")
    .max(200, "Display tipe maksimal 200 karakter")
    .trim(),

  // ── Diagnosis (array, minimal 1 item) ──
  diagnosis: Yup.array()
    .of(diagnosisItemSchema)
    .min(1, "Minimal 1 diagnosis harus diisi")
    .required("Diagnosis wajib diisi"),

  // ── Referensi pasien ──
  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // ── Periode episode keseluruhan ──
  periodStart: Yup.string()
    .required("Tanggal mulai episode wajib diisi")
    .test("valid-date", "Format tanggal tidak valid", isValidDate),

  periodEnd: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-date-if-present", "Format tanggal tidak valid", (value) => {
      if (!value) return true;
      return isValidDate(value);
    })
    .test(
      "end-after-start",
      "Tanggal akhir tidak boleh sebelum tanggal mulai",
      function (endValue) {
        const { periodStart } = this.parent as { periodStart: string };
        if (!endValue || !periodStart) return true;
        return new Date(endValue) >= new Date(periodStart);
      },
    ),

  // ── Care manager (Practitioner) ──
  careManagerId: Yup.string()
    .required("Care manager ID wajib diisi")
    .trim(),

  careManagerDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama care manager maksimal 200 karakter")
    .trim(),
});

export type EpisodeOfCareFormValues = {
  episodeOfCareId?: string;
  identifierValue: string;
  status: "planned" | "waitlist" | "active" | "onhold" | "finished" | "cancelled" | "entered-in-error";
  statusHistory: StatusHistoryItemValues[];
  typeCode: string;
  typeDisplay: string;
  diagnosis: DiagnosisItemValues[];
  patientId: string;
  patientDisplay: string;
  periodStart: string;
  periodEnd?: string;
  careManagerId: string;
  careManagerDisplay?: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const episodeOfCareGetSchema = Yup.object({
  episodeOfCareId: optionalUuid("EpisodeOfCare ID"),

  patientId: optionalUuid("Patient ID"),

  status: Yup.string()
    .oneOf(
      [
        "",
        "planned",
        "waitlist",
        "active",
        "onhold",
        "finished",
        "cancelled",
        "entered-in-error",
      ],
      "Status tidak valid",
    )
    .optional()
    .default(undefined),
});

export type EpisodeOfCareGetValues = {
  episodeOfCareId?: string;
  patientId?: string;
  status?: "" | "planned" | "waitlist" | "active" | "onhold" | "finished" | "cancelled" | "entered-in-error";
};
