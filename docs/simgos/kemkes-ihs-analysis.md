# Analisis Database SIMGOS — `kemkes-ihs`

> **🔒 HIGH ALERT — READ ONLY.** Seluruh analisis ini dibuat **hanya dengan
> query baca** (`SELECT` / `information_schema`) terhadap database SIMGOS. **Tidak
> ada** perubahan apa pun (tidak ada `INSERT/UPDATE/DELETE/DDL`) yang dilakukan,
> dan tidak akan dilakukan tanpa permintaan eksplisit. Setiap rencana integrasi
> yang menulis ke SIMGOS harus disetujui lebih dulu.

- **Server:** MySQL `8.0.46` @ `10.202.1.5:3306` (jaringan internal)
- **Schema fokus:** `` `kemkes-ihs` `` (nama mengandung tanda hubung → selalu di-*backtick*)
- **Akun koneksi saat ini:** `admin@%` (akun bersama — lihat rekomendasi user read-only khusus di [`gap-vs-project.md`](./gap-vs-project.md))
- **Tanggal analisis:** 18 Agustus 2026

---

## 1. Apa itu `kemkes-ihs`?

`kemkes-ihs` adalah **mesin integrasi Satu Sehat (IHS) milik SIMGOS yang
diimplementasikan sepenuhnya di dalam database** (SIMRS = SIMGOS). Alih-alih
aplikasi terpisah, SIMGOS menjalankan seluruh proses ETL FHIR memakai
**stored procedure, function, trigger, dan event scheduler MySQL**.

Perannya identik dengan tujuan proyek kita (mengirim data FHIR R4 ke Satu Sehat),
tetapi pendekatannya berbeda total: **otomatis, berbasis database, dan
berjalan terus-menerus** langsung dari data operasional SIMRS.

### Inventaris objek

| Objek | Jumlah |
|---|---:|
| Functions | 22 |
| Procedures | 58 |
| Tables (staging + referensi) | 74 |
| Triggers | 97 |
| Events (scheduler) | 9 |
| Views | 0 |

Sumber data dibaca dari database SIMGOS lain di server yang sama, mis.:
`pendaftaran`, `master`, `medicalrecord`, `pegawai`, `layanan`, `aplikasi`,
`logs` (outbox), dll.

---

## 2. Model Data — Tabel Staging FHIR

Sebagian besar dari 74 tabel adalah **tabel staging berbentuk resource FHIR**
(mis. `patient`, `encounter`, `condition`, `observation`, `medication_request`,
`service_request`, `diagnostic_report`, `care_plan`, `procedure`, `consent`,
`coverage`, `account`, `charge_item`, `specimen`, `composition`, `eof`,
`imaging_study`, dll.). Sisanya adalah **tabel referensi/terminologi** (§7).

Pola kolom yang konsisten pada tabel staging:

| Kolom | Makna |
|---|---|
| `id` (`char(36/50)`, **nullable**) | **UUID resource dari Satu Sehat**. `NULL` = belum terkirim; terisi = sudah dibuat di Satu Sehat. |
| `refId` (PK) | Kunci referensi ke record sumber SIMGOS (mis. `NORM` pasien, `NOMOR` pendaftaran, ID tindakan). |
| kolom FHIR (`json`) | `identifier`, `meta`, `subject`, `code`, `category`, `valueQuantity`, dll. — potongan payload FHIR. |
| `nopen` | Nomor pendaftaran (untuk resource transaksi, dipakai filter tanggal). |
| `send` / `statusRequest` | Flag kesiapan kirim (di-set trigger bila data lengkap). |
| `httpRequest` (`ENUM('GET','POST')`) | Pada master data (mis. `patient`): `GET` = cek eksistensi di Satu Sehat (mis. Patient by NIK), `POST` = buat baru. |
| `sendDate` / `getDate` (`timestamp on update`) | Waktu perubahan terakhir. |

