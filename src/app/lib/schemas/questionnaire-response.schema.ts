/**
 * lib/schemas/questionnaire-response.schema.ts
 *
 * Yup validation schema untuk form QuestionnaireResponse Q0007.
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Catatan desain khusus QuestionnaireResponse:
 *   - Questionnaire Q0007 bersifat FIXED — pertanyaannya sudah ditentukan
 *     oleh Satu Sehat, bukan dinamis. Schema ini mencerminkan struktur tetap tersebut.
 *   - Setiap item pertanyaan dimodelkan sebagai field terpisah di form schema
 *     dengan tipe jawaban yang sesuai (string untuk valueCoding, boolean untuk valueBoolean).
 *   - Konversi dari form values ke payload FHIR dilakukan di buildPayload().
 *   - Item grup (1, 2, 3) tidak punya answer — hanya container untuk sub-item.
 *
 * Struktur Q0007:
 *   Grup 1 — Persyaratan Administrasi  (1.1–1.4) → valueCoding (Sesuai/Tidak Sesuai)
 *   Grup 2 — Persyaratan Farmasetik    (2.1–2.4) → valueCoding (Sesuai/Tidak Sesuai)
 *   Grup 3 — Persyaratan Klinis        (3.1–3.5) → valueCoding + valueBoolean
 *   Item 4 — Referensi MedicationRequest          → valueReference (UUID)
 *
 * Referensi FHIR: https://www.hl7.org/fhir/questionnaireresponse.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 — untuk validasi ID referensi FHIR */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * Nilai valid untuk jawaban valueCoding Q0007.
 * "sesuai" | "tidak_sesuai" — dikonversi ke kode OV000052/OV000053 saat buildPayload.
 */
const CODING_ANSWER_VALUES = ["sesuai", "tidak_sesuai"] as const;
type CodingAnswerValue = (typeof CODING_ANSWER_VALUES)[number];

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

/**
 * Schema form untuk QuestionnaireResponse Q0007.
 *
 * Setiap pertanyaan dimodelkan sebagai satu field:
 *   - item_1_1 sampai item_1_4 → string enum "sesuai" | "tidak_sesuai"
 *   - item_2_1 sampai item_2_4 → string enum "sesuai" | "tidak_sesuai"
 *   - item_3_1                 → string enum "sesuai" | "tidak_sesuai"
 *   - item_3_2 sampai item_3_5 → boolean
 *   - item_4_medicationRequestId → UUID (string)
 */
export const questionnaireResponseFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  questionnaireResponseId: optionalUuid("QuestionnaireResponse ID"),

  // ── Header ──
  status: Yup.string()
    .oneOf(
      ["in-progress", "completed", "amended", "entered-in-error", "stopped"],
      "Status tidak valid",
    )
    .required("Status wajib dipilih"),

  authored: Yup.string()
    .required("Tanggal pengisian wajib diisi")
    .test("is-valid-datetime", "Format tanggal tidak valid", (value) => {
      if (!value) return false;
      return !isNaN(new Date(value).getTime());
    }),

  // ── Referensi ──
  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  encounterId: Yup.string()
    .required("Encounter ID wajib diisi")
    .trim(),

  /**
   * Practitioner ID apoteker.
   * Contoh dari payload: "10009880728" (bukan UUID standar).
   */
  authorPractitionerId: Yup.string()
    .required("Practitioner ID apoteker wajib diisi")
    .trim(),

  authorDisplay: Yup.string()
    .required("Nama apoteker wajib diisi")
    .max(200, "Nama apoteker maksimal 200 karakter")
    .trim(),

  // ── Grup 1: Persyaratan Administrasi ──
  // Semua item grup 1 wajib dijawab dengan "sesuai" atau "tidak_sesuai"

  /** 1.1 — Nama, umur, jenis kelamin, berat badan, tinggi badan pasien */
  item_1_1: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 1.2 — Nama, nomor ijin, alamat dan paraf dokter */
  item_1_2: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 1.3 — Tanggal resep */
  item_1_3: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 1.4 — Ruangan/unit asal resep */
  item_1_4: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  // ── Grup 2: Persyaratan Farmasetik ──

  /** 2.1 — Nama obat, bentuk dan kekuatan sediaan */
  item_2_1: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 2.2 — Dosis dan jumlah obat */
  item_2_2: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 2.3 — Stabilitas obat */
  item_2_3: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 2.4 — Aturan dan cara penggunaan obat */
  item_2_4: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  // ── Grup 3: Persyaratan Klinis ──

  /** 3.1 — Ketepatan indikasi, dosis, dan waktu penggunaan */
  item_3_1: Yup.string()
    .oneOf(CODING_ANSWER_VALUES, "Pilih Sesuai atau Tidak Sesuai")
    .required("Wajib dijawab") as Yup.StringSchema<CodingAnswerValue>,

  /** 3.2 — Duplikasi pengobatan (valueBoolean) */
  item_3_2: Yup.boolean().required("Wajib dijawab"),

  /** 3.3 — Alergi dan reaksi obat yang tidak dikehendaki (ROTD) (valueBoolean) */
  item_3_3: Yup.boolean().required("Wajib dijawab"),

  /** 3.4 — Kontraindikasi pengobatan (valueBoolean) */
  item_3_4: Yup.boolean().required("Wajib dijawab"),

  /** 3.5 — Dampak interaksi obat (valueBoolean) */
  item_3_5: Yup.boolean().required("Wajib dijawab"),

  // ── Item 4: Referensi MedicationRequest ──
  /** UUID MedicationRequest yang dikaji */
  item_4_medicationRequestId: Yup.string()
    .required("MedicationRequest ID wajib diisi")
    .matches(UUID_REGEX, "MedicationRequest ID harus dalam format UUID")
    .trim(),
});

export type QuestionnaireResponseFormValues = {
  questionnaireResponseId?: string;
  status: "in-progress" | "completed" | "amended" | "entered-in-error" | "stopped";
  authored: string;
  patientId: string;
  patientDisplay: string;
  encounterId: string;
  practitionerId: string;
  authorPractitionerId: string;
  authorDisplay: string;
  item_1_1: CodingAnswerValue;
  item_1_2: CodingAnswerValue;
  item_1_3: CodingAnswerValue;
  item_1_4: CodingAnswerValue;
  item_2_1: CodingAnswerValue;
  item_2_2: CodingAnswerValue;
  item_2_3: CodingAnswerValue;
  item_2_4: CodingAnswerValue;
  item_3_1: CodingAnswerValue;
  item_3_2: boolean;
  item_3_3: boolean;
  item_3_4: boolean;
  item_3_5: boolean;
  item_4_medicationRequestId: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const questionnaireResponseGetSchema = Yup.object({
  questionnaireResponseId: optionalUuid("QuestionnaireResponse ID"),

  patientId: optionalUuid("Patient ID"),

  status: Yup.string()
    .oneOf(
      [
        "",
        "in-progress",
        "completed",
        "amended",
        "entered-in-error",
        "stopped",
      ],
      "Status tidak valid",
    )
    .optional()
    .default(undefined),
});

export type QuestionnaireResponseGetValues = {
  questionnaireResponseId?: string;
  patientId?: string;
  status?: "" | "in-progress" | "completed" | "amended" | "entered-in-error" | "stopped";
};
