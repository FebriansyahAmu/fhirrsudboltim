# Satu Sehat Integration v2 — NextJS Dashboard

Dashboard integrasi data FHIR R4 ke Satu Sehat Kemenkes RI.  
Light mode, mobile-responsive, validasi Yup, security best practices.

---

## Struktur Proyek

```
satu-sehat-v2/
│
├── app/
│   ├── layout.tsx                    # Root layout + metadata
│   ├── globals.css                   # DM Sans font + Tailwind base
│   ├── dashboard/page.tsx            # Halaman dashboard overview
│   └── careplan/page.tsx             # Halaman modul CarePlan
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               # Sidebar: desktop collapsible + mobile drawer
│   │   └── DashboardLayout.tsx       # Wrapper: sidebar + mobile header + breadcrumbs
│   │
│   ├── ui/
│   │   ├── ResponseViewer.tsx        # Viewer response API (React syntax highlight, aman)
│   │   └── DeliveryLogTable.tsx      # Tabel log pengiriman per modul + modal detail
│   │
│   └── modules/
│       ├── ApiMethodTabs.tsx         # Tab selector HTTP method
│       └── careplan/
│           └── CarePlanForm.tsx      # Form CarePlan (Yup validation, Form + Raw JSON)
│
└── lib/
    ├── types/
    │   ├── fhir.ts                   # FHIR R4 resource types
    │   └── api.ts                    # ApiResponse, DeliveryLog, HttpMethod, dll.
    │
    ├── schemas/
    │   └── careplan.schema.ts        # Yup validation schema CarePlan
    │
    ├── constants/
    │   └── modules.ts                # FHIR_MODULES, METHOD_CONFIG, MODULE_GROUPS
    │
    ├── hooks/
    │   └── useApiRequest.ts          # Custom hook: fetch aman + auto-log
    │
    └── utils/
        ├── security.ts               # sanitizeText, buildSafeApiUrl, getStoredToken, dll.
        └── log.ts                    # saveDeliveryLog, getDeliveryLogs, formatDate, dll.
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Buat .env.local
cp .env.example .env.local
# Isi CLIENT_ID, CLIENT_SECRET, BASE_URL

# 3. Jalankan dev server
npm run dev

# 4. Type check
npm run type-check
```

---

## Security Practices yang Diterapkan

### XSS Prevention

- **Tidak ada `dangerouslySetInnerHTML`** di seluruh codebase
- JSON syntax highlighting diimplementasikan sebagai React nodes (bukan HTML string)
- Semua string di-render React secara default (auto-escape)
- `sanitizeText()` tersedia di `lib/utils/security.ts` untuk kasus edge

### IDOR Prevention

- `buildSafeApiUrl()` memvalidasi UUID sebelum digunakan di URL
- Whitelist resource type — hanya resource yang terdaftar bisa diakses
- `isValidUUID()` memvalidasi semua parameter ID

### Token Security

- Token disimpan di `sessionStorage` (bukan `localStorage`) — dibersihkan saat tab ditutup
- Token divalidasi format sebelum dikirim sebagai header
- `getStoredToken()` tidak pernah throw — mengembalikan `null` jika tidak valid

### Path Traversal

- Semua ID di-encode dengan `encodeURIComponent()`
- Base URL tidak bisa diubah dari input user

### Request Safety

- `credentials: "omit"` — tidak kirim cookie ke domain lain
- `redirect: "error"` — cegah open redirect
- Error message di UI tidak expose stack trace

### Form Validation (Yup)

- UUID regex validation untuk semua ID field
- SNOMED code format validation
- Max length untuk semua string field
- `noValidate` di form + validasi penuh di resolver

---

## Cara Menambah Modul Baru (Contoh: Condition)

### 1. Tambah schema validasi

```typescript
// lib/schemas/condition.schema.ts
import * as Yup from "yup";
export const conditionFormSchema = Yup.object({ ... });
```

### 2. Tambah types jika perlu

```typescript
// lib/types/fhir.ts — tambahkan ConditionPayload
export interface ConditionPayload { ... }
```

### 3. Buat form component

```
components/modules/condition/ConditionForm.tsx
```

### 4. Buat halaman

```
app/condition/page.tsx  ← duplikasi dari careplan/page.tsx
```

Modul otomatis muncul di sidebar karena sudah terdaftar di `lib/constants/modules.ts`.

---

Developed by Digan
