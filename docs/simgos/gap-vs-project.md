# Gap Analysis — SIMGOS `kemkes-ihs` vs Proyek `fhirrsudboltim`

> **🔒 HIGH ALERT — READ ONLY.** Database SIMGOS diperlakukan **hanya-baca**.
> Dokumen ini menganalisis dan **mengusulkan** arah integrasi; **tidak ada**
> perubahan yang dibuat di SIMGOS. Opsi apa pun yang **menulis** ke SIMGOS
> (mis. menulis balik `id`, insert ke outbox) **belum diizinkan** dan
> memerlukan persetujuan eksplisit + kredensial khusus.

Referensi teknis database ada di [`kemkes-ihs-analysis.md`](./kemkes-ihs-analysis.md).

---

## 1. Ringkasan: Dua Pendekatan untuk Masalah yang Sama

Keduanya bertujuan mengirim data **FHIR R4 ke Satu Sehat Kemenkes RI**, tetapi
sangat berbeda cara kerjanya:

| Aspek | **SIMGOS `kemkes-ihs`** | **Proyek `fhirrsudboltim`** |
|---|---|---|
| Paradigma | ETL **di dalam database** (procedure/function/trigger/event) | **Aplikasi web** Next.js + API proxy |
| Pemicu | **Otomatis** (event scheduler, 3 dtk–2 mnt) | **Manual** (operator mengisi form per resource) |
| Sumber data | Langsung dari DB operasional SIMRS | Input ulang manual / raw JSON |
| Cakupan resource | ~20 resource + klinis dalam (lab, rad, obat, TTV, skor risiko, care plan, consent, coverage, account, charge item, specimen, composition, goal, EoC, imaging) | Subset dgn halaman: Patient, Encounter, Location, Organization, Practitioner, CarePlan, ClinicalImpression, AllergyIntolerance, ServiceRequest, EpisodeOfCare, QuestionnaireResponse, ImagingStudy (+ beberapa `hasPage:false`) |
| Pembangunan JSON FHIR | Trigger SQL + `get*()` | Skema Yup + builder TypeScript |
| Terminologi (LOINC/SNOMED/ICD) | **Tabel DB** (`loinc_terminologi`, `snomed_ct`, `code_reference`, …) | **Hardcode/preset** di komponen form |
| Manajemen `id`/referensi | `id` disimpan di staging → referensi antar-resource ter-resolve | Tidak dipersistensi; tiap request berdiri sendiri |
| Pengiriman HTTP | **Worker eksternal** membaca staging → POST → tulis balik `id` | App proxy POST langsung → catat `delivery_logs` |
| Monitoring | `dashboardPengiriman` (id terisi vs NULL) + status `logs.outbox` | `delivery_logs` + statistik dashboard |
| Sinkronisasi inkremental | Watermark (`sinkronisasi`) + outbox (`SKIP LOCKED`) | Tidak ada (stateless per request) |
| Idempotensi | `ON DUPLICATE KEY UPDATE` + `refId` PK | Tidak eksplisit |
| OAuth2 Satu Sehat | Ditangani pengirim eksternal | `token.dal` (client_credentials, cache) |

**Kesimpulan inti:** SIMGOS **sudah memiliki** pipeline Satu Sehat yang lengkap
dan otomatis. Proyek kita **beririsan** dengannya tetapi bersifat manual dan
lebih sempit. Maka pertanyaan strategis untuk v2.0.0 bukan "bagaimana menyaingi",
melainkan **"peran apa yang paling bernilai untuk proyek kita di samping pipeline
SIMGOS yang sudah ada?"**

---

## 2. Analisis Irisan (Overlap)

- **Resource yang di-*generate* SIMGOS tapi juga punya form manual di proyek kita:**
  Patient, Encounter, Location, Organization, Practitioner, ServiceRequest,
  AllergyIntolerance, ClinicalImpression, CarePlan, EpisodeOfCare,
  QuestionnaireResponse, ImagingStudy.
  → **Fungsi manual kita berpotensi redundan** untuk alur normal (SIMGOS sudah
  otomatis), tetapi **berguna sebagai alat koreksi/kirim-ulang** untuk kasus
  yang gagal *gating* di SIMGOS (`send=0`/`statusRequest=0`).

