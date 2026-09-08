// lib/ihs/composition-section.ts
// ─────────────────────────────────────────────────────────────
// De-stale `Composition.section` (Resume Medis Rawat Inap).
//
// MASALAH: kolom `composition_resume.section` di-materialize SEKALI oleh
// prosedur SIMGOS `resumeToCompositionByNopen` lalu BEKU. Bila saat itu
// resource rujukan (Observation TTV, Condition, ClinicalImpression, dst.)
// belum punya id Satu Sehat, section tersimpan kosong (`entry:[]`,
// `section:null`, atau `entry:[{reference:null}]`). Batch harian tidak
// pernah menyegarkan baris lama, jadi section usang selamanya → gagal
// FHIR cmp-1 ("section wajib punya text | entry | section").
//
// SOLUSI (read-only, TIDAK menulis ke SIMGOS): rakit ulang `section`
// dari id TERKINI dengan mereproduksi ekspresi VSECTION prosedur (memakai
// fungsi SIMGOS `getObJectReference` yang sama), lalu:
//   1. buang entry ber-reference null/kosong (bug prosedur untuk resource
//      yang belum terkirim),
//   2. buang (atau isi placeholder) section yang tetap kosong.
// Baris SIMGOS asli tak tersentuh → operator bisa revert via `?rebuild=0`.
// ─────────────────────────────────────────────────────────────

import { simgosQuery } from "@/app/lib/db/simgos";

