// src/app/lib/config/dicom-router.config.ts
// Konfigurasi koneksi DICOM Router — dibaca dari env saat runtime, bukan saat build.
// Set via .env (development) atau environment variable sistem (production/Docker).
//
// Variabel yang dibutuhkan:
//   DICOM_ROUTER_HOST     — default: 127.0.0.1
//   DICOM_ROUTER_PORT     — default: 11112
//   DICOM_ROUTER_AE_TITLE — default: DCMROUTER

export interface DicomRouterConfig {
  host: string;
  port: string;
  aeTitle: string;
}

export function getDicomRouterConfig(): DicomRouterConfig {
  return {
    host:    process.env.DICOM_ROUTER_HOST     ?? "127.0.0.1",
    port:    process.env.DICOM_ROUTER_PORT     ?? "11112",
    aeTitle: process.env.DICOM_ROUTER_AE_TITLE ?? "DCMROUTER",
  };
}
