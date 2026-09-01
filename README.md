# FHIR RSU DBOLTIM — Satu Sehat Integration Dashboard

Dashboard integrasi data **FHIR R4** ke platform **Satu Sehat Kemenkes RI**, dibangun dengan Next.js App Router.  
Mendukung autentikasi sesi, log pengiriman, validasi form Yup, dan utilitas DICOM.

---

## Fitur Utama

| Fitur | Keterangan |
|---|---|
| Multi-modul FHIR | POST / GET / PUT / PATCH per resource |
| Log Pengiriman | Riwayat setiap request tersimpan di database per user |
| Form + Raw JSON | Semua form mendukung mode visual dan raw JSON |
| Preset Otomatis | Preset LOINC, KPTL, SNOMED, ICD-10 per prosedur |
| JPG → DICOM | Konversi gambar JPG ke file `.dcm` dengan ACSN embed |
| Verifikasi DICOM | Upload `.dcm`, tampilkan seluruh metadata DICOM |
| Auth sesi | Cookie-based JWT via `jose`, dilindungi middleware |

---

## Modul FHIR

### Klinis

| Modul | Path | Methods |
|---|---|---|
| CarePlan | `/careplan` | POST GET PUT PATCH |
| ClinicalImpression | `/clinical-impression` | POST GET PUT PATCH |
| Encounter | `/encounter` | POST GET PUT PATCH |
| EpisodeOfCare | `/episode-of-care` | POST GET PUT PATCH |
| ImagingStudy | `/imaging-study` | GET |
| QuestionnaireResponse | `/questionnaire-response` | POST GET PUT PATCH |
| ServiceRequest | `/service-request` | POST GET PUT PATCH |
| Condition | — | POST GET PUT *(belum ada halaman)* |
| Observation | — | POST GET *(belum ada halaman)* |
| Procedure | — | POST GET PUT *(belum ada halaman)* |

### Resources - Prerequisites

| Modul | Path | Methods |
|---|---|---|
| Organization | `/organization` | GET POST PUT PATCH |
| Location | `/location` | POST GET PUT PATCH |
| Practitioner | `/practitioner` | GET |
| Patient | `/patient` | POST GET PUT PATCH |

### Obat & Diagnosa

| Modul | Path | Methods |
|---|---|---|
| AllergyIntolerance | `/allergy` | POST GET |
| MedicationRequest | — | POST GET *(belum ada halaman)* |
| DiagnosticReport | — | POST GET *(Soon)* |

### Utilitas

| Modul | Path | Keterangan |
|---|---|---|
| JPG → DICOM | `/jpg-to-dcm` | Konversi + Verifikasi file DICOM |

---

## Struktur Proyek

```
src/
├── app/
│   ├── layout.tsx                      # Root layout + metadata
│   ├── globals.css                     # DM Sans font + Tailwind base
│   ├── page.tsx                        # Halaman login
│   ├── dashboard/page.tsx              # Dashboard overview
│   │
│   ├── [modul]/page.tsx                # Halaman per modul FHIR
│   ├── jpg-to-dcm/page.tsx             # Utilitas DICOM (Convert + Verify tab)
│   │
│   ├── api/
│   │   ├── auth/                       # Login, logout, session
│   │   ├── fhir/[resource]/route.ts    # Proxy ke Satu Sehat API
│   │   ├── logs/route.ts               # CRUD log pengiriman
│   │   └── tools/
│   │       ├── jpg-to-dcm/route.ts     # Konversi JPG → DICOM via Python
│   │       └── verify-dcm/route.ts     # Baca metadata DICOM via Python
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx             # Sidebar collapsible + mobile drawer
│   │   │   └── DashboardLayout.tsx     # Wrapper layout utama
│   │   ├── ui/
│   │   │   ├── ResponseViewer.tsx      # Viewer response API (React nodes, XSS-safe)
│   │   │   └── DeliveryLogTable.tsx    # Tabel log + modal detail
│   │   └── modules/
│   │       └── [modul]/[Modul]Form.tsx # Form per resource FHIR
│   │
│   └── lib/
│       ├── types/
│       │   ├── fhir.ts                 # FHIR R4 payload types
│       │   └── api.ts                  # ApiResponse, DeliveryLog, ModuleInfo, dll.
│       ├── schemas/                    # Yup validation schema per modul
│       ├── constants/
│       │   └── modules.ts              # FHIR_MODULES, MODULE_GROUPS, METHOD_CONFIG
│       ├── hooks/
│       │   └── useApiRequest.ts        # Custom hook fetch + auto-log
│       ├── utils/
│       │   ├── security.ts             # sanitizeText, buildSafeApiUrl, dll.
│       │   └── log.ts                  # saveDeliveryLog, getDeliveryLogs, dll.
│       └── session.ts                  # JWT sign/verify via jose (Edge-compatible)
│
├── proxy.ts                            # Middleware route protection
│
├── scripts/
│   ├── jpg_to_dcm.py                   # Convert JPG → DICOM (pydicom)
│   └── read_dcm.py                     # Baca metadata DICOM → JSON stdout
│
└── prisma/
    └── schema.prisma                   # Schema DB: users, delivery_logs
```

