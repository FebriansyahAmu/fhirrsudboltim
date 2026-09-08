// lib/dal/encounter-writeback.ts
// ─────────────────────────────────────────────────────────────
// Pasca-proses hasil POST /Encounter ke Satu Sehat.
//
//   • SUKSES (2xx): write-back IHS `id` ke SIMGOS `encounter`, ditautkan
//     via `refId` (= identifier[0].value, No. Pendaftaran). Isi HANYA baris
//     yang id-nya masih kosong (tidak menimpa). Tulis lewat `simgosExecute`.
//
//   • GAGAL (4xx/5xx): tulis catatan otomatis ke DB KITA sendiri
//     (`ihs_row_notes`, BUKAN SIMGOS) dengan penanda warna "kuning"
//     (Warning) + ringkasan alasan gagal, agar operator bisa menindaklanjuti
//     dari panel SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";
import { upsertNote, resolveKuningNote, NOTE_MAX } from "@/app/lib/ihs/notes.dal";

const REFID_RE = /^\d{10}$/;
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,36}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Ambil refId Encounter dari resource FHIR. refId = identifier[0].value
 * (No. Pendaftaran, format YYMMDDNNNN). Utamakan identifier ber-system
 * ".../encounter/…"; fallback ke nilai identifier pertama yang berbentuk refId.
 */
export function extractEncounterRefId(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const ids = resource.identifier;
  if (!Array.isArray(ids)) return null;
  let fallback: string | null = null;
  for (const idf of ids) {
    if (!isRecord(idf) || typeof idf.value !== "string") continue;
    const v = idf.value.trim();
    if (!REFID_RE.test(v)) continue;
    if (typeof idf.system === "string" && idf.system.includes("/encounter/")) {
      return v;
    }
    if (fallback == null) fallback = v;
  }
  return fallback;
}

/** Ambil id resource (IHS id) dari response Satu Sehat. */
export function extractResourceId(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const id = resource.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Update kolom `id` di SIMGOS `encounter` untuk refId tertentu — isi yang
 * kosong saja (tidak menimpa). refId adalah PK (unik) → maksimal 1 baris.
 */
export async function updateEncounterIhsId(
  refId: string,
  ihsId: string,
): Promise<number> {
  if (!REFID_RE.test(refId))
    throw new Error("refId Encounter tidak valid untuk write-back");
  if (!IHS_ID_RE.test(ihsId))
    throw new Error("IHS id tidak valid untuk write-back");
  return simgosExecute(
    "UPDATE `kemkes-ihs`.`encounter` SET `id` = ? WHERE `refId` = ? AND (`id` IS NULL OR `id` = '')",
    [ihsId, refId],
  );
}

/** Ringkas alasan gagal dari OperationOutcome / error response. */
function extractDiagnostics(responseData: unknown): string | null {
  if (!isRecord(responseData)) return null;
  const issues = responseData.issue;
  if (Array.isArray(issues)) {
    const msgs: string[] = [];
    for (const it of issues) {
      if (!isRecord(it)) continue;
      const diag = typeof it.diagnostics === "string" ? it.diagnostics : null;
      const details =
        isRecord(it.details) && typeof it.details.text === "string"
          ? it.details.text
          : null;
      const code = typeof it.code === "string" ? it.code : null;
      const m = diag ?? details ?? code;
      if (m) msgs.push(m);
    }
    if (msgs.length) return msgs.join(" | ");
  }
  if (typeof responseData.error === "string") return responseData.error;
  return null;
}

/** Bangun teks catatan kegagalan (dipangkas ke NOTE_MAX). */
function buildFailureNote(status: number, responseData: unknown): string {
  const diag = extractDiagnostics(responseData);
  const s = `POST Encounter gagal (HTTP ${status}).${diag ? " " + diag : ""}`;
  return s.length > NOTE_MAX ? s.slice(0, NOTE_MAX) : s;
}

/**
 * Proses hasil POST /Encounter: write-back id bila sukses, atau catatan
 * "kuning" (warning) bila gagal. Aman dipanggil fire-and-forget dari route —
 * caller membungkus dengan try/catch agar response ke client tak terganggu.
 */
export async function handleEncounterPostResult(params: {
  status: number;
  responseData: unknown;
  requestPayload: unknown;
  userId: string;
}): Promise<{ action: "writeback" | "note" | "skipped"; refId: string | null }> {
  const { status, responseData, requestPayload, userId } = params;
  const refId =
    extractEncounterRefId(requestPayload) ?? extractEncounterRefId(responseData);
  if (!refId) {
    console.warn("[encounter] refId tak dapat diekstrak — dilewati");
    return { action: "skipped", refId: null };
  }

  const ok = status >= 200 && status < 300;
  if (ok) {
    const ihsId = extractResourceId(responseData);
    if (!ihsId) {
      console.warn(`[encounter writeback] refId=${refId} id response kosong — dilewati`);
      return { action: "skipped", refId };
    }
    // Write-back id ke SIMGOS — dibungkus agar kegagalannya (mis. koneksi DB)
    // TIDAK menghalangi resolve catatan di DB kita (dua sistem independen).
    try {
      const updated = await updateEncounterIhsId(refId, ihsId);
      console.log(`[encounter writeback] refId=${refId} id=${ihsId} rows=${updated}`);
    } catch (err) {
      console.error(`[encounter writeback] gagal update SIMGOS refId=${refId}:`, err);
    }
    // Sukses & dapat id → bila baris ini sebelumnya "kuning" (Ditinjau, dari
    // kegagalan kirim), tandai SELESAI (hijau). Idempotent; no-op bila tak ada.
    try {
      const n = await resolveKuningNote({
        module: "encounter",
        refKey: refId,
        note: `Selesai — Encounter berhasil terkirim (id ${ihsId}).`,
        userId,
      });
      if (n > 0) console.log(`[encounter note] refId=${refId} → SELESAI (kuning→hijau)`);
    } catch (err) {
      console.error(`[encounter note] gagal tandai selesai refId=${refId}:`, err);
    }
    return { action: "writeback", refId };
  }

  // Gagal → catatan kuning (warning) di DB kita.
  await upsertNote({
    module: "encounter",
    refKey: refId,
    mark: "kuning",
    note: buildFailureNote(status, responseData),
    userId,
  });
  console.warn(`[encounter note] refId=${refId} status=${status} → catatan kuning`);
  return { action: "note", refId };
}

/**
 * Proses hasil GET /Encounter: bila sukses (2xx) dan response memuat id + refId,
 * tandai SELESAI catatan "kuning" pada baris itu (kuning→hijau). refId & id
 * diekstrak dari RESPONSE (Encounter tak memakai ?module=&key=). Idempotent;
 * no-op bila tak ada catatan kuning. Fire-and-forget.
 */
export async function handleEncounterGetResult(params: {
  resource: string;
  status: number;
  responseData: unknown;
  userId: string;
}): Promise<void> {
  const { resource, status, responseData, userId } = params;
  if (resource !== "Encounter") return;
  if (status < 200 || status >= 300) return;
  const refId = extractEncounterRefId(responseData);
  const ihsId = extractResourceId(responseData);
  if (!refId || !ihsId) return;
  try {
    const n = await resolveKuningNote({
      module: "encounter",
      refKey: refId,
      note: `Selesai — Encounter terkonfirmasi ada di Satu Sehat (id ${ihsId}).`,
      userId,
    });
    if (n > 0) console.log(`[encounter note] refId=${refId} → SELESAI via GET (kuning→hijau)`);
  } catch (err) {
    console.error(`[encounter note] gagal tandai selesai (GET) refId=${refId}:`, err);
  }
}