// Reproduksi read-only ekspresi VSECTION `resumeToCompositionByNopen`,
// membaca id TERKINI. VNUTRISI/VHASLAB/VHASRAD/VDIAGNOSA/VICD9CM di-inline
// sebagai subquery skalar (korelasi pada r.NOPEN). Identifier & pemanggilan
// fungsi identik dengan prosedur agar hasilnya setara (kecuali id lebih baru).
const REBUILD_SECTION_SQL = `
SELECT JSON_ARRAY(
  /* 0. Anamnesis */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 2))),
    'title', 'Anamnesis',
    'section', (
      SELECT JSON_ARRAYAGG(section_item) FROM (
        SELECT JSON_OBJECT(
          'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 1))),
          'title', 'Keluhan Utama',
          'entry', JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Condition/', ku.id)))
        ) AS section_item WHERE ku.id IS NOT NULL
        UNION ALL
        SELECT JSON_OBJECT(
          'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 4))),
          'title', 'Riwayat Penyakit Pribadi Sekarang',
          'entry', JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Condition/', ca.id)))
        ) WHERE ca.id IS NOT NULL
        UNION ALL
        SELECT JSON_OBJECT(
          'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 6))),
          'title', 'Riwayat Alergi',
          'entry', JSON_ARRAY(JSON_OBJECT('reference', CONCAT('AllergyIntolerance/', ai.id)))
        ) WHERE ai.id IS NOT NULL
      ) anamesis
    )
  ),
  /* 1. Pemeriksaan Fisik > Tanda Vital */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 3))),
    'title', 'Pemeriksaan Fisik',
    'section', (
      SELECT JSON_ARRAYAGG(section_item) FROM (
        SELECT JSON_OBJECT(
          'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 8))),
          'title', 'Tanda Vital',
          'entry', JSON_MERGE_PRESERVE(
            IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('reference', CONCAT('Observation/', ob.id)))
                    FROM \`kemkes-ihs\`.observation ob WHERE ob.refId = r.TANDA_VITAL AND ob.id IS NOT NULL), JSON_ARRAY()),
            IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('reference', CONCAT('Observation/', obn.id)))
                    FROM \`kemkes-ihs\`.observation_nutrisi obn WHERE obn.nopen = r.NOPEN AND obn.id IS NOT NULL), JSON_ARRAY())
          )
        ) AS section_item
      ) pf
    )
  ),
  /* 2. Perencanaan Perawatan (guard id NOT NULL — hindari reference:null) */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 5))),
    'title', 'Perencanaan Perawatan',
    'entry', (SELECT JSON_ARRAYAGG(JSON_OBJECT('reference', CONCAT('ClinicalImpression/', cia2.id)))
              FROM \`kemkes-ihs\`.clinical_impression_anamnesis cia2 WHERE cia2.refId = r.ANAMNESIS AND cia2.id IS NOT NULL)
  ),
  /* 3. Pemeriksaan Penunjang (lab + radiologi) */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 6))),
    'title', 'Pemeriksaan Penunjang',
    'section', (
      SELECT JSON_ARRAYAGG(obj) FROM (
        SELECT (
          SELECT CASE WHEN COUNT(hasil.lab)=0 THEN NULL ELSE JSON_OBJECT(
            'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 12))),
            'title', 'Hasil Pemeriksaan Laboratorium', 'entry', JSON_ARRAYAGG(jt.item)) END
          FROM (
            SELECT JSON_MERGE_PRESERVE(
              IF(sr.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('ServiceRequest/', sr.id))), JSON_ARRAY()),
              IF(sp.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Specimen/', sp.id))), JSON_ARRAY()),
              IF(dr.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('DiagnosticReport/', dr.id))), JSON_ARRAY()),
              IFNULL((SELECT JSON_ARRAYAGG(JSON_OBJECT('reference', CONCAT('Observation/', ob.id)))
                      FROM \`kemkes-ihs\`.observation ob LEFT JOIN layanan.hasil_lab hl ON hl.ID = ob.refId
                      WHERE hl.TINDAKAN_MEDIS = tm.ID AND ob.id IS NOT NULL), JSON_ARRAY())
            ) AS lab
            FROM \`kemkes-ihs\`.service_request sr
            LEFT JOIN layanan.tindakan_medis tm ON tm.ID = sr.refId
            LEFT JOIN \`master\`.tindakan t ON t.ID = tm.TINDAKAN
            LEFT JOIN \`kemkes-ihs\`.specimen sp ON sp.refId = tm.ID
            LEFT JOIN \`kemkes-ihs\`.diagnostic_report dr ON dr.refId = tm.ID
            WHERE sr.nopen = r.NOPEN AND t.JENIS = 8 AND tm.\`STATUS\` = 1
          ) hasil LEFT JOIN JSON_TABLE(IFNULL(hasil.lab, JSON_ARRAY()), '$[*]' COLUMNS (item JSON PATH '$')) jt ON TRUE
        ) AS obj
        WHERE (SELECT COUNT(*) FROM \`kemkes-ihs\`.service_request sr LEFT JOIN layanan.tindakan_medis tm ON tm.ID=sr.refId LEFT JOIN \`master\`.tindakan t ON t.ID=tm.TINDAKAN WHERE sr.nopen=r.NOPEN AND t.JENIS=8 AND tm.\`STATUS\`=1) > 0
        UNION ALL
        SELECT (
          SELECT CASE WHEN COUNT(hasil.rad)=0 THEN NULL ELSE JSON_OBJECT(
            'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 13))),
            'title', 'Hasil Pemeriksaan Radiologi', 'entry', JSON_ARRAYAGG(jt.item)) END
          FROM (
            SELECT JSON_MERGE_PRESERVE(
              IF(sr.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('ServiceRequest/', sr.id))), JSON_ARRAY()),
              IF(sp.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('ImagingStudy/', sp.id))), JSON_ARRAY()),
              IF(ob.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Observation/', ob.id))), JSON_ARRAY()),
              IF(dr.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('DiagnosticReport/', dr.id))), JSON_ARRAY())
            ) AS rad
            FROM \`kemkes-ihs\`.service_request sr
            LEFT JOIN layanan.tindakan_medis tm ON tm.ID = sr.refId
            LEFT JOIN \`master\`.tindakan t ON t.ID = tm.TINDAKAN
            LEFT JOIN \`kemkes-ihs\`.imaging_study sp ON sp.refId = tm.ID
            LEFT JOIN \`kemkes-ihs\`.observation ob ON ob.refId = tm.ID AND ob.jenis = 7
            LEFT JOIN \`kemkes-ihs\`.diagnostic_report dr ON dr.refId = tm.ID
            WHERE sr.nopen = r.NOPEN AND t.JENIS = 7 AND tm.\`STATUS\` = 1
          ) hasil LEFT JOIN JSON_TABLE(IFNULL(hasil.rad, JSON_ARRAY()), '$[*]' COLUMNS (item JSON PATH '$')) jt ON TRUE
        ) AS obj
        WHERE (SELECT COUNT(*) FROM \`kemkes-ihs\`.service_request sr LEFT JOIN layanan.tindakan_medis tm ON tm.ID=sr.refId LEFT JOIN \`master\`.tindakan t ON t.ID=tm.TINDAKAN WHERE sr.nopen=r.NOPEN AND t.JENIS=7 AND tm.\`STATUS\`=1) > 0
      ) x
    )
  ),
  /* 4. Diagnosis */
  JSON_OBJECT(
    'title', 'Diagnosis',
    'section', (
      SELECT JSON_ARRAYAGG(d.obj) FROM (
        SELECT CASE WHEN COUNT(diagnosa.diagnosa_ci)=0 THEN NULL ELSE JSON_OBJECT(
          'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(94, 14))),
          'title', 'Diagnosis Akhir', 'entry', JSON_ARRAYAGG(jt.item)) END AS obj
        FROM (
          SELECT JSON_MERGE_PRESERVE(
            IF(c.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Condition/', c.id))), JSON_ARRAY()),
            IF(ci.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('ClinicalImpression/', ci.id))), JSON_ARRAY())
          ) AS diagnosa_ci
          FROM \`kemkes-ihs\`.\`condition\` c
          LEFT JOIN \`kemkes-ihs\`.clinical_impression_diagnosa ci ON c.refId = ci.refId
          WHERE c.nopen = r.NOPEN AND c.id IS NOT NULL
        ) diagnosa LEFT JOIN JSON_TABLE(IFNULL(diagnosa.diagnosa_ci, JSON_ARRAY()), '$[*]' COLUMNS (item JSON PATH '$')) jt ON TRUE
      ) d WHERE d.obj IS NOT NULL
    )
  ),
  /* 5. Tindakan/Prosedur Medis */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 7))),
    'title', 'Tindakan/Prosedur Medis',
    'entry', (
      SELECT CASE WHEN COUNT(tindakan.tindakan)=0 THEN NULL ELSE JSON_ARRAYAGG(jt.item) END
      FROM (
        SELECT JSON_MERGE_PRESERVE(
          IF(c.id IS NOT NULL, JSON_ARRAY(JSON_OBJECT('reference', CONCAT('Procedure/', c.id))), JSON_ARRAY()), JSON_ARRAY()
        ) AS tindakan
        FROM \`kemkes-ihs\`.\`procedure\` c WHERE c.nopen = r.NOPEN AND c.id IS NOT NULL
      ) tindakan LEFT JOIN JSON_TABLE(IFNULL(tindakan.tindakan, JSON_ARRAY()), '$[*]' COLUMNS (item JSON PATH '$')) jt ON TRUE
    )
  ),
  /* 6. Perjalanan Kunjungan Pasien */
  JSON_OBJECT(
    'code', JSON_OBJECT('coding', JSON_ARRAY(\`kemkes-ihs\`.getObJectReference(41, 12))),
    'title', 'Perjalanan Kunjungan Pasien',
    'text', JSON_OBJECT('div', IF(an.ID IS NOT NULL, an.DESKRIPSI, ''), 'status', 'additional')
  )
) AS section
FROM medicalrecord.resume r
LEFT JOIN \`kemkes-ihs\`.keluhan_utama_condition ku ON ku.refId = r.KELUHAN_UTAMA
LEFT JOIN \`kemkes-ihs\`.condition_anamnesis ca ON ca.refId = r.ANAMNESIS
LEFT JOIN \`kemkes-ihs\`.clinical_impression_anamnesis cia ON cia.refId = r.ANAMNESIS
LEFT JOIN medicalrecord.anamnesis an ON an.ID = r.ANAMNESIS
LEFT JOIN \`kemkes-ihs\`.allergy_intolerance ai ON ai.nopen = r.NOPEN
WHERE r.NOPEN = ?
LIMIT 1`;