---

## Setup

### Prasyarat

- **Node.js** 18+
- **MariaDB / MySQL** (database lokal atau remote)
- **Python 3** + paket `pydicom`, `pillow`, `numpy` (untuk fitur DICOM)

---

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd fhirrsudboltim
npm install
```

---

### 2. Konfigurasi environment

Buat file `.env` di root proyek:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/fhir_satusehat"
DATABASE_HOST="localhost"
DATABASE_USER="root"
DATABASE_NAME="fhir_satusehat"
DATABASE_PORT="3306"

# ── JWT Session ───────────────────────────────────────────
JWT_SECRET="isi-dengan-string-random-panjang-minimal-32-karakter"

# ── Satu Sehat API (pilih salah satu: staging atau production) ──
# Staging
# SATU_SEHAT_BASE_URL="https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1"
# SATU_SEHAT_AUTH_URL="https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1"

# Production
SATU_SEHAT_BASE_URL="https://api-satusehat.kemkes.go.id/fhir-r4/v1"
SATU_SEHAT_AUTH_URL="https://api-satusehat.kemkes.go.id/oauth2/v1"

SATU_SEHAT_CLIENT_ID="client-id-dari-satu-sehat"
SATU_SEHAT_CLIENT_SECRET="client-secret-dari-satu-sehat"

# ── Public (aman di-expose ke browser) ────────────────────
NEXT_PUBLIC_SATU_SEHAT_ORG_ID="uuid-organisasi-fasyankes"
```

---

### 3. Setup database

```bash
# Generate Prisma client
npx prisma generate

# Sinkronisasi schema ke database (development)
npx prisma db push
```

> Pastikan database `fhir_satusehat` sudah dibuat dan user memiliki hak akses penuh.

---

### 4. Install Python dependencies (untuk fitur DICOM)

```bash
pip install pydicom pillow numpy
```

> Dibutuhkan oleh endpoint `/api/tools/jpg-to-dcm` dan `/api/tools/verify-dcm`.  
> Pastikan `python` atau `python3` tersedia di PATH.

---

### 5. Jalankan aplikasi

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

Aplikasi berjalan di `http://localhost:3000`.

---

### 6. Type check & lint

```bash
npx tsc --noEmit
npm run lint
```

---

## Security Practices

| Area | Implementasi |
|---|---|
| XSS | Tidak ada `dangerouslySetInnerHTML`; JSON highlight via React nodes |
| IDOR | `buildSafeApiUrl()` validasi UUID + whitelist resource type |
| Token | Cookie HttpOnly + JWT `jose`; tidak disimpan di localStorage |
| Path Traversal | Semua ID di-`encodeURIComponent()` |
| Request | `credentials: "omit"`, `redirect: "error"` |
| Form | Yup validation penuh, `noValidate`, max-length semua field |
| Subprocess | `child_process.spawn` (bukan `exec`) — tidak ada shell injection |

---

## Cara Menambah Modul Baru

### 1. Daftarkan di `modules.ts`

```typescript
// src/app/lib/constants/modules.ts
{ name: "Condition", path: "/condition", icon: "🏥", desc: "...", group: "Klinis", methods: ["POST","GET"] }
```

### 2. Buat schema validasi

```typescript
// src/app/lib/schemas/condition.schema.ts
import * as Yup from "yup";
export const conditionFormSchema = Yup.object({ ... });
```

### 3. Buat form component

```
src/app/components/modules/condition/ConditionForm.tsx
```

### 4. Buat halaman

```
src/app/condition/page.tsx  ← duplikasi dari encounter/page.tsx
```

Modul otomatis muncul di sidebar karena dibaca dari `FHIR_MODULES`.

---

## Developer

**Febriansyah D. Amu**