> **Siklus hidup baris:** skeleton (hanya `refId`) → trigger membangun JSON +
> menandai `send`/`statusRequest` → **pengirim eksternal** POST ke Satu Sehat &
> menulis balik `id` → resource lain dapat mereferensikan `id` tersebut.

Contoh (kolom nyata) tabel `patient` & `encounter`:

```
patient:   id char(36) | identifier json | active | address json | birthDate |
           name json | telecom json | ... | refId(PK)=NORM | nik varchar(16) |
           httpRequest ENUM('GET','POST') | statusRequest tinyint
encounter: id char(36) | class json | subject json | participant json |
           period json | location json | statusHistory json | serviceProvider json |
           episodeOfCare json | ... | refId(PK)=NOMOR pendaftaran | send tinyint
```

---

## 3. Arsitektur & Alur Data

```
              ┌───────────────────────── MySQL EVENT SCHEDULER ─────────────────────────┐
              │  autoExecuteIhsMaster (2 mnt)      autoExecuteIhsTransaction (2 mnt)     │
              │  evt_sync_* (3–10 detik)                                                 │
              └───────────────┬───────────────────────────────┬─────────────────────────┘
                              │                                │
        ┌─────────────────────▼──────────┐        ┌────────────▼───────────────────────┐
        │ GEN-1: BATCH (watermark)        │        │ GEN-2: OUTBOX (near real-time)      │
        │ Procedure *To* + cursor         │        │ sp_sync_* membaca `logs`.outbox     │
        │ filter TANGGAL > sinkronisasi   │        │ FOR UPDATE SKIP LOCKED (batch 50)   │
        │ LIMIT 100, advance watermark    │        │ PENDING→PROCESSING→SUCCESS          │
        └─────────────────┬───────────────┘        └───────────────┬─────────────────────┘
                          │  INSERT/UPSERT skeleton/rows           │
                          ▼                                        ▼
        ┌──────────────────────────── TABEL STAGING FHIR ──────────────────────────────┐
        │ patient, encounter, condition, observation, medication_request, ...           │
        │  ── BEFORE INSERT/UPDATE TRIGGER (97 buah) membangun JSON via get*() +         │
        │     tabel terminologi; set send/statusRequest bila data lengkap               │
        │  ── AFTER trigger merantai proses lanjutan (mis. encounter→coverage/account)   │
        └───────────────────────────────────┬───────────────────────────────────────────┘
                                             │  baris dengan id IS NULL & send=1
                                             ▼
                        ┌────────────────────────────────────────────┐
                        │  PENGIRIM EKSTERNAL (di luar database)       │
                        │  baca staging → POST ke Satu Sehat (OAuth2)  │
                        │  → tulis balik `id` (UUID resource)          │
                        └────────────────────────────────────────────┘
                                             │
                                             ▼   monitoring
                                   dashboardPengiriman (id terisi vs NULL)
```

**Titik penting:** **pengiriman HTTP ke Satu Sehat TIDAK dilakukan di dalam
database.** Database hanya *menyiapkan* payload FHIR + menandai status. Ada
komponen pengirim eksternal (aplikasi SIMGOS / worker) yang membaca tabel staging
(`id IS NULL`, `send=1`), melakukan POST ber-OAuth2, lalu menulis balik `id`.
Ini persis peran yang bisa diisi/diobservasi oleh proyek kita
(lihat [`gap-vs-project.md`](./gap-vs-project.md)).

### Dua generasi mekanisme sinkronisasi

**GEN-1 — Batch berbasis watermark.** Tabel `sinkronisasi` menyimpan penanda
per-proses (`ID`, `TANGGAL_TERAKHIR`, `NAME_PROCEDURE`, `STATUS`). Procedure
bertipe `*To*` memakai *cursor* atas tabel sumber, memfilter
`TANGGAL > sinkronisasi.TANGGAL_TERAKHIR`, `LIMIT 100`, lalu memajukan watermark.
Dipicu event `autoExecuteIhsMaster` (master data) & `autoExecuteIhsTransaction`
(→ `executeTransaction`) tiap 2 menit.