type Sec = Record<string, unknown>;

/** Perlakuan section yang tetap kosong setelah rakit-ulang. */
export type EmptyMode = "drop" | "fill";

/** Narasi placeholder saat mode "fill" (memenuhi cmp-1 tanpa data nyata). */
const PLACEHOLDER_TEXT = {
  status: "additional",
  div: "Tidak ada data pada bagian ini.",
};

/** Reference valid = objek dengan `reference` string non-kosong & tak ber-akhir /null. */
function validRef(e: unknown): boolean {
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  const ref = (e as Sec).reference;
  return (
    typeof ref === "string" && ref.trim() !== "" && !/\/(null|undefined)$/i.test(ref)
  );
}

/** Section punya narasi text yang berisi (div non-kosong). */
function hasNarrative(sec: Sec): boolean {
  const t = sec.text;
  if (!t || typeof t !== "object") return false;
  const div = (t as Sec).div;
  return typeof div === "string" && div.trim() !== "";
}

interface PruneStats {
  nullRefsRemoved: number;
}

/**
 * Bersihkan satu section secara rekursif (bottom-up):
 *   • entry  → buang item ber-reference null/kosong; hapus `entry` bila habis.
 *   • section→ rekursi; buang anak yang jadi kosong; hapus `section` bila habis.
 * Lalu klasifikasi cmp-1: valid bila punya text | entry | section.
 * Bila kosong: mode "drop" → null (dibuang caller); "fill" → beri placeholder.
 */
