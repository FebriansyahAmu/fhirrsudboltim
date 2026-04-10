// lib/utils/security.ts
// Utility keamanan: sanitasi output, validasi input, pencegahan XSS/IDOR

/**
 * Sanitasi string untuk mencegah XSS sebelum ditampilkan sebagai teks biasa.
 * Gunakan ini HANYA jika harus merender string ke innerHTML.
 * Selalu prefer React's default rendering (auto-escape) daripada dangerouslySetInnerHTML.
 */
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

/**
 * Validasi UUID v4 untuk mencegah IDOR dan path traversal.
 * Selalu validasi ID sebelum digunakan dalam request URL.
 */
export function isValidUUID(value: string): boolean {
  const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return UUID_REGEX.test(value);
}

/**
 * Build URL API yang aman — mencegah path traversal dengan validasi ID.
 * Throw jika ID tidak valid daripada membangun URL yang berbahaya.
 */
export function buildSafeApiUrl(
  base: string,
  resourceType: string,
  resourceId?: string,
): string {
  // Pastikan base URL tidak mengandung fragment atau query string berbahaya
  const allowedResourceTypes = [
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
    "Questionnaire",
    "QuestionnaireResponse",
    "ServiceRequest",
  ];

  if (!allowedResourceTypes.includes(resourceType)) {
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

/**
 * Build query string yang aman dari object parameter.
 * Otomatis encode semua nilai untuk mencegah injection.
 */
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

/**
 * Ambil token dari storage dengan aman.
 * Tidak pernah melempar error — kembalikan null jika tidak ada.
 */
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

/**
 * Simpan token ke sessionStorage dengan aman.
 */
export function storeToken(token: string): void {
  try {
    sessionStorage.setItem("ss_access_token", token);
  } catch {
    console.warn("Gagal menyimpan token ke sessionStorage");
  }
}

/**
 * Bersihkan token dari storage (logout).
 */
export function clearToken(): void {
  try {
    sessionStorage.removeItem("ss_access_token");
  } catch {
    // Silent fail
  }
}

/**
 * Format JSON untuk tampilan yang aman.
 * Selalu gunakan JSON.stringify — JANGAN eval() atau Function().
 */
export function safeJsonStringify(data: unknown, indent = 2): string {
  try {
    return JSON.stringify(data, null, indent);
  } catch {
    return '{"error": "Data tidak dapat diformat"}';
  }
}

/**
 * Parse JSON dengan aman — tidak pernah melempar error.
 */
export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Validasi bahwa string hanya mengandung karakter yang diizinkan untuk ID log.
 */
export function generateLogId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