**GEN-2 — Outbox near-real-time.** Procedure `sp_sync_*` (lebih baru) mengonsumsi
antrean `` `logs`.outbox `` dengan pola outbox:
`STATUS_PROSES` PENDING→PROCESSING→SUCCESS, `JENIS_TRANSAKSI` (mis. `'TTV'`),
`FETCH ... FOR UPDATE SKIP LOCKED LIMIT 50` di dalam transaksi. Dipicu event
tiap **3–10 detik**. Ini pendekatan lebih modern & tahan-konkurensi.

---

## 4. Functions (22) — Pembangun Potongan JSON FHIR

Sebagian besar mengembalikan `json` dan dipakai oleh trigger/procedure untuk
menyusun sub-struktur FHIR atau mereferensikan resource lain (via `id`).

| Function | Params | Returns | Peran |
|---|---|---|---|
| `getPatient` | PNORM int | json | `{reference:'Patient/<id>', display}` — **hanya jika** `patient.id` sudah ada |
| `getEncounter` | PNOPEN char | json | reference ke `Encounter/<id>` |
| `getOrganization` | PORGID char | json | reference Organization |
| `getPractitioner` | PNIP varchar | json | reference Practitioner |
| `getPatientAddress` / `getPatientTelecom` / `getPatientCommunication` | PNORM int | json | blok `address` / `telecom` / `communication` |
| `getPeriode` | PNOMOR char | json | `period` encounter |
| `getStatusHistory` / `getClassHistoryForEncounter` / `getStatusPendaftaran` | PNOMOR/NOPEN | json/char | riwayat status & kelas encounter |
| `getLocationForEncounter` | PNOPEN char | json | array `location` encounter |
| `getObJectReference` | PJENIS, PVALUE int | json | lookup coding generik dari `code_reference`/`type_code_reference` |
| `getObjectMappingReferensi` | PJENIS, PID int | json | mapping kode SIMGOS → coding FHIR |
| `getLoincDeskription` / `getParameterHasilLoincDeskription` | int | json | coding LOINC untuk lab |
| `getSnomedCt` | ID int | json | coding SNOMED CT |
| `getBza` | PKODE char | json | data BZA (obat/zat) |
| `getIdentifierUrutanOrderResep` / `getIdentifierUrutanLayananResep` | PNOMOR char | json | identifier urutan resep |
| `getValueTelaahResep` | PORDER, PTELAAH | int | nilai telaah resep |
| `dateFormatUTC` | PTANGGAL, PFORMAT | varchar | format tanggal ke UTC/DICOM |

---

## 5. Procedures (58) — Mapper & Orkestrasi

### 5.1 Master data (tanpa param tanggal; dipicu `autoExecuteIhsMaster`)

| Procedure | → Resource |
|---|---|
| `ruanganToOrganization` | Organization |
| `pasienToPatient` | Patient |
| `pegawaiToPractitioner` | Practitioner |
| `ruangKamarToLocation` / `ruangKamarTidurToLocation` | Location |

### 5.2 Transaksi batch (`IN PTANGGAL date`; dipanggil `executeTransaction`)

`executeTransaction(tanggal)` memanggil **±30 procedure** secara berurutan,
masing-masing dibungkus `CONTINUE HANDLER FOR SQLEXCEPTION` sehingga satu
kegagalan **tidak** menghentikan batch lainnya.

