// prisma/seed-lab-loinc.mjs
// ─────────────────────────────────────────────────────────────
// Buat & isi tabel `lab_loinc_map` di DB KITA (fhir_satusehat).
// Peta: parameter lab SIMGOS (master.parameter_tindakan_lab.ID =
// hasil_lab.PARAMETER_TINDAKAN) → kode LOINC yang BENAR + satuan UCUM.
// Dipakai enrichment aplikasi untuk MERAKIT ULANG Observation LAB (code + value
// + interpretation) saat rakit payload — TANPA menyentuh SIMGOS.
//
//   active=1 → dipakai enrichment (kode terverifikasi).
//   active=0 → worklist: perlu konfirmasi lab / kode belum pasti (loinc_code
//              boleh NULL). Tidak dipakai enrichment.
//   ucum_code NULL → hasil kualitatif (Negatif/Positif) → tetap valueString.
//
// Idempotent: aman dijalankan ulang.
//   node --env-file=.env prisma/seed-lab-loinc.mjs
// ─────────────────────────────────────────────────────────────
import mariadb from "mariadb";

const pool = mariadb.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: Number(process.env.DATABASE_PORT),
  connectionLimit: 2,
  allowPublicKeyRetrieval: true,
});

// [id, loinc_code, loinc_display, param_name, ucum_unit, ucum_code, active, note]
const A = 1, X = 0; // aktif / nonaktif
const SEED = [
  // ── Darah rutin / CBC (kuantitatif) ──
  [10235002, "6690-2", "Leukocytes [#/volume] in Blood by Automated count", "WBC", "10*3/uL", "10*3/uL", A, null],
  [10235004, "736-9", "Lymphocytes/100 leukocytes in Blood by Automated count", "LYM", "%", "%", A, null],
  [10235007, "789-8", "Erythrocytes [#/volume] in Blood by Automated count", "RBC", "10*6/uL", "10*6/uL", A, null],
  [10235008, "718-7", "Hemoglobin [Mass/volume] in Blood", "HGB", "g/dL", "g/dL", A, null],
  [10235009, "4544-3", "Hematocrit [Volume Fraction] of Blood by Automated count", "HCT", "%", "%", A, null],
  [10235010, "787-2", "MCV [Entitic volume] by Automated count", "MCV", "fL", "fL", A, null],
  [10235011, "785-6", "MCH [Entitic mass] by Automated count", "MCH", "pg", "pg", A, null],
  [10235012, "786-4", "MCHC [Mass/volume] by Automated count", "MCHC", "g/dL", "g/dL", A, null],
  [10235013, "777-3", "Platelets [#/volume] in Blood by Automated count", "PLT", "10*3/uL", "10*3/uL", A, null],
  // ── Kimia klinik (kuantitatif) ──
  [10027001, "2160-0", "Creatinine [Mass/volume] in Serum or Plasma", "Kreatinin", "mg/dL", "mg/dL", A, null],
  [10248001, "2160-0", "Creatinine [Mass/volume] in Serum or Plasma", "CREATININE", "mg/dL", "mg/dL", A, null],
  [10247001, "22664-7", "Urea [Mass/volume] in Serum or Plasma", "UREA", "mg/dL", "mg/dL", A, "Display standar LOINC (tak ada di kamus SIMGOS)."],
  [10245001, "3084-1", "Urate [Mass/volume] in Serum or Plasma", "Urid Acid", "mg/dL", "mg/dL", A, null],
  [10243001, "1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma", "GLUKOSA PUASA", "mg/dL", "mg/dL", A, null],
  [10243002, "2345-7", "Glucose [Mass/volume] in Serum or Plasma", "GLUKOSA SEWAKTU", "mg/dL", "mg/dL", A, null],
  [10291003, "1558-6", "Fasting glucose [Mass/volume] in Serum or Plasma", "Gula Darah Puasa GDP", "mg/dL", "mg/dL", A, null],
  [10291002, "2345-7", "Glucose [Mass/volume] in Serum or Plasma", "Gula Darah Sewaktu", "mg/dL", "mg/dL", A, null],
  [10244001, "2093-3", "Cholesterol [Mass/volume] in Serum or Plasma", "CHOLESTEROL TOTAL", "mg/dL", "mg/dL", A, null],
  [10258001, "2085-9", "Cholesterol in HDL [Mass/volume] in Serum or Plasma", "CHOLESTEROL HDL", "mg/dL", "mg/dL", A, null],
  [10259001, "2089-1", "Cholesterol in LDL [Mass/volume] in Serum or Plasma", "CHOLESTEROL LDL", "mg/dL", "mg/dL", A, null],
  [10246001, "2571-8", "Triglyceride [Mass/volume] in Serum or Plasma", "TRIGLISERIDA", "mg/dL", "mg/dL", A, null],
  [10249001, "1920-8", "Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma", "S.G.O.T", "U/L", "U/L", A, null],
  [10250001, "1742-6", "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma", "S.G.P.T", "U/L", "U/L", A, null],
  // ── Malaria (kualitatif) ──
  [10240001, "70569-9", "Plasmodium sp Ag [Identifier] in Blood by Rapid immunoassay", "MALARIA RAPID PV, PF", null, null, A, null],
  [10240005, "32206-5", "Plasmodium sp identified in Blood by Light microscopy", "Malaria (Mikroskopik)", null, null, A, null],
  [10279001, "76772-3", "Plasmodium falciparum Ag [Presence] in Blood by Rapid immunoassay", "Rapid Malaria PF", null, null, A, null],

  // ── Nonaktif / worklist (perlu konfirmasi lab) ──
  [10235003, "6690-2", "Leukocytes [#/volume] in Blood by Automated count", "WBC Anak 3-5 Thn", "10*3/uL", "10*3/uL", X, "Phantom/duplikat WBC (10235002)."],
  [10235005, null, null, "MID", "%", "%", X, "MID% analyzer 3-part — tak ada LOINC standar."],
  [10235006, null, null, "GRA", "%", "%", X, "GRA% (granulosit) analyzer 3-part — tinjau (mis. Neutrophils 770-8)."],
  [10239001, null, null, "ANTI A", null, null, X, "Golongan darah — sebaiknya kirim sbg ABO group (883-9), bukan per-antisera."],
  [10239002, null, null, "ANTI B", null, null, X, "Golongan darah — lihat 10239001."],
  [10239003, null, null, "ANTI AB", null, null, X, "Golongan darah — lihat 10239001."],
  [10239004, null, null, "ANTI D IgG/IgM", null, null, X, "Rh typing (10331-7) — tinjau."],
  [10241001, null, null, "BLOODING TIME BT", null, null, X, "Bleeding time (3068-8); nilai format m'ss."],
  [10242001, null, null, "CLOTHING TIME CT", null, null, X, "Clotting time; kode & format m'ss perlu tinjau."],
  [10266001, null, null, "SALMONELLA TYPHI O", null, null, X, "Titer Widal (1/160) — perlu kode & penanganan titer."],
  [10266002, null, null, "SALMONELLA PARATYPHI AO", null, null, X, "Titer Widal — lihat 10266001."],
  [10266003, null, null, "SALMONELLA PARATYPHI B0", null, null, X, "Titer Widal — lihat 10266001."],
  [10266004, null, null, "SALMONELLA PARATYPHI C", null, null, X, "Titer Widal — lihat 10266001."],
  [10266005, null, null, "SALMONELLA TPHI H", null, null, X, "Titer Widal — lihat 10266001."],
  [10266006, null, null, "SALMONELLA PARATYPHI AH", null, null, X, "Titer Widal — lihat 10266001."],
  [10266007, null, null, "SALMONELLA PARATYPHI BH", null, null, X, "Titer Widal — lihat 10266001."],
  [10266008, null, null, "SALMONELLA PARATYPHI CH", null, null, X, "Titer Widal — lihat 10266001."],
  [10277001, null, null, "HbsAg", null, null, X, "HBsAg (5196-1) kualitatif — tinjau nilai Reaktif/NonReaktif."],
  [10278001, null, null, "Rapid HIV 1 Mer", null, null, X, "HIV Ab rapid (mis. 5221-7) — tinjau kualitatif."],
  [10278002, null, null, "Rapid HIV, Merk 2", null, null, X, "HIV Ab rapid — lihat 10278001."],
  [10278003, null, null, "Rapid HIV, Merk 3", null, null, X, "HIV Ab rapid — lihat 10278001."],
  [10279002, null, null, "Rapid Malaria PLASMODIUM VIVAX", null, null, X, "P. vivax Ag rapid — perlu kode."],
  [10280001, null, null, "Rapid Dengue IgG", null, null, X, "Dengue IgG rapid — perlu kode."],
  [10280002, null, null, "Rapid Dengue IgM", null, null, X, "Dengue IgM rapid — perlu kode."],
  [10281001, null, null, "Rapid Dengue Ns1", null, null, X, "Dengue NS1 Ag rapid — perlu kode."],
  [10291001, null, null, "Gula Darah 2 Jam PP", "mg/dL", "mg/dL", X, "Glukosa 2 jam PP (87422-2? tak ada di kamus) — tinjau."],
];