- **Yang HANYA dimiliki SIMGOS (belum ada di proyek kita):**
  Condition, Observation (TTV, nyeri, nutrisi, faktor risiko, skor Morse/Humpty
  Dumpty/GRACE/EPFRA), MedicationRequest/Dispense/Statement, DiagnosticReport,
  Procedure, Composition (resume/edukasi), Consent, Coverage, Account,
  ChargeItem, Invoice, Specimen, Goal.

- **Yang menonjol di proyek kita (bernilai tambah nyata):**
  Utilitas DICOM (JPG→DICOM, patch ACSN, kirim ke DICOM Router via `storescu`,
  C-ECHO), autentikasi operator + RBAC, UI/observability yang ramah pengguna.
  SIMGOS hanya menerima **webhook** image-ID dari DICOM Router
  (`image_id_from_webhook`) — jalur *upload* citra ada di sisi kita.

---

## 3. Gap pada Proyek Kita (relatif terhadap SIMGOS)

| # | Gap | Catatan |
|---|---|---|
| S1 | **Tidak ada sumber kebenaran FHIR yang dipersistensi** | Kita hanya punya `delivery_logs`. SIMGOS punya tabel staging + `id` untuk resolusi referensi antar-resource. |
| S2 | **Terminologi hardcode** vs tabel DB SIMGOS | Preset LOINC/SNOMED/ICD di form berpotensi *drift* dari `loinc_terminologi`/`code_reference` SIMGOS. |
| S3 | **Validasi UUID v4 terlalu ketat** | `isValidUUID` (v4) dapat menolak `id` Satu Sehat yang disimpan SIMGOS sebagai `char(36/50)` tanpa asumsi versi. Menguatkan gap **G5** di [`../GAP-ANALYSIS.md`](../GAP-ANALYSIS.md). |
| S4 | **Tidak ada sinkronisasi inkremental/idempotensi** | Tidak ada watermark/outbox; risiko kirim ganda tanpa `refId`/upsert. |
| S5 | **Cakupan resource jauh lebih sempit** | Banyak resource klinis & billing belum ada. |
| S6 | **Belum ada konektivitas multi-database** | Proyek baru terhubung ke DB sendiri; perlu koneksi **read-only** ke SIMGOS (lihat §5). |

---

## 4. Rekomendasi Arah v2.0.0 — 3 Opsi Peran

### Opsi A — **Observability / Control Tower (READ-ONLY, paling aman) ✅ direkomendasikan sebagai langkah pertama**

Jadikan proyek kita **dashboard pemantau pipeline SIMGOS** — tanpa menyentuh
data. Membaca (read-only) tabel staging + `logs.outbox` untuk menampilkan:

- Ringkasan `dashboardPengiriman` (per resource: terkirim vs pending) dengan filter tanggal.
- Backlog & kegagalan: baris `id IS NULL AND send=1` (siap tapi belum terkirim),
  `statusRequest=0`/`send=0` (gagal gating kelengkapan data), outbox `PENDING`/`PROCESSING` menumpuk.
- Lag watermark (`sinkronisasi.TANGGAL_TERAKHIR` vs sekarang) & status event.
- Drill-down payload FHIR yang sudah dibangun trigger (kolom JSON) untuk audit/QA.

**Nilai:** langsung berguna, **nol risiko** (murni `SELECT`), memakai ulang UI
dashboard + tabel log yang sudah ada. Ini cocok dengan instruksi read-only.

### Opsi B — **Alat Koreksi & Kirim-Ulang (butuh izin tulis terbatas)**

UI untuk operator menindak resource yang gagal: lihat alasan gagal, perbaiki data
sumber, dan **memicu kirim ulang**. Ini **menulis** (mis. reset flag / re-enqueue
outbox / update baris staging) → **memerlukan persetujuan eksplisit** dan idealnya
lewat *stored procedure* resmi SIMGOS, bukan UPDATE langsung.

