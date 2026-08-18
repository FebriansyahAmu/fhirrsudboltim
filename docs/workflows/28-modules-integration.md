# Workflow — Integrasi & Pengiriman 28 Modul IHS

Rencana kerja **modul-by-modul** untuk memetakan, memantau, dan (secara bertahap)
mengirim 28 resource FHIR/IHS dari database SIMGOS `kemkes-ihs` ke Satu Sehat
melalui proyek `fhirrsudboltim`.

> Konteks: lihat [analisis database](../simgos/kemkes-ihs-analysis.md) dan
> [gap vs proyek](../simgos/gap-vs-project.md). Dokumen ini adalah **rencana
> eksekusi**; belum ada kode/pengiriman yang dijalankan.

Status dokumen: **v0.1 — draft rencana** · 18 Agustus 2026.

---

## 0. Prinsip Keamanan (WAJIB dibaca lebih dulu)

> **🔒 SIMGOS = READ-ONLY secara default.** Fase pemetaan & pemantauan
> (Fase 1) **hanya `SELECT`** — nol risiko.
>
> **✍️ Pengiriman (Fase 2) berpotensi menulis ke SIMGOS.** Menandai baris
> "sudah terkirim" dengan menulis balik kolom `id` ke tabel staging SIMGOS
> adalah **operasi tulis**. Sesuai aturan Anda ("ADA PERUBAHAN JIKA SAYA
> MINTA"), langkah ini **hanya** dijalankan setelah persetujuan eksplisit,
> memakai **akun DB ber-izin tulis terpisah**, dan **koordinasi dengan pemilik
> SIMGOS**. Lihat §6 (risiko *double-send*).

---

## 1. Tujuan & Ruang Lingkup

1. **Petakan** ke-28 modul IHS ke dalam proyek kita — satu per satu, bertahap.
2. **Bedakan** data yang **sudah terkirim** vs **belum terkirim** berdasarkan
   pola kolom `id` per tabel (lihat §3).
3. **Kirim** data yang belum terkirim ke Satu Sehat (bertahap, ter-gate).
4. Sediakan **UI monitor** yang memakai ulang dashboard + tabel log yang sudah ada.

Di luar ruang lingkup awal: mengubah logika ETL SIMGOS (procedure/trigger/event)
— itu tetap milik SIMGOS.

---

## 2. Pola Deteksi "Terkirim vs Belum" (inti)

Diverifikasi dari introspeksi read-only. Untuk **setiap** tabel staging:

| Sinyal | Arti |
|---|---|
| `id IS NULL` | **Belum terkirim** ke Satu Sehat |
| `id IS NOT NULL` (`char(36/50)`) | **Sudah terkirim** — `id` = UUID resource Satu Sehat |
| `send = 1` (mayoritas) / `statusRequest = 1` (Patient) | **Siap kirim** (data lengkap, lolos gating trigger) |
| `send = 0` / `statusRequest = 0` | Belum siap (data sumber belum lengkap) |
| `httpRequest = 'GET' \| 'POST'` (Patient) | Resolusi master: `GET` cek eksistensi, `POST` buat baru |
| `get` (Practitioner, ImagingStudy) | Diambil (di-*resolve*), bukan di-POST |

**Query kanonik (read-only):**

```sql
-- Belum terkirim & siap kirim (contoh Encounter)
SELECT * FROM `kemkes-ihs`.encounter
WHERE id IS NULL AND send = 1
ORDER BY refId
LIMIT 100;

-- Sudah terkirim (punya id Satu Sehat)
SELECT refId, id FROM `kemkes-ihs`.encounter
WHERE id IS NOT NULL;

-- Ringkasan per modul
SELECT
  SUM(id IS NOT NULL) AS terkirim,
  SUM(id IS NULL)     AS belum,
  SUM(id IS NULL AND send = 1) AS siap_kirim,
  COUNT(*)            AS total
FROM `kemkes-ihs`.encounter;
```

> **Payload FHIR sudah dibangun oleh trigger SIMGOS.** Kolom `json` pada tiap
> baris (`identifier`, `meta`, `subject`, `code`, …) sudah berisi potongan FHIR
> siap pakai. Pengirim kita cukup **merakit** resource dari kolom-kolom itu
> (`{ resourceType, id?, ...kolomJson }`), **bukan** memetakan ulang dari nol.

---

## 3. Peta 28 Modul — Kolom Kunci (hasil introspeksi)

`id` = penanda terkirim · `refId`/`tableId` = kunci sumber · flag = kesiapan.

| Modul | Tabel staging | `id` (penanda kirim) | PK / refId | Flag kesiapan |
|---|---|---|---|---|
| Organization | `organization` | `char(36)` NULL | refId | send |
| Location | `location` | `char(36)` NULL | refId | send |
| Patient | `patient` | `char(36)` NULL | refId | httpRequest(GET/POST), statusRequest |
| Practitioner | `practitioner` | `char(36)` NULL | refId | get |
| Encounter | `encounter` | `char(36)` NULL | refId | send |
| EpisodeOfCare | `eof` | `char(36)` NULL | refId | nopen, send |
| Consent | `consent` | `char(36)` NULL | refId | send |
| Condition | `condition` | `char(36)` NULL | refId | nopen, send |
| Observation | `observation` | `char(50)` NULL | refId, jenis | nopen, send |
| ClinicalImpression | `clinical_impression_anamnesis` | `char(40)` NULL | refId | nopen, send |
| Procedure | `procedure` | `char(36)` NULL | refId | nopen, send |
| AllergyIntolerance | `allergy_intolerance` | `char(36)` NULL | refId | nopen, send |
| DiagnosticReport | `diagnostic_report` | `char(36)` NULL | refId | nopen, send |
| Specimen | `specimen` | `char(36)` NULL | refId | nopen, send |
| ServiceRequest | `service_request` | `char(36)` NULL | refId | nopen, send |
| CarePlan | `care_plan` | `varchar(50)` NULL | refId, jenis, nopen | send |
| Goal | `goal_asuhan_keperawatan` | `char(36)` NULL | refId | nopen, send |
| QuestionnaireResponse | `questionnaire_response` | `char(36)` NULL | refId | nopen, send |
| Composition | `composition` | `char(36)` NULL | refId | nopen, send |
| Medication | `medication` | `char(36)` NULL | refId, barang, group_racikan | nopen, send |
| MedicationRequest | `medication_request` | `char(36)` NULL | refId, barang, group_racikan | nopen, send |
| MedicationDispense | `medication_dispanse` | `char(36)` NULL | refId, barang, group_racikan | nopen, send |
| MedicationStatement | `medication_statement` | `char(36)` NULL | refId, barang, group_racikan | nopen, send |
| Coverage | `coverage` | `char(36)` NULL | tableId | send |
| Account | `account` | `char(36)` NULL | tableId | send |
| ChargeItem | `charge_item` | `char(36)` NULL | tableId | nopen, send |
| Invoice | `invoice` | `char(36)` NULL | tableId | nopen, send |
| ImagingStudy | `imaging_study` | `char(36)` NULL | refId | nopen, get |

> Sebagian modul punya tabel varian (mis. Observation: `observation_*`;
> Condition: `keluhan_utama_condition`, `condition_*`; ServiceRequest:
> `service_request_*`). Varian ditangani pada tahap masing-masing modul.

---

## 4. Urutan Eksekusi Berdasarkan Dependensi (7 fase)

Resource yang direferensikan harus punya `id` **lebih dulu**. Urutan ini mengikuti
pola SIMGOS (master → transaksi):

```
FASE A · Master/Prasyarat   →  Organization · Location · Practitioner · Patient
FASE B · Kunjungan          →  Encounter · EpisodeOfCare · Consent
FASE C · Klinis             →  Condition · Observation · ClinicalImpression ·
                               Procedure · AllergyIntolerance · Specimen · DiagnosticReport
FASE D · Perencanaan/Rawat  →  ServiceRequest · CarePlan · Goal ·
                               QuestionnaireResponse · Composition
FASE E · Obat               →  Medication · MedicationRequest ·
                               MedicationDispense · MedicationStatement
FASE F · Pembiayaan         →  Coverage · Account · ChargeItem · Invoice
FASE G · Imaging            →  ImagingStudy   (id berasal dari webhook DICOM Router)
```

Alasan singkat: Encounter mereferensikan Patient/Practitioner/Location/Organization;
resource klinis mereferensikan Encounter+Patient; DiagnosticReport mereferensikan
Observation/Specimen; Account mereferensikan Coverage; ImagingStudy bergantung pada
`image_id_from_webhook`.

---

## 5. Arsitektur Target di Proyek Kita

```
┌─────────────────────────────────────────────────────────────┐
│ fhirrsudboltim (Next.js)                                     │
│                                                              │
│  lib/db/simgos.ts   ── koneksi READ-ONLY ke `kemkes-ihs`     │
│        │              (SELECT saja; akun read-only khusus)   │
│        ▼                                                     │
│  lib/ihs/registry.ts ── spec 28 modul:                       │
│        { module, table, idCol, refId, readyFlag,             │
│          resourceType, endpoint, deps[] }                    │
│        │                                                     │
│        ├──▶ /ihs/monitor (UI)  ── ringkasan terkirim/belum   │
│        │        per modul + drill-down baris + payload JSON  │
│        │                                                     │
│        └──▶ (Fase 2, ter-gate) Pengirim:                     │
│               baca baris siap → rakit FHIR → POST via         │
│               /api/fhir/[resource] (OAuth + delivery_logs)   │
│               → catat hasil (id) di LEDGER / SIMGOS*          │
└─────────────────────────────────────────────────────────────┘
   * penulisan id ke SIMGOS = ter-gate (lihat §0 & §6)
```

Komponen baru yang direncanakan:

- `lib/db/simgos.ts` — klien MariaDB/MySQL **read-only** (env `DATABASE_URL_SIMGOS`),
  terpisah dari Prisma utama. Hanya `SELECT`.
- `lib/ihs/registry.ts` — registry 28 modul (satu sumber kebenaran spec).
- Halaman **`/ihs/monitor`** — memakai ulang pola dashboard: kartu status per modul
  (terkirim/belum/siap), tabel drill-down, preview payload.
- (Fase 2) **Ledger** `ihs_sync_ledger` di DB kita (`fhir_satusehat`) untuk mencatat
  `module, refId, satuSehatId, sentAt, status` **tanpa** menulis ke SIMGOS —
  atau, bila disetujui, **write-back `id`** ke tabel staging SIMGOS.

---

## 6. Fase 2 — Pengiriman: Risiko & Keputusan

Menandai "terkirim" secara benar mengharuskan `id` tersimpan. Ada dua model:

| Model | Tulis ke SIMGOS? | Kelebihan | Kekurangan |
|---|---|---|---|
| **A. Ledger di DB kita** | ❌ Tidak (SIMGOS tetap read-only) | Aman, sesuai mandat | `id` di SIMGOS tetap NULL → `dashboardPengiriman` SIMGOS tak sinkron; worker SIMGOS bisa kirim ulang |
| **B. Write-back `id` ke SIMGOS** | ✅ Ya (ter-gate) | Konsisten dgn desain SIMGOS; cegah kirim ulang | Perlu izin tulis + koordinasi; risiko bentrok |

**⚠️ Risiko *double-send*.** SIMGOS punya event scheduler + (kemungkinan) pengirim
eksternalnya sendiri. Jika keduanya aktif bersamaan dengan pengirim kita, satu
resource bisa terkirim **dua kali** ke Satu Sehat. **Wajib** dipastikan: hanya
**satu** pengirim aktif per modul. Opsi:

1. Proyek kita **hanya memantau** (Fase 1) — pengiriman tetap milik SIMGOS.
2. Proyek kita **menggantikan** pengirim SIMGOS untuk modul tertentu (SIMGOS
   mematikan pengirimannya untuk modul itu) → butuh Model B + koordinasi.
3. Mode **manual/terkurasi**: operator memilih baris tertentu untuk dikirim ulang
   (mis. yang gagal), bukan pengiriman massal otomatis.

**Idempotensi & keamanan pengiriman (apa pun modelnya):**
- Kunci per resource pakai `refId` (+ komposit) agar tidak dobel dalam satu proses.
- Untuk master (Patient), hormati `httpRequest` `GET` (cek dulu) sebelum `POST`.
- Hormati urutan dependensi (§4) — jangan kirim Encounter sebelum Patient punya `id`.
- Batasi rate + catat semua ke `delivery_logs` (sudah ada).
- Terapkan RBAC (lihat [GAP-ANALYSIS G1](../GAP-ANALYSIS.md)) — hanya peran berwenang boleh mengirim.

---

## 7. Alur Kerja per Modul (template — diulang 28x)

Setiap modul melewati langkah baku berikut:

1. **Verifikasi skema** tabel staging (read-only): konfirmasi `id`, `refId`,
   flag kesiapan, kolom JSON, `nopen`, dependensi.
2. **Daftarkan spec** di `lib/ihs/registry.ts` (module, table, idCol, refId,
   readyFlag, resourceType, endpoint, deps).
3. **Query monitor** (read-only): hitung `terkirim / belum / siap` + drill-down.
4. **Rakit payload** FHIR dari kolom JSON staging → validasi bentuk (`resourceType`
   cocok, ukuran ≤ 1 MB) memakai util yang sudah ada.
5. **(Gate) Uji kirim** 1 baris ke Satu Sehat via `/api/fhir/[resource]`
   (lingkungan staging dulu bila memungkinkan).
6. **(Gate) Catat hasil**: simpan `id` ke ledger (Model A) atau write-back ke
   SIMGOS (Model B, bila disetujui).
7. **Validasi & tandai `Live`** pada tracker (§8).

**Definition of Done per modul:** spec terdaftar · monitor menampilkan angka
akurat · payload valid untuk ≥ 1 sampel · jalur kirim teruji di staging ·
keputusan Model A/B tercatat.

---

## 8. Tracker Progres (diperbarui tiap langkah)

Legenda status: `⬜ Belum` · `🟨 Dipetakan` · `🟦 Dimonitor` · `🟩 Live`.

| Fase | Modul | FHIR/Endpoint | Overlap modul UI kita | Status |
|---|---|---|---|:--:|
| A | Organization | `Organization` | ✅ ada | ⬜ |
| A | Location | `Location` | ✅ ada | ⬜ |
| A | Practitioner | `Practitioner` | ✅ ada | ⬜ |
| A | Patient | `Patient` | ✅ ada | ⬜ |
| B | Encounter | `Encounter` | ✅ ada | ⬜ |
| B | EpisodeOfCare | `EpisodeOfCare` | ✅ ada | ⬜ |
| B | Consent | `Consent` | ❌ baru | ⬜ |
| C | Condition | `Condition` | ⚠️ tanpa halaman | ⬜ |
| C | Observation | `Observation` | ⚠️ tanpa halaman | ⬜ |
| C | ClinicalImpression | `ClinicalImpression` | ✅ ada | ⬜ |
| C | Procedure | `Procedure` | ⚠️ tanpa halaman | ⬜ |
| C | AllergyIntolerance | `AllergyIntolerance` | ✅ ada | ⬜ |
| C | Specimen | `Specimen` | ❌ baru | ⬜ |
| C | DiagnosticReport | `DiagnosticReport` | ⚠️ Soon | ⬜ |
| D | ServiceRequest | `ServiceRequest` | ✅ ada | ⬜ |
| D | CarePlan | `CarePlan` | ✅ ada | ⬜ |
| D | Goal | `Goal` | ❌ baru | ⬜ |
| D | QuestionnaireResponse | `QuestionnaireResponse` | ✅ ada | ⬜ |
| D | Composition | `Composition` | ❌ baru | ⬜ |
| E | Medication | `Medication` | ❌ baru | ⬜ |
| E | MedicationRequest | `MedicationRequest` | ⚠️ Beta tanpa halaman | ⬜ |
| E | MedicationDispense | `MedicationDispense` | ❌ baru | ⬜ |
| E | MedicationStatement | `MedicationStatement` | ❌ baru | ⬜ |
| F | Coverage | `Coverage` | ❌ baru | ⬜ |
| F | Account | `Account` | ❌ baru | ⬜ |
| F | ChargeItem | `ChargeItem` | ❌ baru | ⬜ |
| F | Invoice | `Invoice` | ❌ baru | ⬜ |
| G | ImagingStudy | `ImagingStudy` | ✅ ada | ⬜ |

---

## 9. Milestone

- **M1 — Fondasi (read-only):** `lib/db/simgos.ts` + `lib/ihs/registry.ts`
  (Fase A) + halaman `/ihs/monitor` yang menampilkan terkirim/belum untuk 4 modul
  master. **Nol tulis ke SIMGOS.**
- **M2 — Cakupan monitor penuh:** semua 28 modul tampil di monitor (read-only).
- **M3 — Uji kirim ter-gate:** kirim sampel di staging untuk Fase A–B, dengan
  Model A/B yang sudah diputuskan.
- **M4 — Rollout bertahap:** aktifkan pengiriman per fase sesuai keputusan §6.

---

## 10. Keputusan Terbuka (butuh input Anda)

1. **Peran pengiriman (§6):** proyek kita **hanya monitor**, **menggantikan**
   pengirim SIMGOS, atau **manual/terkurasi**?
2. **Model status terkirim:** **A** (ledger di DB kita, SIMGOS tetap read-only)
   atau **B** (write-back `id` ke SIMGOS, ter-gate + izin tulis)?
3. **Pengirim SIMGOS saat ini:** apakah ada worker eksternal SIMGOS yang aktif
   mengirim? (menentukan risiko double-send)
4. **Lingkungan uji:** boleh pakai Satu Sehat **staging** untuk uji kirim
   sebelum production? (`.env` punya URL staging yang dikomentari)
5. **Akun DB read-only khusus** untuk `kemkes-ihs` — setuju dibuatkan DBA SIMGOS?
6. **Modul awal** untuk M1 — mulai dari Fase A (Organization/Location/Practitioner/
   Patient), atau modul spesifik lain?

> Setelah keputusan #1–#2 dibuat, langkah aman pertama tetap sama: bangun
> **M1 (read-only monitor)** — tidak menunggu keputusan pengiriman.
