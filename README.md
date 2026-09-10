# FHIR RSU DBOLTIM — Satu Sehat Integration

Jembatan integrasi **SIMGOS → Satu Sehat (FHIR R4, Kemenkes RI)** untuk RSUD Boltim.
Aplikasi membaca data dari database rumah sakit (`SIMGOS` / `kemkes-ihs`), merakitnya
menjadi resource FHIR R4, mengirimnya ke Satu Sehat, lalu **menulis balik `id` Satu Sehat**
ke SIMGOS agar rantai referensi antar-resource tetap konsisten.

Dibangun dengan **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind v4**,
dan **Prisma 7**.

> **Versi:** `v2.0.0`

---

## Ringkasan

Aplikasi punya dua mode kerja yang saling melengkapi:

1. **Mesin Sinkronisasi SIMGOS** *(inti v2.0.0)* — setiap resource punya panel yang:
   menarik daftar data dari SIMGOS, memfilter berdasarkan tanggal, mencari per-kunci,
   merakit payload FHIR otomatis, mengirim satu-per-satu (kirim antrian) atau otomatis
   (auto-kirim), lalu menulis balik `id`/`subject`/`encounter` ke SIMGOS.
2. **Form FHIR manual** — setiap resource juga punya halaman POST/GET/PUT/PATCH manual
   dengan mode form visual dan raw JSON, lengkap dengan preset kode (LOINC/SNOMED/ICD-10).

Ditambah **utilitas DICOM** (JPG→DICOM, PATCH ACSN, DICOM router) dan **dashboard analitik**
pertumbuhan & keberhasilan pengiriman.

---

## Arsitektur Data

Aplikasi terhubung ke **dua database**:

| Database | Driver | Akses | Isi |
|---|---|---|---|
| **DB Aplikasi** | Prisma (`mysql`) | Baca/Tulis penuh | `users`, `delivery_logs`, `satu_sehat_tokens`, `ihs_row_notes`, `lab_loinc_map` |
| **SIMGOS** (`kemkes-ihs` dkk.) | `mariadb` | **Read-mostly** | Data pasien/kunjungan/tindakan + tabel staging FHIR per-resource |

### Kebijakan penulisan SIMGOS (penting)

SIMGOS diperlakukan **read-mostly**. Semua penulisan hanya lewat fungsi tersanksi di
[`src/app/lib/db/simgos.ts`](src/app/lib/db/simgos.ts), dijaga `assertAllowedStatement`
(hanya izinkan `SELECT`/`WITH`/`SHOW`/`UPDATE`) dan `multipleStatements: false`:

- `simgosExecute` — hanya `UPDATE` (dipakai write-back `id`/`subject`/`encounter`).
- `simgosInsertEncounterRefId` — `INSERT` konstanta terkunci (baris encounter refId).
- `simgosCallEpisodeOfCare` — `CALL` konstanta terkunci (bangun EpisodeOfCare).
- `simgosInsertSpecimenForServiceRequest` / `simgosReconcileMissingLabSpecimens` —
  `INSERT` konstanta terkunci untuk melengkapi specimen order lab.

`INSERT`/`DELETE`/DDL/`CALL` di luar fungsi khusus tersebut ditolak. Prosedur & trigger
SIMGOS **tidak pernah diubah** oleh aplikasi.

---

## Fitur Utama

| Fitur | Keterangan |
|---|---|
| Sinkronisasi SIMGOS | Panel per-resource: list, filter tanggal, cari, kirim antrian, auto-kirim, write-back |
| Perakitan payload otomatis | Payload FHIR dirakit dari kolom staging; buang `null`/`""`, konversi tipe |
| Write-back `id` | `id` Satu Sehat ditulis balik ke SIMGOS agar referensi antar-resource valid |
| Catatan status baris | Tandai baris gagal (kuning) / selesai (hijau) di `ihs_row_notes` |
| Form + Raw JSON | Semua form mendukung mode visual dan raw JSON |
| Log Pengiriman | Riwayat tiap request tersimpan di `delivery_logs` per user |
| Dashboard Analitik | Tren pertumbuhan & keberhasilan kirim (murni dari `delivery_logs`) |
| Detail Encounter | Halaman rekam medis gaya EMR per encounter (`/encounter/{refId}`) |
| Utilitas DICOM | JPG→DICOM, verifikasi metadata, PATCH ACSN, DICOM router |
| Auth sesi | Cookie HttpOnly + JWT (`jose`), dilindungi middleware |