### Opsi C — **Menjadi Pengirim Eksternal (butuh izin tulis penuh)**

Proyek kita mengambil peran "worker pengirim": baca staging → POST ke Satu Sehat
(memakai `token.dal` + `fhir.dal` + `delivery_logs` yang sudah ada) → **tulis balik
`id`**. Secara teknis paling pas dengan arsitektur kita, **tetapi** menulis ke
SIMGOS dan berpotensi bertabrakan dengan worker SIMGOS yang sudah ada →
**perlu kajian & persetujuan matang** agar tidak double-send.

> **Batas keamanan:** Sesuai instruksi, **default kita adalah Opsi A (read-only)**.
> Opsi B/C hanya dijalankan bila Anda memintanya secara eksplisit, dengan akun DB
> ber-izin tulis yang terpisah dan koordinasi dengan pemilik SIMGOS.

---

## 5. Pendekatan Teknis: Koneksi Multi-Database (Read-Only)

Untuk Opsi A, tambahkan **sumber data kedua** ke proyek, terpisah dari DB milik
kita:

- **Variabel env:** `DATABASE_URL_SIMGOS` (sudah tersedia). Jangan gunakan untuk
  Prisma utama kita.
- **Klien terpisah, khusus baca:** gunakan koneksi `mariadb`/`mysql2` read-only
  (mis. modul `lib/db/simgos.ts`) — **bukan** menyatukan schema `kemkes-ihs`
  ke `schema.prisma` kita. Query cukup `SELECT` ke `` `kemkes-ihs` `` dan
  `` `logs`.outbox ``.
- **Akun DB read-only khusus:** minta DBA SIMGOS membuat user dengan **hanya
  `SELECT`** pada `kemkes-ihs` (dan tabel yang diperlukan). Akun `admin@%` saat
  ini terlalu berkuasa untuk dipakai aplikasi. **Pertahanan berlapis:** meski
  begitu, kode kita tetap hanya mengeluarkan `SELECT`.
- **Keamanan jaringan:** host `10.202.1.5` adalah IP internal — pastikan
  runtime aplikasi berada di jaringan yang sama / lewat VPN.
- **Isolasi:** query SIMGOS harus `read-only`, dengan timeout & `LIMIT` wajar,
  dan **tidak pernah** menampilkan PHI mentah ke pihak tak berwenang (terapkan
  RBAC — lihat **G1** di [`../GAP-ANALYSIS.md`](../GAP-ANALYSIS.md)).

---

## 6. Yang Perlu Diputuskan (butuh input Anda)

1. **Peran proyek untuk v2.0.0:** Opsi **A** (observability read-only,
   direkomendasikan) / **B** (koreksi-kirim ulang) / **C** (pengirim eksternal)?
2. **Akun read-only khusus:** setuju meminta DBA SIMGOS membuat user `SELECT`-only
   untuk `kemkes-ihs`?
3. **Prioritas resource** untuk ditampilkan/ditangani lebih dulu (mis. Encounter,
   Observation TTV, ServiceRequest)?
4. **Batas PHI:** kebijakan menampilkan data pasien dari SIMGOS di UI kita
   (masking NIK, dsb.).

> Setelah Anda memilih (kemungkinan Opsi A), langkah teknis pertama yang aman:
> tambah `lib/db/simgos.ts` (read-only) + satu halaman "SIMGOS Monitor" yang
> memanggil `dashboardPengiriman` dan menampilkan backlog — **semua `SELECT`**.

---

## 7. Konfirmasi Read-Only

Selama analisis ini, operasi terhadap SIMGOS **hanya**: `SHOW DATABASES`,
`SELECT` dari `information_schema` (ROUTINES, PARAMETERS, TABLES, COLUMNS,
TRIGGERS, EVENTS, VIEWS), dan pembacaan definisi. **Tidak ada** `INSERT`,
`UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, atau `CALL` procedure yang
mengubah data. Tidak ada baris yang ditulis atau diubah.