function pruneSection(
  raw: unknown,
  mode: EmptyMode,
  stats: PruneStats,
): Sec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const sec: Sec = { ...(raw as Sec) };

  if (Array.isArray(sec.entry)) {
    const kept = (sec.entry as unknown[]).filter((e) => {
      const ok = validRef(e);
      if (!ok) stats.nullRefsRemoved++;
      return ok;
    });
    if (kept.length) sec.entry = kept;
    else delete sec.entry;
  } else if ("entry" in sec) {
    delete sec.entry; // null / skalar
  }

  if (Array.isArray(sec.section)) {
    const kept = (sec.section as unknown[])
      .map((c) => pruneSection(c, mode, stats))
      .filter((c): c is Sec => c != null);
    if (kept.length) sec.section = kept;
    else delete sec.section;
  } else if ("section" in sec) {
    delete sec.section;
  }

  const valid =
    hasNarrative(sec) || Array.isArray(sec.entry) || Array.isArray(sec.section);
  if (valid) return sec;
  if (mode === "fill") {
    sec.text = { ...PLACEHOLDER_TEXT };
    return sec;
  }
  return null;
}

/** Judul tiap node (segala kedalaman) yang BERISI (entry valid / narasi). */
function contentTitles(section: unknown, into: Set<string> = new Set()): Set<string> {
  if (!Array.isArray(section)) return into;
  for (const s of section) {
    if (!s || typeof s !== "object") continue;
    const sec = s as Sec;
    const title = typeof sec.title === "string" ? sec.title : "(tanpa judul)";
    const hasEntry = Array.isArray(sec.entry) && (sec.entry as unknown[]).some(validRef);
    if (hasEntry || hasNarrative(sec)) into.add(title);
    if (Array.isArray(sec.section)) contentTitles(sec.section, into);
  }
  return into;
}

export interface DestaleResult {
  /** Section hasil rakit-ulang + prune (valid cmp-1). */
  section: Sec[];
  /** Ringkasan perubahan untuk UI (bahasa Indonesia). */
  changes: string[];
  /** Judul section yang pulih (kosong di asli → berisi setelah de-stale). */
  recovered: string[];
  /** Judul section yang dibuang/diisi karena tetap kosong. */
  emptied: string[];
  /** Jumlah reference null/kosong yang dibuang. */
  nullRefsRemoved: number;
}

/**
 * Rakit ulang `section` Composition Rawat Inap dari id TERKINI (read-only),
 * prune, lalu bandingkan dengan `original` (section tersimpan) untuk ringkasan.
 * Return null bila baris resume tak ditemukan (caller pertahankan yang asli).
 */
export async function destaleCompositionSection(
  nopen: string,
  original: unknown,
  mode: EmptyMode = "drop",
): Promise<DestaleResult | null> {
  const rows = await simgosQuery<{ section: unknown }>(REBUILD_SECTION_SQL, [nopen]);
  if (!rows.length) return null;
  const rawSection = rows[0].section;
  const fresh =
    typeof rawSection === "string" ? JSON.parse(rawSection) : rawSection;
  if (!Array.isArray(fresh)) return null;

  const stats: PruneStats = { nullRefsRemoved: 0 };
  const pruned = fresh
    .map((s) => pruneSection(s, mode, stats))
    .filter((s): s is Sec => s != null);

  // Diff judul-berisi asli vs hasil untuk ringkasan operator.
  const beforeTitles = contentTitles(original);
  const afterTitles = contentTitles(pruned);
  const recovered = [...afterTitles].filter((t) => !beforeTitles.has(t));
  const emptied = [...beforeTitles].filter((t) => !afterTitles.has(t));

  const changes: string[] = [];
  if (recovered.length) changes.push(`Dipulihkan: ${recovered.join(", ")}`);
  if (emptied.length)
    changes.push(
      `${mode === "fill" ? "Diisi placeholder" : "Dibuang (kosong)"}: ${emptied.join(", ")}`,
    );
  if (stats.nullRefsRemoved)
    changes.push(`Referensi null dibuang: ${stats.nullRefsRemoved}`);
  if (!changes.length) changes.push("Tidak ada perubahan");

  return {
    section: pruned,
    changes,
    recovered,
    emptied,
    nullRefsRemoved: stats.nullRefsRemoved,
  };
}

/**
 * Prune-only (tanpa SQL) untuk section yang SUDAH ada di payload — dipakai
 * jalur Rawat Jalan (`composition`) atau fallback: hanya buang entry null &
 * section kosong, tanpa rakit-ulang dari sumber. Return null bila tak berubah.
 */
export function pruneCompositionSectionArray(
  section: unknown,
  mode: EmptyMode = "drop",
): { section: Sec[]; nullRefsRemoved: number } | null {
  if (!Array.isArray(section)) return null;
  const stats: PruneStats = { nullRefsRemoved: 0 };
  const before = JSON.stringify(section);
  const pruned = section
    .map((s) => pruneSection(s, mode, stats))
    .filter((s): s is Sec => s != null);
  if (JSON.stringify(pruned) === before) return null;
  return { section: pruned, nullRefsRemoved: stats.nullRefsRemoved };
}
