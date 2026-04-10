/**
 * lib/schemas/location.schema.ts
 *
 * Yup validation schema untuk form Location.
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Struktur payload Location Satu Sehat:
 *   - identifier         : nomor lokasi lokal fasilitas (system pakai Org_id dari env)
 *   - status             : active | suspended | inactive
 *   - name               : nama lokasi (wajib)
 *   - description        : deskripsi (opsional)
 *   - mode               : instance | kind
 *   - telecom            : 3 field tetap — phone, email, url (pakai "work")
 *   - physicalType       : kode tipe fisik lokasi (ro, wa, bu, dll.)
 *   - position           : koordinat GPS (latitude, longitude, altitude) — opsional
 *   - managingOrganization: referensi Org_Poli — diinput user
 *
 * Referensi FHIR: https://www.hl7.org/fhir/location.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

/** UUID v4 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifier lokal — alphanumeric, strip, underscore */
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
// Enum values
// ─────────────────────────────────────────────

export const LOCATION_STATUS_VALUES = [
  "active",
  "suspended",
  "inactive",
] as const;
export type LocationStatus = (typeof LOCATION_STATUS_VALUES)[number];

export const LOCATION_MODE_VALUES = ["instance", "kind"] as const;
export type LocationMode = (typeof LOCATION_MODE_VALUES)[number];

/**
 * Kode tipe fisik lokasi dari CodeSystem location-physical-type HL7.
 */
export const LOCATION_PHYSICAL_TYPE_CODES = [
  "si",   // Site
  "bu",   // Building
  "wi",   // Wing
  "wa",   // Ward
  "lvl",  // Level
  "co",   // Corridor
  "ro",   // Room
  "bd",   // Bed
  "ve",   // Vehicle
  "ho",   // House
  "ca",   // Cabinet
  "rd",   // Road
  "area", // Area
  "jdn",  // Junction
] as const;
export type LocationPhysicalTypeCode = (typeof LOCATION_PHYSICAL_TYPE_CODES)[number];

export const LOCATION_PHYSICAL_TYPE_DISPLAY: Record<LocationPhysicalTypeCode, string> = {
  si: "Site",
  bu: "Building",
  wi: "Wing",
  wa: "Ward",
  lvl: "Level",
  co: "Corridor",
  ro: "Room",
  bd: "Bed",
  ve: "Vehicle",
  ho: "House",
  ca: "Cabinet",
  rd: "Road",
  area: "Area",
  jdn: "Junction",
};

// ─────────────────────────────────────────────
// Schema: POST / PUT / PATCH
// ─────────────────────────────────────────────

export const locationFormSchema = Yup.object({
  // ── Identifikasi resource (hanya untuk PUT/PATCH) ──
  locationId: optionalUuid("Location ID"),

  // ── Identifier lokal ──
  identifierValue: Yup.string()
    .required("Kode lokasi wajib diisi")
    .matches(
      LOCAL_ID_REGEX,
      "Kode hanya boleh huruf, angka, strip, atau underscore (maks. 50 karakter)",
    )
    .trim(),

  // ── Status & mode ──
  status: Yup.string()
    .oneOf(LOCATION_STATUS_VALUES, "Status tidak valid")
    .required("Status wajib dipilih"),

  mode: Yup.string()
    .oneOf(LOCATION_MODE_VALUES, "Mode tidak valid")
    .required("Mode wajib dipilih"),

  // ── Nama & deskripsi ──
  name: Yup.string()
    .required("Nama lokasi wajib diisi")
    .max(200, "Nama lokasi maksimal 200 karakter")
    .trim(),

  description: Yup.string()
    .optional()
    .default(undefined)
    .max(500, "Deskripsi maksimal 500 karakter")
    .trim(),

  // ── Tipe fisik ──
  physicalTypeCode: Yup.string()
    .oneOf(LOCATION_PHYSICAL_TYPE_CODES, "Tipe fisik tidak valid")
    .required("Tipe fisik wajib dipilih"),

  // ── Telecom ──
  telecomPhone: Yup.string()
    .optional()
    .default(undefined)
    .max(20, "Nomor telepon maksimal 20 karakter")
    .trim(),

  telecomEmail: Yup.string()
    .optional()
    .default(undefined)
    .email("Format email tidak valid")
    .max(100, "Email maksimal 100 karakter")
    .trim(),

  telecomUrl: Yup.string()
    .optional()
    .default(undefined)
    .max(200, "URL maksimal 200 karakter")
    .trim(),

  // ── Posisi / koordinat GPS (opsional) ──
  latitude: Yup.number()
    .optional()
    .typeError("Latitude harus berupa angka")
    .min(-90, "Latitude antara -90 dan 90")
    .max(90, "Latitude antara -90 dan 90"),

  longitude: Yup.number()
    .optional()
    .typeError("Longitude harus berupa angka")
    .min(-180, "Longitude antara -180 dan 180")
    .max(180, "Longitude antara -180 dan 180"),

  altitude: Yup.number()
    .optional()
    .typeError("Altitude harus berupa angka")
    .default(0),

  // ── Managing Organization (Org_Poli) ──
  managingOrganizationId: Yup.string()
    .required("Organization ID wajib diisi")
    .trim(),
});

export type LocationFormValues = {
  locationId?: string;
  identifierValue: string;
  status: LocationStatus;
  mode: LocationMode;
  name: string;
  description?: string;
  physicalTypeCode: LocationPhysicalTypeCode;
  telecomPhone?: string;
  telecomEmail?: string;
  telecomUrl?: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  managingOrganizationId: string;
};

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const locationGetSchema = Yup.object({
  locationId: optionalUuid("Location ID"),

  name: Yup.string()
    .optional()
    .default(undefined)
    .max(200)
    .trim(),

  status: Yup.string()
    .oneOf(["", ...LOCATION_STATUS_VALUES], "Status tidak valid")
    .optional()
    .default(undefined),
});

export type LocationGetValues = {
  locationId?: string;
  name?: string;
  status?: "" | LocationStatus;
};
