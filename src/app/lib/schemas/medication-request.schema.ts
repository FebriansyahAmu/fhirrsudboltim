/**
 * lib/schemas/medication-request.schema.ts
 *
 * Yup validation schema untuk form MedicationRequest (resep obat).
 * Pola konsisten dengan medication.schema.ts & procedure.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/medicationrequest.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → MedicationRequest.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = [
  "active",
  "on-hold",
  "cancelled",
  "completed",
  "entered-in-error",
  "stopped",
  "draft",
  "unknown",
] as const;

const INTENT = [
  "proposal",
  "plan",
  "order",
  "original-order",
  "reflex-order",
  "filler-order",
  "instance-order",
  "option",
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

export const medicationRequestFormSchema = Yup.object({
  medicationRequestId: optionalUuid("MedicationRequest ID"),

  status: Yup.string()
    .oneOf(STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),
  intent: Yup.string()
    .oneOf(INTENT as unknown as string[], "Intent tidak valid")
    .required("Intent wajib dipilih"),

  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(100, "Nama kategori maksimal 100 karakter")
    .trim(),
  priority: Yup.string()
    .oneOf(["routine", "urgent", "asap", "stat"], "Prioritas tidak valid")
    .required("Prioritas wajib dipilih"),

  // Referensi Medication (obat harus terkirim dulu)
  medicationId: Yup.string().required("Medication ID wajib diisi").trim(),
  medicationDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Nama obat maksimal 500 karakter")
    .trim(),

  // Referensi Pasien
  subjectPatientId: Yup.string().required("Patient ID wajib diisi").trim(),
  subjectDisplay: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // Referensi Encounter
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Pemberi resep (Practitioner) — opsional
  requesterId: Yup.string().optional().default(undefined).trim(),

  authoredOn: Yup.string()
    .required("Tanggal resep wajib diisi")
    .test("valid-date", "Tanggal tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),

  dosageText: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Instruksi maksimal 500 karakter")
    .trim(),
});

export type MedicationRequestFormValues = {
  medicationRequestId?: string;
  status: (typeof STATUS)[number];
  intent: (typeof INTENT)[number];
  categoryCode: string;
  categoryDisplay: string;
  priority: "routine" | "urgent" | "asap" | "stat";
  medicationId: string;
  medicationDisplay?: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  requesterId?: string;
  authoredOn: string;
  dosageText?: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const medicationRequestGetSchema = Yup.object({
  medicationRequestId: optionalUuid("MedicationRequest ID").default(undefined),
  patientId: Yup.string().optional().default(undefined).trim(),
  encounterId: Yup.string().optional().default(undefined).trim(),
});

export type MedicationRequestGetValues = {
  medicationRequestId?: string;
  patientId?: string;
  encounterId?: string;
};
