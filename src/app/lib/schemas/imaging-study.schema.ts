/**
 * lib/schemas/imaging-study.schema.ts
 *
 * Yup validation schema untuk form ImagingStudy — fokus GET (search).
 * Pola konsisten dengan schema modul lain di codebase ini.
 *
 * Parameter GET ImagingStudy Satu Sehat:
 *   - _id / imagingStudyId : UUID resource langsung
 *   - patient              : Patient/{uuid}
 *   - encounter            : Encounter/{uuid}
 *   - started              : ge{date} (tanggal studi mulai dari)
 *   - status               : registered | available | cancelled | entered-in-error | unknown
 *   - modality             : kode DICOM modality (US, CT, MR, dll.)
 *   - identifier           : Study Instance UID atau accession number
 *
 * Referensi FHIR: https://www.hl7.org/fhir/imagingstudy.html
 */

import * as Yup from "yup";

// ─────────────────────────────────────────────
// Regex constants
// ─────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

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
// Enum values
// ─────────────────────────────────────────────

export const IMAGING_STUDY_STATUSES = [
  "registered",
  "available",
  "cancelled",
  "entered-in-error",
  "unknown",
] as const;
export type ImagingStudyStatus = (typeof IMAGING_STUDY_STATUSES)[number];

export const DICOM_MODALITIES = [
  { code: "US", label: "Ultrasound (US)" },
  { code: "CT", label: "Computed Tomography (CT)" },
  { code: "MR", label: "Magnetic Resonance (MR)" },
  { code: "CR", label: "Computed Radiography (CR)" },
  { code: "DX", label: "Digital Radiography (DX)" },
  { code: "NM", label: "Nuclear Medicine (NM)" },
  { code: "RF", label: "Radio Fluoroscopy (RF)" },
  { code: "XA", label: "X-Ray Angiography (XA)" },
  { code: "MG", label: "Mammography (MG)" },
  { code: "PT", label: "PET Scan (PT)" },
] as const;

// ─────────────────────────────────────────────
// Schema: GET
// ─────────────────────────────────────────────

export const imagingStudyGetSchema = Yup.object({
  /** UUID langsung — jika diisi, parameter lain diabaikan */
  imagingStudyId: optionalUuid("ImagingStudy ID"),

  /** UUID Patient — dikirim sebagai patient=Patient/{uuid} */
  patientId: optionalUuid("Patient ID"),

  /** UUID Encounter — dikirim sebagai encounter=Encounter/{uuid} */
  encounterId: optionalUuid("Encounter ID"),

  /** Filter tanggal studi mulai (ge) — format YYYY-MM-DD */
  startedFrom: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-date", "Format tanggal tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    }),

  /** Filter tanggal studi sampai (le) — format YYYY-MM-DD */
  startedTo: Yup.string()
    .optional()
    .default(undefined)
    .test("valid-date", "Format tanggal tidak valid", (v) => {
      if (!v) return true;
      return !isNaN(new Date(v).getTime());
    })
    .test("end-after-start", "Tanggal akhir tidak boleh sebelum tanggal mulai", function (v) {
      const { startedFrom } = this.parent as { startedFrom?: string };
      if (!v || !startedFrom) return true;
      return new Date(v) >= new Date(startedFrom);
    }),

  /** Status studi */
  status: Yup.string()
    .oneOf(["", ...IMAGING_STUDY_STATUSES], "Status tidak valid")
    .optional()
    .default(undefined),

  /** Kode DICOM modality */
  modality: Yup.string()
    .optional()
    .default(undefined)
    .trim(),

  /**
   * Accession Number — nilai saja (tanpa system prefix).
   * Dikirim sebagai: identifier=http://sys-ids.kemkes.go.id/acsn/{orgId}|{value}
   * Contoh nilai: MR.221102.062
   */
  accessionNumber: Yup.string()
    .optional()
    .default(undefined)
    .max(100, "Accession number maksimal 100 karakter")
    .trim(),
});

export type ImagingStudyGetValues = {
  imagingStudyId?: string;
  patientId?: string;
  encounterId?: string;
  startedFrom?: string;
  startedTo?: string;
  status?: "" | ImagingStudyStatus;
  modality?: string;
  accessionNumber?: string;
};