---

## Mesin Sinkronisasi

Semua resource inti dijalankan oleh satu mesin sync generik:

- **Registry** — [`src/app/lib/ihs/registry.ts`](src/app/lib/ihs/registry.ts): spesifikasi
  per-modul (tabel sumber, kolom kunci, kolom tanggal, kolom bendera kirim, kolom payload).
- **Query builder** — [`src/app/lib/ihs/module-sync.ts`](src/app/lib/ihs/module-sync.ts):
  ringkasan, baris, filter (`buildWhere`, `keyDateConds`), dan perakit payload
  (`getModulePayload`).
- **API** — [`src/app/api/ihs/[module]/`](src/app/api/ihs/):
  `route.ts` (ringkasan + baris), `[key]` (GET payload + enrichment), `reconcile` (bulk),
  `notes` (catatan status baris).
- **UI** — [`ModuleSyncPanel.tsx`](src/app/components/ihs/ModuleSyncPanel.tsx) (generik)
  plus panel khusus untuk resource yang butuh perlakuan tambahan.

**Alur kirim:** filter data "siap" → antre → GET payload (ter-*enrich*) → POST/GET ke Satu Sehat
→ tulis balik `id` ke SIMGOS. Praktik pengiriman ke Satu Sehat (POST/GET) & commit dilakukan
oleh operator.

---

## Modul FHIR

Hampir semua resource inti punya **halaman manual** *dan* **panel sinkronisasi SIMGOS**.

### Prasyarat (Master)

| Modul | Path | Sinkron | Catatan |
|---|---|:---:|---|
| Patient | `/patient` | ✓ | Cari per-NIK, write-back identifier/meta/name |
| Practitioner | `/practitioner` | ✓ | Data nasional → *di-resolve* via NIK (GET), bukan dibuat |
| Location | `/location` | ✓ | POST; `status` tinyint→kode, default `mode` |
| Organization | `/organization` | ✓ | POST; `active` tinyint→boolean |

### Klinis

| Modul | Path | Sinkron |
|---|---|:---:|
| Encounter | `/encounter` (+ `/encounter/{refId}`) | ✓ |
| Condition | `/condition` | ✓ |
| Procedure | `/procedure` | ✓ |
| Observation | `/observation` | ✓ |
| ServiceRequest | `/service-request` | ✓ |
| Specimen | `/specimen` | ✓ |
| ImagingStudy | `/imaging-study` | ⤵ turunan ServiceRequest |
| CarePlan | `/careplan` | ✓ |
| ClinicalImpression | `/clinical-impression` | ✓ |
| Composition | `/composition` | ✓ |
| EpisodeOfCare | `/episode-of-care` | ✓ |
| QuestionnaireResponse | `/questionnaire-response` | ✓ |

### Obat & Diagnosa

| Modul | Path | Sinkron |
|---|---|:---:|
| Medication | `/medication` | ✓ |
| MedicationRequest | `/medication-request` | ✓ |
| MedicationDispense | `/medication-dispense` | ✓ |
| DiagnosticReport | `/diagnostic-report` | ✓ |
| AllergyIntolerance | `/allergy` | ✓ |

### Utilitas

| Modul | Path | Keterangan |
|---|---|---|
| JPG → DICOM | `/jpg-to-dcm` | Konversi gambar JPG ke `.dcm` (ACSN embed) + verifikasi metadata |
| PATCH ACSN | `/patch-acsn` | Perbarui Accession Number pada ImagingStudy |
| DICOM Router | `/dicom-router` | Kirim `.dcm` ke AE tujuan (C-STORE via `storescu`/DCMTK) |
| Master Pengguna | `/master/pengguna` | Kelola user aplikasi |
| Analytics | `/analytics` | Dashboard tren pertumbuhan & pengiriman |

