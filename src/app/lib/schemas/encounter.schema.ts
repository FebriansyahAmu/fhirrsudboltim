/**
 * lib/schemas/encounter.schema.ts
 *
 * Yup validation schema untuk form Encounter.
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Struktur payload Encounter Satu Sehat:
 *   - identifier  : nomor encounter lokal fasilitas
 *   - status      : status lifecycle encounter
 *   - class       : kelas kunjungan (AMB, IMP, EMER, dll.)
 *   - subject     : referensi Patient
 *   - participant : array praktisi — form hanya izinkan 1 (bisa Raw JSON untuk lebih)
 *   - period      : waktu mulai dan opsional waktu selesai
 *   - location    : lokasi pelayanan (1 lokasi dari form)
 *   - statusHistory : di-generate otomatis dari status + period di buildPayload
 *   - serviceProvider : Organization (Org_id dari env, tidak diinput user)
 *
 * Referensi FHIR: https://www.hl7.org/fhir/encounter.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 — untuk ID resource FHIR */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Nomor identifier lokal — alphanumeric, strip, underscore */
const LOCAL_ID_REGEX = /^[a-zA-Z0-9\-_]{1,50}$/;

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

// ─────────────────────────────────────────────
// Nilai enum
// ─────────────────────────────────────────────

export const ENCOUNTER_STATUS_VALUES = [
  "planned",
  "arrived",
  "triaged",
  "in-progress",
  "onleave",
  "finished",
  "cancelled",
  "entered-in-error",
] as const;

export type EncounterStatusValue = (typeof ENCOUNTER_STATUS_VALUES)[number];

/**
 * Kelas kunjungan dari CodeSystem v3-ActCode.
 * AMB = rawat jalan, IMP = rawat inap, EMER = IGD, VR = telemedicine, HH = home care
 */
export const ENCOUNTER_CLASS_CODES = ["AMB", "IMP", "EMER", "VR", "HH"] as const;
export type EncounterClassCode = (typeof ENCOUNTER_CLASS_CODES)[number];

export const ENCOUNTER_CLASS_DISPLAY: Record<EncounterClassCode, string> = {
  AMB: "ambulatory",
  IMP: "inpatient encounter",
  EMER: "emergency",
  VR: "virtual",
  HH: "home health",
};

/**
 * Tipe partisipasi praktisi dari CodeSystem v3-ParticipationType.
 */
export const PARTICIPANT_TYPE_CODES = ["ATND", "CON", "PPRF", "PART", "SPRF"] as const;
export type ParticipantTypeCode = (typeof PARTICIPANT_TYPE_CODES)[number];

export const PARTICIPANT_TYPE_DISPLAY: Record<ParticipantTypeCode, string> = {
  ATND: "attender",
  CON: "consultant",
  PPRF: "primary performer",
  PART: "participant",
  SPRF: "secondary performer",
};

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const encounterFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  encounterId: optionalUuid("Encounter ID"),

  // ── Identifier lokal fasilitas ──
  identifierValue: Yup.string()
    .required("Nomor identifier wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Identifier hanya boleh huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // ── Status encounter ──
  status: Yup.string()
    .oneOf(ENCOUNTER_STATUS_VALUES, "Status tidak valid")
    .required("Status wajib dipilih"),

  // ── Kelas kunjungan ──
  classCode: Yup.string()
    .oneOf(ENCOUNTER_CLASS_CODES, "Kelas kunjungan tidak valid")
    .required("Kelas kunjungan wajib dipilih"),

  // ── Referensi pasien ──
  patientId: Yup.string()
    .required("Patient ID wajib diisi")
    .trim(),

  patientDisplay: Yup.string()
    .required("Nama pasien wajib diisi")
    .max(200, "Nama pasien maksimal 200 karakter")
    .trim(),

  // ── Participant (satu dokter/praktisi) ──
  participantTypeCode: Yup.string()
    .oneOf(PARTICIPANT_TYPE_CODES, "Tipe partisipasi tidak valid")
    .required("Tipe partisipasi wajib dipilih"),

  practitionerId: Yup.string()
    .required("Practitioner ID wajib diisi")
    .trim(),

  practitionerDisplay: Yup.string()
    .required("Nama praktisi wajib diisi")
    .max(200, "Nama praktisi maksimal 200 karakter")
    .trim(),

  // ── Periode kunjungan ──
  periodStart: Yup.string()
    .required("Tanggal mulai wajib diisi")
    .test("is-valid-datetime", "Format tanggal tidak valid", (value) => {
      if (!value) return false;
      return !isNaN(new Date(value).getTime());
    }),

  periodEnd: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-date-if-present", "Format tanggal tidak valid", (value) => {
      if (!value) return true;
      return !isNaN(new Date(value).getTime());
    })
    .test(
      "end-after-start",
      "Tanggal selesai tidak boleh sebelum tanggal mulai",
      function (endValue) {
        const { periodStart } = this.parent as { periodStart: string };
        if (!endValue || !periodStart) return true;
        return new Date(endValue) >= new Date(periodStart);
      },
    ),

  // ── Lokasi pelayanan ──
  locationId: Yup.string()
    .required("Location ID wajib diisi")
    .trim(),

  locationDisplay: Yup.string()
    .required("Nama lokasi wajib diisi")
    .max(300, "Nama lokasi maksimal 300 karakter")
    .trim(),
});

export type EncounterFormValues = {
  encounterId?: string;
  identifierValue: string;
  status: EncounterStatusValue;
  classCode: EncounterClassCode;
  patientId: string;
  patientDisplay: string;
  participantTypeCode: ParticipantTypeCode;
  practitionerId: string;
  practitionerDisplay: string;
  periodStart: string;
  periodEnd?: string;
  locationId: string;
  locationDisplay: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const encounterGetSchema = Yup.object({
  encounterId: optionalUuid("Encounter ID"),

  patientId: Yup.string()
    .optional()
    .default(undefined)
    .trim(),

  status: Yup.string()
    .oneOf(["", ...ENCOUNTER_STATUS_VALUES], "Status tidak valid")
    .optional()
    .default(undefined),
});

export type EncounterGetValues = {
  encounterId?: string;
  patientId?: string;
  status?: "" | EncounterStatusValue;
};
