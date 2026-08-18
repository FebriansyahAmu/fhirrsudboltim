# Arsitektur — FHIR RSUD BOLTIM

Dokumen ini menjelaskan bagaimana aplikasi dirancang: lapisan-lapisannya, alur
request, mekanisme autentikasi, dan manajemen token ke Satu Sehat.

> Stack: **Next.js 16** (App Router) · **React 19** · **TypeScript** ·
> **Prisma 7** + **MariaDB/MySQL** · **Tailwind CSS 4** · **jose** (JWT) ·
> **Yup** (validasi form) · **Python 3 + pydicom** & **DCMTK** (utilitas DICOM).

---

## 1. Gambaran Umum

Aplikasi ini adalah **dashboard integrasi FHIR R4** untuk mengirim data ke
platform **Satu Sehat Kemenkes RI**. Browser tidak pernah berbicara langsung ke
Satu Sehat — semua request melewati **API Route internal Next.js** yang bertindak
sebagai proxy aman (menyimpan token OAuth2 di server, mencatat audit log, dan
memvalidasi payload).

```
┌──────────┐     ┌─────────────────────────────┐     ┌──────────────────┐
│ Browser  │───▶│ Next.js API Route (server)  │───▶│ Satu Sehat API   │
│ (client) │     │  /api/fhir/[resource]       │     │ (FHIR R4 + OAuth)│
└──────────┘     │  - auth (cookie sesi)       │     └──────────────────┘
                 │  - validasi payload         │
                 │  - rate limit               │            ▲
                 │  - forward + token OAuth2   │            │ Bearer token
                 └──────────────┬──────────────┘            │
                                │                           │
                                ▼                           │
                       ┌─────────────────┐        ┌──────────────────┐
                       │ MariaDB/MySQL   │        │ token.dal.ts     │
                       │ delivery_logs   │        │ cache + refresh  │
                       │ users           │        └──────────────────┘
                       │ satu_sehat_tokens│
                       └─────────────────┘
```

**Keuntungan pola proxy ini:**

- `client_secret` & access token **tidak pernah** terekspos ke browser.
- Audit log tersimpan server-side di database, bukan `sessionStorage`.
- Satu titik untuk rate limiting, validasi, dan interceptor semua modul FHIR.

---

## 2. Lapisan (Layers)

| Lapisan | Lokasi | Tanggung jawab |
|---|---|---|
| **Presentation** | `src/app/**/page.tsx`, `components/` | Halaman & UI per modul (Client Components) |
| **Form & Validasi** | `lib/schemas/*.schema.ts` | Skema Yup per resource; `components/modules/**/*Form.tsx` |
| **Client fetch** | `lib/hooks/useApiRequest.ts` | Hook fetch ke API Route internal + log ke `sessionStorage` |
| **API Route (proxy)** | `app/api/**/route.ts` | Auth, rate limit, validasi, forward ke Satu Sehat |
| **Data Access Layer** | `lib/dal/*.dal.ts` | `fhir.dal`, `auth.dal`, `token.dal` — satu-satunya yang menyentuh DB & Satu Sehat |
| **Persistence** | `lib/db/prisma.ts`, `prisma/schema.prisma` | Prisma client singleton (adapter MariaDB) |
| **Cross-cutting** | `lib/session.ts`, `lib/rate-limit.ts`, `lib/utils/*`, `proxy.ts` | Sesi JWT, rate limit, sanitasi, middleware |

Aturan penting: **hanya DAL yang boleh menyentuh database dan Satu Sehat.**
Route dan komponen tidak memanggil `fetch` ke Satu Sehat atau `prisma` secara
langsung untuk operasi FHIR.

---

## 3. Autentikasi & Sesi

Autentikasi berbasis **cookie sesi JWT** (bukan token di `localStorage`).

- **Login** (`app/api/auth/login/route.ts`)
  1. Rate limit `login` (5 request / 15 menit / IP).
  2. Ambil user (`auth.dal.getUserByUsername`).
  3. `bcrypt.compare` **selalu** dijalankan (memakai dummy hash bila user tidak
     ada) untuk mencegah *timing attack*.
  4. Jika valid → `setSessionCookie()` menandatangani JWT HS256 (`jose`),
     berlaku 8 jam, disimpan sebagai cookie `session` (`HttpOnly`, `SameSite=lax`,
     `Secure` di production).
- **Proteksi route** (`src/proxy.ts` — konvensi *middleware* Next.js 16 bernama
  `proxy`) memverifikasi cookie pada setiap request:
  - Prefix terproteksi (`/dashboard`, semua modul, `/api/fhir`, `/api/tools`,
    `/api/logs`) → redirect ke `/` bila tanpa sesi valid.
  - Route publik (`/`, `/login`) → redirect ke `/dashboard` bila sudah login.
- **Defense-in-depth**: setiap API Route **juga** memanggil `getSession()`
  sendiri, jadi tidak bergantung pada middleware saja.

`SessionPayload` berisi `{ userId, username, role }`. Lihat
`lib/session.ts`.

---

## 4. Manajemen Token Satu Sehat (OAuth2)

`lib/dal/token.dal.ts` mengelola access token `client_credentials` dengan
strategi cache 3-tingkat:

