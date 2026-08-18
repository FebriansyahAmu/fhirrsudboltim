# Gap Analysis — FHIR RSUD BOLTIM

Analisis kesenjangan (gap) terhadap kondisi kode per **18 Agustus 2026**
(branch `main`). Setiap temuan menyertakan **bukti** (lokasi kode), **dampak**,
dan **rekomendasi**. Diurutkan berdasarkan prioritas.

> Ini adalah dokumen hidup. Perbarui saat gap ditutup atau muncul yang baru.

---

## Ringkasan Prioritas

| # | Gap | Kategori | Severity | Effort |
|---|---|---|:---:|:---:|
| G1 | Otorisasi berbasis role (RBAC) belum diterapkan di endpoint FHIR/tools | Keamanan | 🔴 Tinggi | Sedang |
| G2 | Data pasien (PHI/PII) tersimpan penuh di `delivery_logs` tanpa retensi/redaksi | Kepatuhan | 🔴 Tinggi | Sedang |
| G3 | Nama env secret tidak konsisten (`SECRET` vs `JWT_SECRET`) & tak ada `.env.example` | Konfigurasi | 🔴 Tinggi | Kecil |
| G4 | Tidak ada mekanisme bootstrap admin pertama | Operasional | 🟠 Sedang | Kecil |
| G5 | Validasi ID terlalu ketat (UUID v4) bisa menolak resource ID Satu Sehat yang sah | Korektnes | 🟠 Sedang | Kecil |
| G6 | Rate limit in-memory: tidak konsisten multi-instance, IP mudah dipalsukan | Keamanan/Skala | 🟠 Sedang | Sedang |
| G7 | CSP mengizinkan `unsafe-inline` & `unsafe-eval` | Keamanan | 🟠 Sedang | Sedang |
| G8 | Tidak ada test otomatis sama sekali | Kualitas | 🟠 Sedang | Besar |
| G9 | Dependensi runtime Python & DCMTK tidak terkelola (tak ada `requirements.txt`/pinning) | Operasional | 🟠 Sedang | Kecil |
| G10 | Prisma tanpa migration history (pakai `db push`/`init.sql` manual) | Operasional | 🟠 Sedang | Sedang |
| G11 | Audit log *fire-and-forget* bisa hilang diam-diam bila DB gagal | Keandalan | 🟡 Rendah | Kecil |
| G12 | Dokumentasi (README) tidak sinkron dengan kode | Dokumentasi | 🟡 Rendah | Kecil |
| G13 | `NEXT_PUBLIC_SATU_SEHAT_BASE_URL` dipakai tapi tidak diset | Bug kosmetik | 🟡 Rendah | Kecil |
| G14 | Tidak ada CI/CD & error monitoring terstruktur | Proses | 🟡 Rendah | Sedang |
| G15 | `/api/auth/register` tidak di-rate-limit | Keamanan | 🟡 Rendah | Kecil |

Legenda severity: 🔴 Tinggi · 🟠 Sedang · 🟡 Rendah.

---

## Detail Temuan

### G1 — Otorisasi berbasis role (RBAC) belum diterapkan 🔴

**Bukti.** Semua route FHIR (`app/api/fhir/[resource]/route.ts`,
`app/api/fhir/[resource]/[id]/route.ts`) dan tools (`app/api/tools/**`) hanya
memeriksa **keberadaan sesi**:

```ts
const session = await getSession();
if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
```

`session.role` hanya dicek di satu tempat: `app/api/auth/register/route.ts`.

**Dampak.** Setiap user terautentikasi (termasuk `operator`) dapat melakukan
POST/PUT/PATCH ke semua resource dan menjalankan seluruh utilitas DICOM. Tidak
ada pemisahan hak akses read-only vs read-write, maupun pembatasan per modul.

**Rekomendasi.**
- Buat helper `requireRole(session, [...])` dan terapkan per method/route.
- Definisikan matriks role→izin (mis. `operator` = POST/GET modul klinis;
  `admin` = semua + tools + register).
- Pertimbangkan memindahkan pengecekan ke satu wrapper (mis. `withAuth(handler, { roles })`).

---

### G2 — PHI/PII tersimpan penuh di `delivery_logs` 🔴

**Bukti.** `lib/dal/fhir.dal.ts` → `saveDeliveryLog` menyimpan **payload dan
response FHIR utuh** sebagai kolom `Json`:

