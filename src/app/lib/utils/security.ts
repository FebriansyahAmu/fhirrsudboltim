export function sanitizeText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

export function isValidUUID(value: string): boolean {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_REGEX.test(value);
}

const CLIENT_ALLOWED_RESOURCES = new Set([
  "AllergyIntolerance",
  "CarePlan",
  "ClinicalImpression",
  "Condition",
  "DiagnosticReport",
  "Encounter",
  "EpisodeOfCare",
  "Location",
  "Medication",
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

export function buildSafeApiUrl(
  base: string,
  resourceType: string,
  resourceId?: string,
): string {
  if (!CLIENT_ALLOWED_RESOURCES.has(resourceType)) {
    throw new Error(`Resource type tidak diizinkan: ${resourceType}`);
  }

  if (resourceId !== undefined && resourceId !== "") {
    if (!isValidUUID(resourceId)) {
      throw new Error(
        `Resource ID tidak valid. Harus dalam format UUID: ${resourceId}`,
      );
    }
    return `${base}/${resourceType}/${encodeURIComponent(resourceId)}`;
  }

  return `${base}/${resourceType}`;
}

export function buildSafeQueryString(
  params: Record<string, string | undefined>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      searchParams.append(key, value);
    }
  }
  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export function getStoredToken(): string | null {
  try {
    // Gunakan sessionStorage (lebih aman dari localStorage untuk token)
    const token = sessionStorage.getItem("ss_access_token");
    if (!token || typeof token !== "string") return null;
    // Pastikan token tidak mengandung karakter berbahaya untuk header
    if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(token)) return null;
    return token;
  } catch {
    return null;
  }
}

export function storeToken(token: string): void {
  try {
    sessionStorage.setItem("ss_access_token", token);
  } catch {
    console.warn("Gagal menyimpan token ke sessionStorage");
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem("ss_access_token");
  } catch {
    // Silent fail
  }
}

export function safeJsonStringify(data: unknown, indent = 2): string {
  try {
    return JSON.stringify(data, null, indent);
  } catch {
    return '{"error": "Data tidak dapat diformat"}';
  }
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