1. **Memory cache** (`memoryCache`) — tercepat, hilang saat restart.
2. **Database** (`satu_sehat_tokens`, baris tunggal `id = 1`) — bertahan lintas
   restart.
3. **Fetch baru** ke `SATU_SEHAT_AUTH_URL` bila expired (dengan buffer 60 detik)
   → di-`upsert` ke DB + perbarui memory cache.

Token FHIR ditambahkan sebagai header `Authorization: Bearer` **di server**
(`fhir.dal.sendToSatuSehat`), tidak pernah dikirim ke browser.

---

## 5. Alur Request FHIR (contoh: POST CarePlan)

```
1. User isi form  →  CarePlanForm.tsx (validasi Yup)
2. useApiRequest.sendRequest({ method: "POST", payload })
3. fetch  POST /api/fhir/CarePlan   (cookie sesi ikut, same-origin)
4. route.ts:
     - checkRateLimit(api)         → 429 bila lewat batas
     - getSession()                → 401 bila tanpa sesi
     - ALLOWED_RESOURCES.has(...)  → 400 bila resource tak diizinkan
     - validateFhirPayload(...)    → 400 bila resourceType tak cocok / >1 MB
5. fhir.dal.sendToSatuSehat():
     - getValidToken()             → token OAuth2
     - buildSafeApiUrl()           → whitelist resource + validasi UUID id
     - fetch ke Satu Sehat (credentials: "omit", redirect: "error")
     - saveDeliveryLog()           → simpan audit ke delivery_logs (fire-and-forget)
6. Response Satu Sehat diteruskan apa adanya ke browser
7. Client menyimpan ringkasan log ke sessionStorage (DeliveryLogTable)
```

Endpoint by-ID (`/api/fhir/[resource]/[id]`) menambahkan validasi
`isValidUUID(id)` sebelum diteruskan.

---

## 6. Model Data

Tiga tabel (lihat `prisma/schema.prisma` dan `prisma/sql/init.sql`):

| Tabel | Isi |
|---|---|
| `users` | Akun operator dashboard (`id`, `username`, `password` bcrypt, `role`) |
| `delivery_logs` | Audit setiap request FHIR (`method`, `resource_type`, `endpoint`, `status_code`, `payload` JSON, `response` JSON, `sent_at`) |
| `satu_sehat_tokens` | Cache OAuth2 token (baris tunggal `id = 1`) |

`delivery_logs.user_id` → FK ke `users.id` (`ON DELETE RESTRICT`).

> Prisma dikonfigurasi tanpa `url` di blok `datasource` schema; koneksi dibangun
> runtime dari variabel env individual melalui `@prisma/adapter-mariadb`
> (`lib/db/prisma.ts`) dan `prisma.config.ts` untuk CLI.

---

## 7. Modul FHIR

Modul didefinisikan terpusat di `lib/constants/modules.ts` (`FHIR_MODULES`).
Sidebar dan dashboard membaca daftar ini, jadi menambah entri baru otomatis
muncul di UI. Field `hasPage: false` menandai modul yang halamannya belum dibuat.

Resource yang **diizinkan** di sisi server didefinisikan di
`lib/constants/fhir.ts` (`ALLOWED_RESOURCES`) dan diduplikasi di client
(`lib/utils/security.ts` — `CLIENT_ALLOWED_RESOURCES`).

---

## 8. Utilitas DICOM

Tiga endpoint di `app/api/tools/` memanggil proses eksternal via
`child_process.spawn` (**bukan** `exec` — tidak ada shell, tidak ada risiko
injeksi shell):

| Endpoint | Proses | Fungsi |
|---|---|---|
| `jpg-to-dcm` | Python `scripts/jpg_to_dcm.py` | Konversi JPG → DICOM + embed ACSN |
| `verify-dcm` | Python `scripts/read_dcm.py` | Baca metadata DICOM |
| `patch-acsn` | Python `scripts/patch_acsn.py` | Ubah Accession Number pada `.dcm` |
| `dicom-echo` | DCMTK `echoscu` | Test koneksi C-ECHO ke DICOM Router |
| `send-to-router` | DCMTK `storescu` | Kirim `.dcm` ke DICOM Router |

Semua upload divalidasi *magic bytes* (`lib/utils/file-validation.ts`): JPEG
(`FF D8 FF`) dan DICOM (`DICM` pada offset 128), plus batas ukuran & ekstensi.
Konfigurasi router dibaca runtime dari env (`lib/config/dicom-router.config.ts`).

---

## 9. Keamanan yang Sudah Diterapkan

- **Security headers** (`next.config.ts`): HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, dan CSP.
- **Rate limiting** in-memory per-IP untuk login, API, dan tools
  (`lib/rate-limit.ts`).
- **Validasi payload FHIR**: `resourceType` harus cocok endpoint, max 1 MB,
  harus objek JSON.
- **Whitelist resource** di server & client; **validasi UUID** untuk ID.
- **Sanitasi** (`lib/utils/security.ts`) dan tidak ada `dangerouslySetInnerHTML`.

> Batasan dan celah dari poin-poin di atas dibahas di
> [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md).
