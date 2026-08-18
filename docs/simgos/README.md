# SIMGOS Integration Analysis

Analisis database **SIMGOS (SIMRS)** — fokus pada database **`kemkes-ihs`**,
mesin integrasi Satu Sehat/IHS milik SIMGOS — beserta perbandingannya dengan
proyek `fhirrsudboltim`.

> **🔒 HIGH ALERT — READ ONLY.** Database SIMGOS **hanya-baca**. Tidak ada
> perubahan yang dibuat, dan tidak akan dibuat tanpa permintaan eksplisit +
> kredensial ber-izin tulis yang terpisah.

## Dokumen

| Dokumen | Isi |
|---|---|
| [`kemkes-ihs-analysis.md`](./kemkes-ihs-analysis.md) | Analisis teknis database `kemkes-ihs`: arsitektur ETL in-database, 22 functions, 58 procedures, 74 tabel staging, 97 triggers, 9 event scheduler, terminologi, alur data & pengiriman. |
| [`gap-vs-project.md`](./gap-vs-project.md) | Perbandingan SIMGOS vs `fhirrsudboltim`, gap proyek kita, dan 3 opsi peran untuk v2.0.0 + pendekatan koneksi multi-database read-only. |

## Temuan Utama (TL;DR)

- `kemkes-ihs` **sudah** menjalankan pipeline Satu Sehat penuh & otomatis
  langsung dari database (event tiap 3 detik–2 menit).
- Payload FHIR dibangun oleh **trigger SQL + function `get*()`**, di-*stage* di
  tabel berbentuk resource, lalu dikirim oleh **worker eksternal** yang menulis
  balik `id` (UUID Satu Sehat). Pengiriman HTTP **tidak** di dalam DB.
- Dua generasi sinkronisasi: **watermark** (`sinkronisasi`) dan **outbox**
  (`logs.outbox`, `FOR UPDATE SKIP LOCKED`).
- Peran paling aman & bernilai untuk proyek kita: **control tower / observability
  read-only** atas pipeline SIMGOS (Opsi A) — memanfaatkan ulang dashboard &
  tabel log yang sudah ada.

Koneksi: MySQL `8.0.46` @ `10.202.1.5:3306`, env `DATABASE_URL_SIMGOS`.