---

## Struktur Proyek

```
src/
├── app/
│   ├── page.tsx                        # Halaman login
│   ├── dashboard/page.tsx              # Dashboard overview
│   ├── analytics/page.tsx              # Dashboard analitik
│   ├── [modul]/page.tsx                # Halaman per resource FHIR
│   ├── encounter/[refId]/page.tsx      # Detail encounter gaya EMR
│   ├── master/pengguna/page.tsx        # Manajemen user
│   │
│   ├── api/
│   │   ├── auth/                       # Login, logout, session
│   │   ├── fhir/[resource]/route.ts    # Proxy ke Satu Sehat (+ write-back on POST/GET)
│   │   ├── ihs/[module]/               # Mesin sync: rows, [key] payload, reconcile, notes
│   │   ├── analytics/route.ts          # Data dashboard analitik
│   │   ├── logs/route.ts               # CRUD log pengiriman
│   │   ├── users/                      # CRUD user
│   │   └── tools/                      # jpg-to-dcm, verify-dcm, dicom-router, patch-acsn
│   │
│   ├── components/
│   │   ├── layout/                     # Sidebar, DashboardLayout
│   │   ├── ui/                         # ResponseViewer, DeliveryLogTable, dll.
│   │   ├── ihs/                        # ModuleSyncPanel + panel & view sinkronisasi
│   │   └── modules/[modul]/            # Form per resource FHIR
│   │
│   └── lib/
│       ├── db/
│       │   ├── prisma.ts               # Klien Prisma (DB aplikasi)
│       │   └── simgos.ts               # Koneksi SIMGOS + penjaga penulisan tersanksi
│       ├── ihs/
│       │   ├── registry.ts             # IHS_MODULES: spesifikasi sync per-modul
│       │   ├── module-sync.ts          # Query, filter, perakit payload
│       │   └── *.ts                     # Enrichment (performer, lab LOINC, encounter, dll.)
│       ├── dal/                        # Data access + write-back per resource
│       ├── types/, schemas/, hooks/    # Tipe FHIR, validasi Yup, hook fetch
│       ├── utils/                      # security.ts, log.ts
│       └── session.ts                  # JWT sign/verify via jose
│
├── proxy.ts                            # Middleware proteksi route
├── scripts/                            # Skrip Python DICOM (pydicom)
└── prisma/schema.prisma                # Schema DB aplikasi
```

---

## Setup

### Prasyarat

- **Node.js** 18+
- **MariaDB / MySQL** — DB aplikasi + akses (read-mostly) ke database SIMGOS
- **Python 3** + `pydicom`, `pillow`, `numpy` (untuk konversi/verifikasi DICOM)
- **DCMTK** (`storescu` di PATH) — hanya untuk fitur DICOM Router

### 1. Clone & install

```bash
git clone <repo-url>
cd fhirrsudboltim
npm install
```

### 2. Konfigurasi environment

Buat file `.env` di root proyek:

