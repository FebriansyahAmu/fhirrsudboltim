export const ALLOWED_RESOURCES = new Set([
  "AllergyIntolerance",
  "CarePlan",
  "ClinicalImpression",
  "Composition",
  "Condition",
  "DiagnosticReport",
  "Encounter",
  "EpisodeOfCare",
  "Location",
  "Medication",
  "MedicationRequest",
  "MedicationDispense",
  "Observation",
  "Organization",
  "Patient",
  "Practitioner",
  "Procedure",
  "ImagingStudy",
  "Questionnaire",
  "QuestionnaireResponse",
  "ServiceRequest",
  "Specimen",
]);

const MAX_PAYLOAD_SIZE = 1_048_576; // 1 MB

export function validateFhirPayload(
  payload: unknown,
  expectedResourceType: string,
): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return "Payload harus berupa objek JSON";
  }

  const json = JSON.stringify(payload);
  if (json.length > MAX_PAYLOAD_SIZE) {
    return "Payload terlalu besar (maksimal 1 MB)";
  }

  const obj = payload as Record<string, unknown>;

  if (typeof obj.resourceType !== "string") {
    return "Field 'resourceType' wajib ada dan berupa string";
  }

  if (obj.resourceType !== expectedResourceType) {
    return `resourceType payload '${obj.resourceType}' tidak cocok dengan endpoint '${expectedResourceType}'`;
  }

  return null;
}

/** Operasi JSON Patch (RFC 6902) yang diizinkan. */
const JSON_PATCH_OPS = new Set([
  "add",
  "remove",
  "replace",
  "move",
  "copy",
  "test",
]);

/**
 * Validasi body PATCH sebagai JSON Patch (RFC 6902) — SATU array operasi,
 * BUKAN resource FHIR (mis. `[{ "op": "replace", "path": "/status", "value":
 * "amended" }]`). Satu Sehat menerima PATCH dalam format ini. Return pesan
 * error atau null bila valid.
 */
export function validateJsonPatch(payload: unknown): string | null {
  if (!Array.isArray(payload) || payload.length === 0) {
    return "Payload PATCH harus berupa array JSON Patch (RFC 6902) yang non-kosong";
  }

  const json = JSON.stringify(payload);
  if (json.length > MAX_PAYLOAD_SIZE) {
    return "Payload terlalu besar (maksimal 1 MB)";
  }

  for (let i = 0; i < payload.length; i++) {
    const op = payload[i];
    if (typeof op !== "object" || op === null || Array.isArray(op)) {
      return `Operasi PATCH ke-${i + 1} harus berupa objek`;
    }
    const o = op as Record<string, unknown>;
    if (typeof o.op !== "string" || !JSON_PATCH_OPS.has(o.op)) {
      return `Operasi PATCH ke-${i + 1} punya 'op' tidak valid`;
    }
    if (typeof o.path !== "string" || !o.path.startsWith("/")) {
      return `Operasi PATCH ke-${i + 1} punya 'path' tidak valid`;
    }
  }

  return null;
}