| Kelompok | Procedure → Resource |
|---|---|
| Encounter/Consent | `pendaftaranToEncounter`, `pendaftaranToConsent`, `pendaftaranToEncounterPulang` → Encounter/Consent |
| Condition | `diagnosaToConditition`, `keluhanUtamaToCondition`, `hasilPaToCondition`, `penilaianTumorToCondition`, `riwayatPenyakitDahuluToCondition`, `anamnesisToCondition` → Condition |
| Observation | `faktorRisikoToObservation`, `riwayatLainyaToObservation`, `nutrisiToObservation`, `penilaianGraceRiskToObservation`, `penilaianSkalaMorseToObservation`, `penilaianSkalaHumptyDumptyToObservation`, `penilaianEPFRAToObservation`, `tandaVitalToObservation` → Observation |
| ServiceRequest | `tindakanLabToServiceRequest`, `tindakanRadToServiceRequest`, `pemeriksaanEkgToServiceRequest`, `jadwalKontrolToServiceRequest`, `perencanaanRawatInapToServiceRequest` → ServiceRequest |
| Medication | `orderResepToMedication`, `pelayanaResepToMedication` → Medication/MedicationRequest/Dispense |
| Procedure | `procedureToProcedure` → Procedure |
| ClinicalImpression | `anamnesisToClinicalImpression`, `persetujuanDokterPrognosisToClinicalImpression` → ClinicalImpression |
| Alergi | `riwayatAlergiToAllergyIntolerance` → AllergyIntolerance |
| Kuesioner | `telaahResepToQuestionnaireResponse` → QuestionnaireResponse |
| Komposisi/Edukasi | `edukasiToComposition` → Composition |
| Billing | `handlingAccountCoverage` (+ `storeAccount`, `storeCoverage`) → Account/Coverage |

### 5.3 Outbox near-real-time (`sp_sync_*`; event tiap 3–10 detik)

| Procedure | → Resource | Sumber outbox |
|---|---|---|
| `sp_sync_ttv_to_observation` | Observation (TTV: nadi, nafas, sistol, diastol, suhu) | `logs.outbox` JENIS `TTV` |
| `sp_sync_penilaian_nyeri_to_observation` | Observation (nyeri) | outbox |
| `sp_sync_tindakan_medis_to_procedure` | Procedure | outbox |
| `sp_sync_jadwal_kontrol_to_service_request` | ServiceRequest | outbox |
| `sp_sync_pasien_pulang_to_care_plan` | CarePlan | outbox |
| `sp_sync_asuhan_keperawatan_to_goal` | Goal | outbox |
| `sp_sync_tagihan_to_charge_item` | ChargeItem | outbox |

### 5.4 Lab/Radiologi & DiagnosticReport (dipicu trigger, bukan batch)

`hasilLabToObservation(PTINDAKAN)`, `hasilRadToObservation(PTINDAKAN)`,
`catatanHasilLabToDignosticReport`, `catatanHasilRadToDignosticReport`,
`resumeToComposition` / `resumeToCompositionByNopen`, `episodeOfCare`.

### 5.5 Orkestrasi & utilitas

`executeTransaction`, `process_cursor`, `handlingAccountCoverage`,
`storeAccount`, `storeCoverage`, `pasienEncounterNull`, `detailEncounter`,
`pasienPulangToCarePlan`, `dashboardPengiriman` (laporan pengiriman: menghitung
baris ber-`id` vs `id NULL` per resource untuk rentang tanggal).

---

## 6. Triggers (97) — Pembangun Payload & Perantai Proses

Setiap tabel staging punya trigger `BEFORE INSERT` dan `BEFORE UPDATE`; sebagian
punya `AFTER` untuk merantai proses. Tanggung jawab utama:

1. **Membangun kolom JSON FHIR** dari data sumber + `get*()` + tabel terminologi.
   Contoh `patient_before_update`: menyusun `identifier` (NIK/KK via
   `type_code_reference`), `name`, `gender` (mapping `referensi_to_type_code_reference`),
   `maritalStatus`, `telecom`, `address`, `communication`, dan `meta.profile`
   `https://fhir.kemkes.go.id/r4/StructureDefinition/Patient`.
2. **Gating kelengkapan data:** set `send`/`statusRequest = 1` **hanya jika**
   field wajib lengkap (mis. `encounter_before_insert` men-set `send=0` bila
   `subject` atau `participant` NULL; patient perlu `identifier` + `address`).
