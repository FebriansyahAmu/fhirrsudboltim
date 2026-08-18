# Dokumentasi — FHIR RSUD BOLTIM

Dokumentasi internal untuk **dashboard integrasi FHIR R4 ke Satu Sehat Kemenkes RI**.
Dokumen di sini bersifat teknis dan ditujukan untuk developer & operator.

## Daftar Dokumen

| Dokumen | Isi |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arsitektur sistem: lapisan, alur request, auth/sesi, manajemen token OAuth2, model data, utilitas DICOM. |
| [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md) | Analisis kesenjangan: temuan keamanan, kepatuhan, keandalan, kualitas — lengkap dengan bukti kode, dampak, dan rekomendasi berprioritas. |
| [`ENVIRONMENT.md`](./ENVIRONMENT.md) | Daftar lengkap & akurat variabel environment (hasil telusur kode), plus usulan `.env.example`. |

> `README.md` di root proyek adalah dokumen pengantar/setup. Jika ada
> perbedaan detail, dokumen di `docs/` mengikuti kondisi kode terkini
> (lihat `GAP-ANALYSIS.md` G12 tentang README yang perlu disinkronkan).

## Ringkasan Cepat

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Prisma 7 +
  MariaDB/MySQL, Tailwind CSS 4, `jose` (JWT), Yup, Python + DCMTK (DICOM).
- **Pola inti:** browser → **API Route internal (proxy)** → Satu Sehat. Secret
  & token tidak pernah menyentuh browser; setiap request FHIR diaudit ke DB.
- **Temuan prioritas tinggi saat ini:** RBAC belum diterapkan (G1), PHI
  tersimpan penuh di log (G2), inkonsistensi env `SECRET`/`JWT_SECRET` (G3).
  Detail di [`GAP-ANALYSIS.md`](./GAP-ANALYSIS.md).

---

_Terakhir diperbarui: 18 Agustus 2026 · branch `main`._
