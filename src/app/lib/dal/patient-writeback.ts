// lib/dal/patient-writeback.ts
// ─────────────────────────────────────────────────────────────
// Write-back IHS Patient `id` ke SIMGOS setelah POST /Patient ke
// Satu Sehat berhasil (2xx).
//
// Alur: response Satu Sehat meng-echo balik `id` (IHS Patient id, mis.
// "P11082224847") + `identifier` berisi NIK. Kita tautkan ke baris tabel
// `patient` di SIMGOS via NIK, lalu isi kolom `id`.
//
// 🔒 KEBIJAKAN (disepakati): isi HANYA baris yang `id`-nya masih kosong —
//    tidak pernah menimpa id yang sudah ada. NIK di SIMGOS tidak unik
//    (ada NIK ganda), tapi IHS id bersifat per-NIK/per-orang, jadi mengisi
//    semua baris kosong ber-NIK sama dengan id yang sama tetap konsisten.
//    Satu-satunya tulis lewat `simgosExecute` (UPDATE saja).
// ─────────────────────────────────────────────────────────────

import { simgosExecute } from "@/app/lib/db/simgos";

const NIK_RE = /^\d{16}$/;
// IHS Patient id: alfanumerik + titik/strip (FHIR id), muat di char(36).
const IHS_ID_RE = /^[A-Za-z0-9.\-]{1,36}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Ambil NIK dari resource Patient FHIR (identifier dgn system diakhiri "/nik"). */
export function extractNik(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const ids = resource.identifier;
  if (!Array.isArray(ids)) return null;
  for (const idf of ids) {
    if (
      isRecord(idf) &&
      typeof idf.system === "string" &&
      typeof idf.value === "string" &&
      idf.system.endsWith("/nik")
    ) {
      const v = idf.value.trim();
      if (NIK_RE.test(v)) return v;
    }
  }
  return null;
}

/** Ambil id resource (IHS Patient id) dari response Satu Sehat. */
export function extractResourceId(resource: unknown): string | null {
  if (!isRecord(resource)) return null;
  const id = resource.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Update kolom `id` di SIMGOS `patient` untuk NIK tertentu — isi yang kosong
 * saja (tidak menimpa). Mengembalikan jumlah baris yang terisi.
 */
export async function updatePatientIhsId(
  nik: string,
  ihsId: string,
): Promise<number> {
  if (!NIK_RE.test(nik)) throw new Error("NIK tidak valid untuk write-back");
  if (!IHS_ID_RE.test(ihsId)) throw new Error("IHS id tidak valid untuk write-back");
  return simgosExecute(
    "UPDATE `kemkes-ihs`.`patient` SET `id` = ? WHERE `nik` = ? AND (`id` IS NULL OR `id` = '')",
    [ihsId, nik],
  );
}

/**
 * Write-back id setelah POST /Patient berhasil.
 * NIK diambil dari response (di-echo Satu Sehat), fallback ke payload request.
 * Return null bila id/NIK tak bisa diekstrak (tidak melakukan apa-apa).
 */
export async function writeBackPatientIhsId(
  responseData: unknown,
  requestPayload?: unknown,
): Promise<{ nik: string; ihsId: string; updated: number } | null> {
  const ihsId = extractResourceId(responseData);
  const nik = extractNik(responseData) ?? extractNik(requestPayload);
  if (!ihsId || !nik) return null;
  const updated = await updatePatientIhsId(nik, ihsId);
  return { nik, ihsId, updated };
}