const conn = await pool.getConnection();
try {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS lab_loinc_map (
      parameter_id  INT          NOT NULL COMMENT 'master.parameter_tindakan_lab.ID (= hasil_lab.PARAMETER_TINDAKAN)',
      loinc_code    VARCHAR(20)  NULL COMMENT 'kode LOINC yang benar (NULL bila worklist)',
      loinc_display VARCHAR(300) NULL COMMENT 'display LOINC',
      param_name    VARCHAR(200) NULL COMMENT 'nama parameter SIMGOS (dokumentasi)',
      ucum_unit     VARCHAR(30)  NULL COMMENT 'satuan tampil (UCUM); NULL=kualitatif',
      ucum_code     VARCHAR(30)  NULL COMMENT 'kode UCUM utk valueQuantity.code',
      active        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=dipakai enrichment; 0=worklist',
      note          VARCHAR(300) NULL,
      created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (parameter_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Idempotent upgrade (tabel lama tanpa kolom UCUM / kode NOT NULL).
  // MySQL tak dukung ADD COLUMN IF NOT EXISTS → cek information_schema dulu.
  const hasCol = async (col) => {
    const r = await conn.query(
      `SELECT COUNT(*) n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lab_loinc_map' AND COLUMN_NAME = ?`,
      [col],
    );
    return Number(r[0].n) > 0;
  };
  if (!(await hasCol("ucum_unit")))
    await conn.query("ALTER TABLE lab_loinc_map ADD COLUMN ucum_unit VARCHAR(30) NULL AFTER param_name");
  if (!(await hasCol("ucum_code")))
    await conn.query("ALTER TABLE lab_loinc_map ADD COLUMN ucum_code VARCHAR(30) NULL AFTER ucum_unit");
  await conn.query("ALTER TABLE lab_loinc_map MODIFY loinc_code VARCHAR(20) NULL");
  await conn.query("ALTER TABLE lab_loinc_map MODIFY loinc_display VARCHAR(300) NULL");
  console.log("tabel lab_loinc_map siap (kolom UCUM ada).");

  for (const [id, code, disp, name, uu, uc, active, note] of SEED) {
    await conn.query(
      `INSERT INTO lab_loinc_map (parameter_id, loinc_code, loinc_display, param_name, ucum_unit, ucum_code, active, note)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         loinc_code=VALUES(loinc_code), loinc_display=VALUES(loinc_display),
         param_name=VALUES(param_name), ucum_unit=VALUES(ucum_unit), ucum_code=VALUES(ucum_code),
         active=VALUES(active), note=VALUES(note)`,
      [id, code, disp, name, uu, uc, active, note],
    );
  }

  const c = await conn.query("SELECT SUM(active=1) aktif, SUM(active=0) nonaktif, COUNT(*) total FROM lab_loinc_map");
  console.log(`upsert selesai. total=${c[0].total} aktif=${c[0].aktif} nonaktif=${c[0].nonaktif}`);
} finally {
  conn.release();
  await pool.end();
}
