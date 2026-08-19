-- ─────────────────────────────────────────────────────────────
-- init.sql
-- Jalankan query ini di MySQL / MariaDB sebelum prisma db pull
--
-- Urutan eksekusi:
--   1. Buat database (atau gunakan yang sudah ada)
--   2. Jalankan file ini: mysql -u root -p < prisma/sql/init.sql
--   3. npx prisma db pull
--   4. npx prisma generate
-- ─────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS fhir_satusehat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE fhir_satusehat;

-- ─────────────────────────────────────────────
-- Tabel: users
-- Akun operator dashboard
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         CHAR(36)     NOT NULL,
  username   VARCHAR(100) NOT NULL,
  password   VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
  role       VARCHAR(20)  NOT NULL DEFAULT 'operator' COMMENT 'operator | admin',
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- Tabel: delivery_logs
-- Riwayat pengiriman payload FHIR ke Satu Sehat
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_logs (
  id            CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,

  method        VARCHAR(10)  NOT NULL COMMENT 'GET | POST | PUT | PATCH',
  resource_type VARCHAR(100) NOT NULL COMMENT 'CarePlan | AllergyIntolerance | dst',
  resource_id   CHAR(36)     NULL     COMMENT 'UUID resource, NULL jika bukan operasi by ID',
  endpoint      VARCHAR(500) NOT NULL COMMENT 'Full URL yang dikirim ke Satu Sehat',

  status_code   SMALLINT     NOT NULL COMMENT 'HTTP status code response',
  status        VARCHAR(10)  NOT NULL COMMENT 'success | error | pending',
  time_ms       INT          NOT NULL COMMENT 'Durasi request dalam milidetik',

  payload       JSON         NOT NULL COMMENT 'Body yang dikirim ke Satu Sehat',
  response      JSON         NOT NULL COMMENT 'Response dari Satu Sehat',

  sent_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  CONSTRAINT fk_delivery_logs_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  INDEX idx_delivery_logs_user_id    (user_id),
  INDEX idx_delivery_logs_resource   (resource_type),
  INDEX idx_delivery_logs_sent_at    (sent_at),
  INDEX idx_delivery_logs_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- Tabel: satu_sehat_tokens
-- Cache OAuth2 access token ke Satu Sehat
-- Hanya satu baris aktif (id = 1, di-upsert)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS satu_sehat_tokens (
  id         TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token      TEXT             NOT NULL COMMENT 'Bearer token dari Satu Sehat',
  expires_at DATETIME(3)      NOT NULL COMMENT 'Waktu expired token',
  created_at DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────
-- Tabel: ihs_row_notes
-- Anotasi operator (catatan + penanda warna) per baris data SIMGOS,
-- per modul IHS. Contoh guna: menandai pasien yang sudah dikirim tetapi
-- tetap tanpa id Satu Sehat (mis. NIK salah / duplicate).
-- Ini DB kita sendiri (fhir_satusehat) — boleh di-write.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ihs_row_notes (
  id         CHAR(36)     NOT NULL,
  module     VARCHAR(50)  NOT NULL COMMENT 'slug modul IHS, mis. patient',
  ref_key    VARCHAR(64)  NOT NULL COMMENT 'kunci baris sumber SIMGOS (mis. NORM/refId)',
  nik        VARCHAR(32)  NULL     COMMENT 'NIK/identitas untuk referensi (opsional)',
  mark       VARCHAR(20)  NULL     COMMENT 'penanda warna: merah|kuning|hijau|biru',
  note       TEXT         NULL     COMMENT 'catatan operator',
  created_by CHAR(36)     NOT NULL COMMENT 'user id pembuat/pengubah',
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  UNIQUE KEY uq_ihs_row_notes_module_ref (module, ref_key),
  INDEX idx_ihs_row_notes_module (module),
  INDEX idx_ihs_row_notes_mark (mark),
  CONSTRAINT fk_ihs_row_notes_user
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