```ts
payload: params.payload as object,
response: params.response as object,
```

Payload ini memuat data pribadi pasien (NIK 16 digit, nama, alamat, tanggal
lahir — lihat `lib/schemas/patient.schema.ts`). Truncation 10 KB di
`lib/utils/log.ts` hanya berlaku untuk log **client-side** (`sessionStorage`);
salinan **server-side** di database tidak dipangkas, tidak diredaksi, tidak
dienkripsi, dan tanpa kebijakan retensi/penghapusan.

**Dampak.** Risiko kepatuhan terhadap **UU No. 27/2022 tentang Pelindungan Data
Pribadi (PDP)** dan tata kelola data kesehatan. Kebocoran DB = kebocoran rekam
data pasien.

**Rekomendasi.**
- Redaksi/masking field sensitif (mis. NIK) sebelum disimpan, atau simpan hanya
  metadata + hash referensi.
- Terapkan kebijakan retensi (mis. purge otomatis > N hari) dan enkripsi at-rest.
- Batasi akses baca log lewat RBAC (lihat G1) dan audit siapa yang membacanya.

---

### G3 — Nama env secret tidak konsisten & tak ada `.env.example` 🔴

**Bukti.** Kode membaca `process.env.SECRET` (`lib/session.ts:14`) dan akan
*throw* bila tak ada:

```ts
const secret = process.env.SECRET;
if (!secret) throw new Error("SECRET tidak diset di environment");
```

Namun `README.md` mendokumentasikan variabel bernama `JWT_SECRET`. `README`
juga tidak menyebut `DATABASE_PASSWORD` (padahal `lib/db/prisma.ts` memerlukannya)
maupun `NEXT_PUBLIC_SATU_SEHAT_BASE_URL`. Tidak ada file `.env.example` di repo
(`.env*` di-*gitignore*).

**Dampak.** Mengikuti README apa adanya menghasilkan `SECRET` undefined →
aplikasi gagal saat sign/verify token. Onboarding rawan salah.

**Rekomendasi.**
- Samakan penamaan (pilih `SECRET` **atau** `JWT_SECRET`, konsisten di kode + docs).
- Tambahkan `.env.example` berisi **semua** key tanpa nilai rahasia. Daftar
  lengkap tersedia di [`ENVIRONMENT.md`](./ENVIRONMENT.md).
- Validasi env saat boot (mis. skema Yup/Zod) supaya gagal cepat dengan pesan jelas.

---

### G4 — Tidak ada bootstrap admin pertama 🟠

**Bukti.** `app/api/auth/register/route.ts` mensyaratkan pemanggil sudah login
sebagai `admin`. Tidak ada seed script, CLI, atau UI untuk membuat admin pertama.

**Dampak.** *Chicken-and-egg*: instalasi baru tidak punya admin, sehingga tidak
ada yang bisa membuat user apa pun. Saat ini harus insert manual ke DB.

**Rekomendasi.** Sediakan `prisma/seed.ts` atau script CLI
(`npm run create-admin`) yang membuat admin awal dengan bcrypt hash, dipandu env
atau prompt.

---

### G5 — Validasi ID UUID v4 bisa menolak ID Satu Sehat yang sah 🟠

**Bukti.** `lib/utils/security.ts` → `isValidUUID` mewajibkan **UUID versi 4**:

```ts
/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
```

Regex ini dipakai oleh `buildSafeApiUrl` dan route by-ID
(`app/api/fhir/[resource]/[id]/route.ts`). Bandingkan dengan
`lib/schemas/patient.schema.ts` yang memakai regex UUID **agnostik-versi**.

**Dampak.** Bila server FHIR/Satu Sehat mengembalikan resource ID yang bukan
UUID v4 (mis. v1/v5, atau format lain), operasi **GET/PUT/PATCH by ID** akan
ditolak `400 "ID tidak valid"` meski ID-nya sah. Ada juga inkonsistensi aturan
antara lapisan client (schema) dan server (route).

**Rekomendasi.** Longgarkan ke validasi UUID agnostik-versi (samakan dengan
schema), atau verifikasi asumsi bahwa Satu Sehat selalu memakai v4 sebelum
mempertahankan aturan ketat. Satukan satu sumber kebenaran regex UUID.

---

### G6 — Rate limit in-memory: tidak konsisten & IP mudah dipalsukan 🟠