3. **Merantai proses lanjutan (`AFTER`):**
   - `encounter_after_insert` → `storeCoverage()` lalu `storeAccount()` bila
     penjamin bukan umum.
   - `imaging_study_after_update` → `hasilRadToObservation()` saat `id` terisi.
   - `image_id_from_webhook_after_insert` → meng-update `imaging_study.id` dari
     webhook DICOM Router berdasarkan `acsn`.

---

## 7. Tabel Referensi & Terminologi

Mapping kode internal SIMGOS → sistem terminologi FHIR/Satu Sehat disimpan di
tabel (bukan hardcode):

| Tabel | Fungsi |
|---|---|
| `code_reference`, `type_code_reference`, `referensi_to_type_code_reference` | Sistem/coding umum FHIR & mapping jenis kelamin, identifier, status, dll. |
| `loinc_terminologi`, `tindakan_to_loinc`, `parameter_hasil_to_loinc` | Mapping tindakan/parameter lab → LOINC |
| `snomed_ct`, `tindakan_snomed` | Mapping → SNOMED CT |
| `satuan_lab_to_ut` | Satuan lab → UCUM |
| `rute_obat`, `bza`, `poa`, `pov`, `barang_to_bza`, `barang_to_poa_pov`, `petunjuk_racikan` | Terminologi obat/farmasi |
| `jenis_kunjungan` | Pemetaan jenis kunjungan → class Encounter |
| `sinkronisasi` | Watermark sinkronisasi GEN-1 |

---

## 8. Events (Scheduler MySQL) — semua ENABLED

| Event | Interval | Aksi |
|---|---|---|
| `autoExecuteIhsMaster` | 2 menit | Master data (Organization/Patient/Practitioner/Location) — **di-gate** oleh `aplikasi.integrasi` ID=7 STATUS=1 |
| `autoExecuteIhsTransaction` | 2 menit | `executeTransaction(hari ini)` — ±30 mapper transaksi |
| `evt_sync_ttv_to_observation` | 3 detik | TTV → Observation |
| `evt_sync_penilaian_nyeri_to_observation` | 3 detik | Nyeri → Observation |
| `evt_sync_tindakanmedis_to_procedure` | 3 detik | Tindakan medis → Procedure |
| `evt_sync_jadwal_kontrol_to_service_request` | 3 detik | Jadwal kontrol → ServiceRequest |
| `evt_sync_pasien_pulang_to_care_plan` | 3 detik | Pasien pulang → CarePlan |
| `evt_sync_asuhan_keperawatan_to_goal` | 5 detik | Asuhan keperawatan → Goal |
| `evt_sync_tagihan_to_charge_item` | 10 detik | Tagihan → ChargeItem |

> Per data `LAST_EXECUTED`, event masih aktif berjalan (mis. 18 Agu 2026 ~01:57 UTC).

---

## 9. Jalur Imaging / DICOM (relevan dgn utilitas proyek kita)

1. `imaging_study` (staging) berisi `refId` (ACSN/ID tindakan), `nopen`, `id`, `get`.
2. DICOM Router mengirim **webhook** berisi image ID → masuk ke
   `image_id_from_webhook` (`id`, `acsn`, `respon json`).
3. `image_id_from_webhook_after_insert` menuliskan `id` ke `imaging_study`
   yang cocok `acsn`.
4. `imaging_study_after_update` memicu `hasilRadToObservation()` → Observation.

Ini bersinggungan langsung dengan utilitas DICOM proyek kita (JPG→DCM, patch
ACSN, kirim ke DICOM Router, C-ECHO). ACSN adalah kunci penghubungnya.

---

## 10. Katalog Lengkap (Referensi)

Katalog penuh function, procedure (beserta parameter), dan seluruh tabel
(jumlah kolom, PK, keberadaan kolom `id`) tersedia sebagai lampiran ter-generate
dari introspeksi. Ringkasan jumlah: **22 functions, 58 procedures, 74 tables,
97 triggers, 9 events, 0 views.**

> Perbandingan detail dengan proyek `fhirrsudboltim` dan opsi integrasi ada di
> [`gap-vs-project.md`](./gap-vs-project.md).
