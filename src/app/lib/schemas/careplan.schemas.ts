// lib/schemas/careplan.schema.ts
// Validasi form CarePlan menggunakan Yup

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SNOMED_CODE_REGEX = /^\d{6,18}$/;

export const carePlanFormSchema = Yup.object({
  title: Yup.string()
    .required("Judul wajib diisi")
    .min(3, "Judul minimal 3 karakter")
    .max(200, "Judul maksimal 200 karakter")
    .trim(),

  status: Yup.string()
    .oneOf(
      ["draft", "active", "on-hold", "revoked", "completed"],
      "Status tidak valid",
    )
    .required("Status wajib dipilih"),

  intent: Yup.string()
    .oneOf(["proposal", "plan", "order", "option"], "Intent tidak valid")
    .required("Intent wajib dipilih"),

  description: Yup.string()
    .max(2000, "Deskripsi maksimal 2000 karakter")
    .optional()
    .default(undefined),

  categoryCode: Yup.string()
    .required("Kode kategori wajib diisi")
    .matches(SNOMED_CODE_REGEX, "Kode SNOMED harus berupa angka 6-18 digit")
    .trim(),

  categoryDisplay: Yup.string()
    .required("Display kategori wajib diisi")
    .max(100, "Maksimal 100 karakter")
    .trim(),

  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientName: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama maksimal 200 karakter")
    .trim(),

  encounterId: Yup.string()
    .required("Encounter ID wajib diisi")
    .trim(),

  practitionerId: Yup.string()
    .required("Practitioner ID wajib diisi")
    .trim(),

  created: Yup.string()
    .required("Tanggal wajib diisi")
    .test("is-valid-date", "Tanggal tidak valid", (value) => {
      if (!value) return false;
      const date = new Date(value);
      return !isNaN(date.getTime());
    }),

  // Opsional — hanya untuk PUT/PATCH
  carePlanId: Yup.string()
    .optional()
    .default(undefined)
    .test("uuid-if-present", "ID harus dalam format UUID", (value) => {
      if (!value) return true;
      return UUID_REGEX.test(value);
    })
    .trim(),
});

export type CarePlanFormValues = {
  title: string;
  status: "draft" | "active" | "on-hold" | "revoked" | "completed";
  intent: "proposal" | "plan" | "order" | "option";
  description?: string;
  categoryCode: string;
  categoryDisplay: string;
  patientId: string;
  patientName: string;
  encounterId: string;
  practitionerId: string;
  created: string;
  carePlanId?: string;
};

// Schema khusus untuk GET (hanya parameter query)
export const carePlanGetSchema = Yup.object({
  carePlanId: Yup.string()
    .optional()
    .default(undefined)
    .test("uuid-if-present", "ID harus dalam format UUID", (value) => {
      if (!value) return true;
      return UUID_REGEX.test(value);
    })
    .trim(),

  status: Yup.string()
    .oneOf(
      ["", "draft", "active", "on-hold", "revoked", "completed"],
      "Status tidak valid",
    )
    .optional()
    .default(undefined),

  patientId: Yup.string()
    .optional()
    .default(undefined)
    .test("uuid-if-present", "Patient ID harus UUID", (value) => {
      if (!value) return true;
      return UUID_REGEX.test(value);
    })
    .trim(),
});

export type CarePlanGetValues = {
  carePlanId?: string;
  status?: "" | "draft" | "active" | "on-hold" | "revoked" | "completed";
  patientId?: string;
};
