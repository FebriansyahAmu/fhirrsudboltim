/**
 * lib/schemas/practitioner.schema.ts
 *
 * Yup validation schema untuk form Practitioner — GET (search).
 *
 * Parameter GET Practitioner Satu Sehat:
 *   - practitionerId : UUID resource langsung
 *   - nik            : NIK dokter → identifier=https://fhir.kemkes.go.id/id/nik|{nik}
 *
 * Referensi FHIR: https://www.hl7.org/fhir/practitioner.html
 */

import * as Yup from "yup";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NIK_REGEX = /^\d{16}$/;

export const practitionerGetSchema = Yup.object({
  practitionerId: Yup.string()
    .optional()
    .default(undefined)
    .test("uuid-if-present", "Practitioner ID harus dalam format UUID", (v) => {
      if (!v) return true;
      return UUID_REGEX.test(v);
    })
    .trim(),

  nik: Yup.string()
    .optional()
    .default(undefined)
    .test("nik-if-present", "NIK harus 16 digit angka", (v) => {
      if (!v) return true;
      return NIK_REGEX.test(v);
    })
    .trim(),
});

export type PractitionerGetValues = Yup.InferType<typeof practitionerGetSchema>;
