export const ALLOWED_RESOURCES = new Set([
  "AllergyIntolerance",
  "CarePlan",
  "ClinicalImpression",
  "Condition",
  "DiagnosticReport",
  "Encounter",
  "EpisodeOfCare",
  "Location",
  "MedicationRequest",
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