**Bukti.** `lib/rate-limit.ts` menyimpan state di `const store = new Map()`
proses lokal, dan mengambil IP dari header:

```ts
request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ...
```

**Dampak.**
- **Multi-instance/serverless**: setiap instance punya penghitung sendiri →
  batas efektif berlipat, dan reset saat restart.
- **Spoofing**: `x-forwarded-for` dapat dipalsukan bila tidak ada proxy tepercaya
  yang menormalkannya, memungkinkan bypass rate limit.

**Rekomendasi.** Untuk produksi multi-instance, gunakan store bersama (mis.
Redis/Upstash). Tetapkan jumlah *trusted proxy hop* dan ambil IP dari sumber yang
tepercaya (mis. header dari reverse proxy Anda saja).

---

### G7 — CSP mengizinkan `unsafe-inline` & `unsafe-eval` 🟠

**Bukti.** `next.config.ts`:

```
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

**Dampak.** Melemahkan proteksi CSP terhadap XSS — inline script berbahaya masih
bisa dieksekusi bila ada celah injeksi. `unsafe-eval` memperluas permukaan serang.

**Rekomendasi.** Bergerak ke CSP berbasis **nonce/hash** untuk script; hapus
`unsafe-eval` bila memungkinkan (verifikasi tidak ada dependensi yang butuh
`eval`). Next.js mendukung nonce via middleware.

---

### G8 — Tidak ada test otomatis 🟠

**Bukti.** Tidak ada file `*.test.ts` / `*.spec.ts` di `src/`, tidak ada runner
test di `package.json` (`scripts` hanya `dev`, `build`, `start`, `lint`).

**Dampak.** Regressi mudah lolos, terutama pada logika keamanan sensitif:
validasi payload, rate limit, `buildSafeApiUrl`, alur token, dan skema Yup.

**Rekomendasi.** Mulai dari unit test bernilai tinggi & murah:
`validateFhirPayload`, `isValidUUID`, `buildSafeApiUrl`, `file-validation`,
`rate-limit`. Lalu integration test untuk route auth & FHIR (mock Satu Sehat).
Tambahkan Vitest/Jest + `npm test`.

---

### G9 — Dependensi Python & DCMTK tidak terkelola 🟠

**Bukti.** Endpoint tools memerlukan `python`/`python3` dengan `pydicom`,
`pillow`, `numpy`, serta binari DCMTK (`echoscu`, `storescu`) di PATH
(`app/api/tools/**`). Tidak ada `requirements.txt`, tidak ada version pinning,
dan instalasi DCMTK tidak terdokumentasi di README (README hanya menyebut paket
Python).

**Dampak.** Deploy rapuh — fitur DICOM gagal senyap di lingkungan tanpa
dependensi tersebut; sulit direproduksi antar mesin.

**Rekomendasi.** Tambahkan `scripts/requirements.txt` dengan versi terkunci,
dokumentasikan instalasi DCMTK per OS, dan pertimbangkan container (Docker)
yang menyertakan Python + DCMTK.

---

### G10 — Prisma tanpa migration history 🟠

**Bukti.** Schema disinkron via `prisma db push` / `db pull` dan `init.sql`
manual (`prisma/sql/init.sql`, README §3). Tidak ada folder `prisma/migrations`.

**Dampak.** Tidak ada riwayat perubahan skema yang dapat direview/di-rollback;
risiko *drift* antara DB dev, staging, dan produksi.

**Rekomendasi.** Adopsi `prisma migrate` (dev/deploy) sebagai sumber kebenaran
skema, atau formalkan `init.sql` sebagai migrasi bernomor bila tetap ingin SQL
manual.

---

### G11 — Audit log *fire-and-forget* bisa hilang 🟡

**Bukti.** `fhir.dal.sendToSatuSehat` menyimpan log tanpa `await` dan hanya
mencatat kegagalan ke console:

```ts
saveDeliveryLog({ ... }).catch((err) => console.error("[fhir.dal] Gagal simpan delivery log:", err));
```

**Dampak.** Bila DB sedang gangguan, entri audit hilang tanpa jejak yang
dapat ditindaklanjuti — padahal ini jalur audit.

**Rekomendasi.** Untuk audit kritis, pertimbangkan penulisan yang dijamin
(retry/queue) atau minimal metrik/alert saat penulisan log gagal.

---

### G12 — README tidak sinkron dengan kode 🟡

**Bukti (contoh).**
- README menandai **Organization** & **Practitioner** "belum ada halaman",
  padahal `src/app/organization/page.tsx` dan `src/app/practitioner/page.tsx`
  sudah ada.
- Method **Practitioner**: `lib/constants/modules.ts` = `["GET"]`, README =
  `POST GET PUT`.
- Bagian **Utilitas** README hanya menyebut "JPG → DICOM", padahal ada
  `dicom-router`, `patch-acsn`, `verify-dcm`, `dicom-echo`, `send-to-router`.
- Bagian **environment** README memakai `JWT_SECRET` (lihat G3) dan tak lengkap.

**Dampak.** Menyesatkan kontributor & operator baru.

**Rekomendasi.** Sinkronkan README dengan `FHIR_MODULES` dan daftar env aktual;
atau jadikan README menunjuk ke `docs/` sebagai sumber kebenaran.

---

### G13 — `NEXT_PUBLIC_SATU_SEHAT_BASE_URL` dipakai tapi tak diset 🟡

**Bukti.** `components/ui/DeliveryLogTable.tsx` memangkas base URL dari endpoint:

```ts
log.endpoint.replace(process.env.NEXT_PUBLIC_SATU_SEHAT_BASE_URL ?? "", "")
```

Variabel ini tidak ada di `.env` (hanya `NEXT_PUBLIC_SATU_SEHAT_ORG_ID` &
non-public `SATU_SEHAT_BASE_URL` yang ada).

**Dampak.** Kosmetik — endpoint pada tabel log ditampilkan penuh (tidak
terpangkas). Tidak memengaruhi fungsi.

**Rekomendasi.** Set `NEXT_PUBLIC_SATU_SEHAT_BASE_URL` di env, atau turunkan
tampilan dari data yang sudah ada tanpa env publik tambahan.

---

### G14 — Tidak ada CI/CD & error monitoring terstruktur 🟡

**Bukti.** Tidak ada workflow CI (mis. `.github/workflows`). Penanganan error
hanya `console.error`.

**Dampak.** Kualitas (lint/type-check/test) tidak dijaga otomatis sebelum merge;
insiden produksi sulit dilacak tanpa log/telemetri terpusat.

**Rekomendasi.** Tambahkan pipeline CI menjalankan `tsc --noEmit`, `lint`, dan
test. Integrasikan error tracking (mis. Sentry) + logging terstruktur.

---

### G15 — `/api/auth/register` tidak di-rate-limit 🟡

**Bukti.** Berbeda dengan `login`, route `register`
(`app/api/auth/register/route.ts`) tidak memanggil `checkRateLimit`.

**Dampak.** Terbatas karena sudah admin-gated, namun tetap sebaiknya konsisten
untuk mencegah penyalahgunaan (mis. enumerasi username via respons `409`).

**Rekomendasi.** Terapkan `checkRateLimit(request, RATE_LIMITS.api, "register")`.

---

## Yang Sudah Baik (agar tidak diregres)

- Pola **proxy server-side**: secret & token tidak pernah ke browser.
- **Timing-safe login** (bcrypt selalu dijalankan, dummy hash untuk user tak ada).
- **Cookie `HttpOnly` + JWT `jose`**, bukan token di `localStorage`.
- **`spawn` bukan `exec`** untuk semua proses eksternal (tanpa shell injection).
- **Validasi magic bytes** + batas ukuran untuk upload file.
- **Whitelist resource** & validasi payload FHIR (resourceType cocok, ≤ 1 MB).
- **Security headers** (HSTS, CSP, X-Frame-Options, dll.) terpasang.
- **Defense-in-depth**: middleware `proxy.ts` **dan** cek sesi per-route.

---

## Roadmap Ringkas (usulan urutan)

1. **Cepat & berdampak besar:** G3 (`.env.example` + samakan `SECRET`), G4
   (seed admin), G5 (longgarkan UUID), G13, G15.
2. **Keamanan & kepatuhan:** G1 (RBAC), G2 (retensi/redaksi PHI), G7 (CSP),
   G6 (rate limit bersama).
3. **Fondasi kualitas & operasional:** G8 (test), G9 (deps DICOM), G10
   (migrations), G14 (CI/CD), G11.
4. **Kebersihan:** G12 (sinkronkan README).
