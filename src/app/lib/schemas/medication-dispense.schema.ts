/**
 * lib/schemas/medication-dispense.schema.ts
 *
 * Yup validation schema untuk form MedicationDispense (penyerahan obat).
 * Pola konsisten dengan medication-request.schema.ts.
 *
 * Referensi FHIR: https://www.hl7.org/fhir/medicationdispense.html
 * Contoh payload: Postman "00. FHIR Resource - Contoh Penggunaan" →
 *   Resource → MedicationDispense.
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;

const STATUS = [
  "preparation",
  "in-progress",
  "cancelled",
  "on-hold",
  "completed",
  "entered-in-error",
  "stopped",
  "declined",
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

export const medicationDispenseFormSchema = Yup.object({
  medicationDispenseId: optionalUuid("MedicationDispense ID"),

  status: Yup.string()
    .oneOf(STATUS as unknown as string[], "Status tidak valid")
    .required("Status wajib dipilih"),

  categoryCode: Yup.string().required("Kode kategori wajib diisi").trim(),
  categoryDisplay: Yup.string()
    .required("Nama kategori wajib diisi")
    .max(100, "Nama kategori maksimal 100 karakter")
    .trim(),

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

  // Referensi Encounter (context)
  encounterId: Yup.string().required("Encounter ID wajib diisi").trim(),

  // Referensi MedicationRequest (authorizingPrescription — resep harus terkirim dulu)
  prescriptionId: Yup.string().required("MedicationRequest ID wajib diisi").trim(),

  // Pelaksana (Practitioner) & Lokasi (apotek) — opsional
  performerId: Yup.string().optional().default(undefined).trim(),
  locationId: Yup.string().optional().default(undefined).trim(),

  // Jumlah diserahkan (quantity)
  quantityValue: Yup.string()
    .optional()
    .default(undefined)
    .test("is-number", "Jumlah harus berupa angka", (v) => {
      if (!v) return true;
      return NUMBER_REGEX.test(v.trim());
    }),
  quantityUnit: Yup.string()
    .optional()
    .default(undefined)
    .max(50, "Satuan maksimal 50 karakter")
    .trim(),

  whenHandedOver: Yup.string()
    .required("Waktu penyerahan wajib diisi")
    .test("valid-date", "Waktu tidak valid", (v) => {
      if (!v) return false;
      return !isNaN(new Date(v).getTime());
    }),
});

export type MedicationDispenseFormValues = {
  medicationDispenseId?: string;
  status: (typeof STATUS)[number];
  categoryCode: string;
  categoryDisplay: string;
  medicationId: string;
  medicationDisplay?: string;
  subjectPatientId: string;
  subjectDisplay?: string;
  encounterId: string;
  prescriptionId: string;
  performerId?: string;
  locationId?: string;
  quantityValue?: string;
  quantityUnit?: string;
  whenHandedOver: string;
};

// ─────────────────────────────────────────────
// Schema: GET (parameter query saja)
// ─────────────────────────────────────────────

export const medicationDispenseGetSchema = Yup.object({
  medicationDispenseId: optionalUuid("MedicationDispense ID").default(undefined),
  patientId: Yup.string().optional().default(undefined).trim(),
  prescriptionId: Yup.string().optional().default(undefined).trim(),
});

export type MedicationDispenseGetValues = {
  medicationDispenseId?: string;
  patientId?: string;
  prescriptionId?: string;
};
