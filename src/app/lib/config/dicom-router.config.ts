// src/app/lib/config/dicom-router.config.ts
// Konfigurasi koneksi DICOM Router (storescu / DCMTK)

export interface DicomRouterConfig {
  host: string;
  port: string;
  aeTitle: string;
}

const dicomRouterConfig: DicomRouterConfig = {
  host:    "127.0.0.1",
  port:    "11112",
  aeTitle: "DCMROUTER",
};

export default dicomRouterConfig;
