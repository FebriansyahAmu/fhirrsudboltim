# Environment Variables — FHIR RSUD BOLTIM

Daftar **lengkap** variabel environment yang benar-benar dibaca oleh kode
(hasil telusur `process.env.*`), bukan dari README. Gunakan ini sebagai acuan
saat membuat `.env` / `.env.example`.

> ⚠️ Nama variabel di bawah adalah yang **dipakai kode**. Perhatikan bahwa
> README saat ini memakai `JWT_SECRET`, tetapi kode membaca **`SECRET`**
> (lihat [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) G3).

---

## Server-side (rahasia — jangan diekspos ke browser)

| Variabel | Dibaca di | Wajib | Keterangan |
|---|---|:---:|---|
| `SECRET` | `lib/session.ts` | ✅ | Kunci penandatangan JWT HS256. Gunakan string acak ≥ 32 karakter. Aplikasi *throw* bila kosong. |
| `DATABASE_HOST` | `lib/db/prisma.ts` | ✅ | Host MariaDB/MySQL. |
| `DATABASE_USER` | `lib/db/prisma.ts` | ✅ | User DB. |
| `DATABASE_PASSWORD` | `lib/db/prisma.ts` | ✅ | Password DB. **Tidak** disebut di README. |
| `DATABASE_NAME` | `lib/db/prisma.ts` | ✅ | Nama database (mis. `fhir_satusehat`). |
| `DATABASE_PORT` | `lib/db/prisma.ts` | ✅ | Port DB (mis. `3306`). |
| `DATABASE_URL` | `prisma.config.ts`¹ | ➖ | Untuk Prisma CLI. `prisma.config.ts` sebenarnya menyusun URL dari `DATABASE_*` di atas; `DATABASE_URL` eksplisit bersifat opsional/redundan. |
| `SATU_SEHAT_BASE_URL` | `lib/dal/fhir.dal.ts` | ✅ | Base URL FHIR R4 Satu Sehat. |
| `SATU_SEHAT_AUTH_URL` | `lib/dal/token.dal.ts` | ✅ | Endpoint OAuth2 (`/accesstoken?grant_type=client_credentials` di-append otomatis bila belum ada). |
| `SATU_SEHAT_CLIENT_ID` | `lib/dal/token.dal.ts` | ✅ | Client ID Satu Sehat. |
| `SATU_SEHAT_CLIENT_SECRET` | `lib/dal/token.dal.ts` | ✅ | Client secret Satu Sehat. |
| `DICOM_ROUTER_HOST` | `lib/config/dicom-router.config.ts` | ➖ | Default `127.0.0.1`. |
| `DICOM_ROUTER_PORT` | `lib/config/dicom-router.config.ts` | ➖ | Default `11112`. |
| `DICOM_ROUTER_AE_TITLE` | `lib/config/dicom-router.config.ts` | ➖ | Default `DCMROUTER`. |
| `NODE_ENV` | `lib/db/prisma.ts`, `lib/session.ts` | ➖ | Diset oleh Next.js. Mengontrol logging Prisma & flag `Secure` cookie. |

¹ `prisma.config.ts` membangun `mysql://user:pass@host:port/db` dari variabel
`DATABASE_*`. Nilai password yang mengandung karakter khusus perlu di-*encode*
bila Anda menuliskan `DATABASE_URL` secara manual.

---

## Public (aman diekspos ke browser — prefiks `NEXT_PUBLIC_`)

| Variabel | Dibaca di | Wajib | Keterangan |
|---|---|:---:|---|
| `NEXT_PUBLIC_SATU_SEHAT_ORG_ID` | Banyak form (`components/modules/**`) | ✅ | ID organisasi fasyankes; disisipkan ke payload FHIR. |
| `NEXT_PUBLIC_SATU_SEHAT_BASE_URL` | `components/ui/DeliveryLogTable.tsx` | ➖ | Hanya untuk memangkas base URL di tampilan tabel log. **Tidak** ada di `.env` saat ini → endpoint tampil penuh (kosmetik, lihat G13). |

---

## Contoh `.env.example` (usulan)

Salin ke `.env` dan isi nilainya. **Jangan** commit `.env` (sudah di-`gitignore`).

```env
# ── Database (MariaDB / MySQL) ─────────────────────────────
DATABASE_HOST="localhost"
DATABASE_USER="root"
DATABASE_PASSWORD=""
DATABASE_NAME="fhir_satusehat"
DATABASE_PORT="3306"
# Opsional untuk Prisma CLI (kalau diisi manual, encode karakter khusus):
# DATABASE_URL="mysql://user:pass@localhost:3306/fhir_satusehat"

# ── JWT Session ────────────────────────────────────────────
# CATATAN: kode membaca SECRET (bukan JWT_SECRET). Minimal 32 karakter acak.
SECRET=""

# ── Satu Sehat API ─────────────────────────────────────────
# Staging:
# SATU_SEHAT_BASE_URL="https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1"
# SATU_SEHAT_AUTH_URL="https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1"
# Production:
SATU_SEHAT_BASE_URL="https://api-satusehat.kemkes.go.id/fhir-r4/v1"
SATU_SEHAT_AUTH_URL="https://api-satusehat.kemkes.go.id/oauth2/v1"
SATU_SEHAT_CLIENT_ID=""
SATU_SEHAT_CLIENT_SECRET=""

# ── Public (diekspos ke browser) ───────────────────────────
NEXT_PUBLIC_SATU_SEHAT_ORG_ID=""
NEXT_PUBLIC_SATU_SEHAT_BASE_URL="https://api-satusehat.kemkes.go.id/fhir-r4/v1"

# ── DICOM Router (opsional; ada default di kode) ───────────
DICOM_ROUTER_HOST="127.0.0.1"
DICOM_ROUTER_PORT="11112"
DICOM_ROUTER_AE_TITLE="DCMROUTER"
```

> Rekomendasi: tambahkan validasi env saat startup (Yup/Zod) agar aplikasi
> gagal cepat dengan pesan jelas bila ada variabel wajib yang kosong.
