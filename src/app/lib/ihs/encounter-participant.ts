// lib/ihs/encounter-participant.ts
// ─────────────────────────────────────────────────────────────
// Resolusi Encounter.participant (DPJP) dari SIMGOS untuk MELENGKAPI payload
// Encounter yang kolom `participant`-nya kosong sebelum dikirim ke Satu Sehat
// (profil Kemkes mewajibkan participant — RuleNumber 10336).
//
// Rantai JOIN (read-only, dikueri per tabel agar aman dari campuran collation
// antar-skema):
//   encounter.refId (= NOPEN / No. Pendaftaran)
//     → pendaftaran.kunjungan.DPJP   (kunjungan pertama dgn DPJP ≠ 0)
//     → master.dokter.ID → NIP
//     → pegawai.kartu_identitas.NOMOR (NIK, JENIS = 1 / KTP)
//     → kemkes-ihs.practitioner.refId = NIK → id (IHS Practitioner)
//   (+ nama tampilan dari master.pegawai)
//
// Rantai ini divalidasi pada encounter yang participant-nya SUDAH terisi:
//   2609010016 → DPJP 20 → NIK 7171062602900001 → practitioner 10010716456
//   (cocok dengan participant tersimpan "Practitioner/10010716456").
//
// 🔒 Hanya SELECT (lewat simgosQuery). Tidak menulis apa pun ke SIMGOS.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

const PARTICIPATION_TYPE = {
  system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
  code: "ATND",
  display: "attender",
};

export interface EncounterParticipant {
  type: { coding: { system: string; code: string; display: string }[] }[];
  individual: { reference: string; display?: string };
}

/** Susun nama tampilan dokter: "<gelar depan> <NAMA>, <gelar belakang>". */
function buildDisplay(p?: {
  NAMA?: string | null;
  GELAR_DEPAN?: string | null;
  GELAR_BELAKANG?: string | null;
}): string | undefined {
  const nama = (p?.NAMA ?? "").trim();
  if (!nama) return undefined;
  const front = (p?.GELAR_DEPAN ?? "").trim();
  const back = (p?.GELAR_BELAKANG ?? "").trim();
  let s = front ? `${front} ${nama}` : nama;
  if (back) s = `${s}, ${back}`;
  return s;
}

/**
 * Cari participant (DPJP) sebuah Encounter berdasarkan No. Pendaftaran (NOPEN).
 * Return null bila DPJP tidak tercatat, atau dokternya belum punya IHS id
 * (baris tetap tanpa participant → tetap gagal & tercatat kuning; tidak dipaksa).
 */
export async function resolveEncounterParticipant(
  nopen: string,
): Promise<EncounterParticipant[] | null> {
  if (!/^\d{1,10}$/.test(nopen)) return null;

  // 1. DPJP dari kunjungan pertama (DPJP ≠ 0).
  const kj = await simgosQuery<{ DPJP: number }>(
    "SELECT DPJP FROM `pendaftaran`.`kunjungan` WHERE NOPEN = ? AND DPJP <> 0 ORDER BY MASUK LIMIT 1",
    [nopen],
  );
  const dpjp = kj[0]?.DPJP;
  if (!dpjp) return null;

  // 2. NIP dokter.
  const dk = await simgosQuery<{ NIP: string }>(
    "SELECT NIP FROM `master`.`dokter` WHERE ID = ? LIMIT 1",
    [dpjp],
  );
  const nip = dk[0]?.NIP?.trim();
  if (!nip) return null;

  // 3. NIK (KTP) dokter dari kartu identitas pegawai.
  const ki = await simgosQuery<{ NOMOR: string }>(
    "SELECT NOMOR FROM `pegawai`.`kartu_identitas` WHERE NIP = ? AND JENIS = 1 AND NOMOR IS NOT NULL AND NOMOR <> '' LIMIT 1",
    [nip],
  );
  const nik = ki[0]?.NOMOR?.trim();
  if (!nik) return null;

  // 4. IHS Practitioner id (harus sudah punya id di kemkes-ihs.practitioner).
  const pr = await simgosQuery<{ id: string }>(
    "SELECT id FROM `kemkes-ihs`.`practitioner` WHERE refId = ? AND id IS NOT NULL AND id <> '' LIMIT 1",
    [nik],
  );
  const ihsId = pr[0]?.id?.trim();
  if (!ihsId) return null;

  // 5. Nama tampilan (opsional) dari master.pegawai — display bersifat informatif.
  const peg = await simgosQuery<{
    NAMA: string;
    GELAR_DEPAN: string | null;
    GELAR_BELAKANG: string | null;
  }>(
    "SELECT NAMA, GELAR_DEPAN, GELAR_BELAKANG FROM `master`.`pegawai` WHERE NIP = ? LIMIT 1",
    [nip],
  );
  const display = buildDisplay(peg[0]);

  return [
    {
      type: [{ coding: [PARTICIPATION_TYPE] }],
      individual: {
        reference: `Practitioner/${ihsId}`,
        ...(display ? { display } : {}),
      },
    },
  ];
}