```env
# ── DB Aplikasi (Prisma) ──────────────────────────────────
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/fhir_satusehat"
DATABASE_HOST="localhost"
DATABASE_USER="root"
DATABASE_PASSWORD="password"
DATABASE_NAME="fhir_satusehat"
DATABASE_PORT="3306"

# ── DB SIMGOS (read-mostly, driver mariadb) ───────────────
DATABASE_URL_SIMGOS="mysql://USER:PASSWORD@HOST:3306/kemkes-ihs"

# ── Session (JWT) ─────────────────────────────────────────
SECRET="string-random-panjang-minimal-32-karakter"

# ── Satu Sehat API (staging atau production) ──────────────
SATU_SEHAT_BASE_URL="https://api-satusehat.kemkes.go.id/fhir-r4/v1"
SATU_SEHAT_AUTH_URL="https://api-satusehat.kemkes.go.id/oauth2/v1"
SATU_SEHAT_CLIENT_ID="client-id-dari-satu-sehat"
SATU_SEHAT_CLIENT_SECRET="client-secret-dari-satu-sehat"

# ── Public (aman di-expose ke browser) ────────────────────
NEXT_PUBLIC_SATU_SEHAT_BASE_URL="https://api-satusehat.kemkes.go.id/fhir-r4/v1"
NEXT_PUBLIC_SATU_SEHAT_ORG_ID="uuid-organisasi-fasyankes"

# ── DICOM Router (opsional, untuk /dicom-router) ──────────
DICOM_ROUTER_AE_TITLE="AE_TUJUAN"
DICOM_ROUTER_HOST="host-pacs"
DICOM_ROUTER_PORT="104"

# ── Postman (opsional, ambil contoh payload resmi) ────────
# POSTMAN_API_KEYS="key1,key2"
```

> **Catatan:** variabel session bernama `SECRET` (bukan `JWT_SECRET`).

### 3. Setup database aplikasi

```bash
npx prisma generate
npx prisma db push
```

> DB SIMGOS **tidak** dikelola Prisma — cukup pastikan `DATABASE_URL_SIMGOS` valid & bisa
> dibaca. Skema lokal untuk mapping lab: `prisma/seed-lab-loinc.mjs`.

### 4. Install Python (fitur DICOM)

```bash
pip install pydicom pillow numpy
```

### 5. Jalankan

```bash
npm run dev        # development → http://localhost:3000
npm run build && npm start   # production
```

### 6. Type check & lint

```bash
npx tsc --noEmit
npm run lint
```

---

## Model Database (Prisma)

| Model | Fungsi |
|---|---|
| `users` | Akun operator (login, role) |
| `delivery_logs` | Riwayat tiap request FHIR (metode, status, payload, response) |
| `satu_sehat_tokens` | Cache access-token OAuth2 Satu Sehat |
| `ihs_row_notes` | Catatan status baris sync (tanda kuning/hijau, unik per `module`+`ref_key`) |
| `lab_loinc_map` | Peta parameter lab SIMGOS → kode LOINC yang benar |

---

## Security Practices

| Area | Implementasi |
|---|---|
| Penulisan SIMGOS | Read-mostly; tulis hanya lewat fungsi tersanksi + `assertAllowedStatement` |
| SQL Injection | Query berparameter; `multipleStatements: false` pada koneksi SIMGOS |
| XSS | Tanpa `dangerouslySetInnerHTML`; JSON di-highlight via React nodes |
| IDOR | `buildSafeApiUrl()` validasi UUID + whitelist resource type |
| Token | Cookie HttpOnly + JWT `jose`; tidak disimpan di localStorage |
| Path Traversal | Semua ID di-`encodeURIComponent()` |
| Request | `credentials: "omit"`, `redirect: "error"` |
| Form | Validasi Yup penuh, `noValidate`, max-length semua field |
| Subprocess | `child_process.spawn` (bukan `exec`) — tanpa shell injection |

---

## Cara Menambah Modul Sync Baru

1. **Daftarkan spesifikasi** di [`registry.ts`](src/app/lib/ihs/registry.ts) — tabel sumber,
   `keyCol`, `readyFlag`, `orderCol`, `dateKey`, dan kolom payload.
2. **(Opsional) enrichment** di [`api/ihs/[module]/[key]/route.ts`](src/app/api/ihs/) bila
   staging belum sepenuhnya FHIR (mis. konversi kode/status).
3. **Tambah panel** di halaman resource:
   ```tsx
   <ModuleSyncPanel module="namamodul" title="…" enableQueue enableKeySearch defaultOpen />
   ```
4. **Write-back** memakai jalur yang ada (`handleClinicalPostResult` untuk id-only, atau
   write-back khusus di `lib/dal/`).

---

## Developer

**Febriansyah D. Amu**
