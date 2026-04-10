// lib/types/fhir.ts
// FHIR R4 Resource Types untuk Satu Sehat Integration

export type FhirResourceType =
  | "CarePlan"
  | "ClinicalImpression"
  | "Condition"
  | "Observation"
  | "Procedure"
  | "Encounter"
  | "Patient"
  | "Practitioner"
  | "Organization"
  | "MedicationRequest"
  | "AllergyIntolerance"
  | "EpisodeOfCare"
  | "DiagnosticReport"
  | "QuestionnaireResponse"
  | "ServiceRequest";

//CarePlan types
export type CarePlanStatus =
  | "draft"
  | "active"
  | "on-hold"
  | "revoked"
  | "completed"
  | "entered-in-error"
  | "unknown";

export type CarePlanIntent = "proposal" | "plan" | "order" | "option";
//------------------------------

export interface FhirCoding {
  system: string;
  code: string;
  display: string;
}

export interface FhirCodeableConcept {
  coding: FhirCoding[];
  text?: string;
}

export interface FhirReference {
  reference: string;
  display?: string;
}

//careplan payload,

export interface CarePlanPayload {
  resourceType: "CarePlan";
  id?: string;
  title: string;
  status: CarePlanStatus;
  intent: CarePlanIntent;
  description?: string;
  category: { coding: FhirCoding[] }[];
  subject: FhirReference;
  encounter: FhirReference;
  created: string;
  author: FhirReference;
}

export interface FhirOperationOutcome {
  resourceType: "OperationOutcome";
  issue: Array<{
    severity: "fatal" | "error" | "warning" | "information";
    code: string;
    diagnostics?: string;
    details?: { text: string };
  }>;
}

// ─────────────────────────────────────────────
// ClinicalImpression
// Ref: https://www.hl7.org/fhir/clinicalimpression.html
// ─────────────────────────────────────────────

/**
 * Status lifecycle ClinicalImpression sesuai FHIR R4.
 * - in-progress : Masih dalam proses penilaian
 * - completed   : Penilaian selesai
 * - entered-in-error : Data dimasukkan dengan keliru
 *
 */

export type ClinicalImpressionStatus =
  | "in-progress"
  | "completed"
  | "enteered-in-error";

/**
 * Payload ClinicalImpression yang dikirim ke Satu Sehat.
 * Setiap field opsional ditandai dengan "?" sesuai spesifikasi FHIR.
 */
export interface ClinicalImpressionPayload {
  resourceType: "ClinicalImpression";
  id?: string;
  status: ClinicalImpressionStatus;
  code: { coding: FhirCoding[] };
  subject: FhirReference;
  encounter: FhirReference;
  /**
   * Tanggal/waktu efektif penilaian.
   * Format: ISO 8601 dengan timezone (contoh: 2023-06-04T06:15:00+00:00)
   */
  effectiveDateTime: string;
  date: string;
  assessor: FhirReference;
  summary?: string;
}

// ─────────────────────────────────────────────
// AllergyIntolerance
// Ref: https://www.hl7.org/fhir/allergyintolerance.html
// ─────────────────────────────────────────────

/**
 * Status klinis alergi — apakah alergi masih aktif atau tidak.
 * - active   : Alergi masih berlaku
 * - inactive : Alergi tidak lagi relevan secara klinis
 * - resolved : Alergi sudah sembuh / tidak ada lagi
 */

export type AllergyIntoleranceClinicalStatus =
  | "active"
  | "inactive"
  | "resolved";

/**
 * Status verifikasi — seberapa yakin data alergi ini.
 * - unconfirmed  : Belum dikonfirmasi
 * - confirmed    : Sudah dikonfirmasi secara klinis
 * - refuted      : Ditolak / terbukti tidak alergi
 * - entered-in-error : Salah input
 */
export type AllergyIntoleranceVerificationStatus =
  | "unconfirmed"
  | "confirmed"
  | "refuted"
  | "entered-in-error";

/**
 * Kategori alergen.
 * - food        : Makanan
 * - medication  : Obat-obatan
 * - environment : Lingkungan (debu, bulu, dll.)
 * - biologic    : Biologis (vaksin, produk darah, dll.)
 */
export type AllergyIntoleranceCategory =
  | "food"
  | "medication"
  | "environment"
  | "biologic";

/**
 * Identifier resource — digunakan untuk ID lokal dari sistem fasilitas.
 * Contoh: nomor rekam medis internal rumah sakit.
 */

export interface FhirIdentifier {
  system: string;
  use?: "official" | "usual" | "secondary" | "temp";
  /** Tipe identifier — digunakan untuk ACSN, MR, dll. */
  type?: { coding: Array<{ system: string; code: string }> };
  value: string;
}

export interface AllergyIntolerancePayload {
  resourceType: "AllergyIntolerance";
  id?: string;

  /**
   * Identifier lokal dari sistem fasilitas kesehatan.
   * System URI menggunakan Org_id: "http://sys-ids.kemkes.go.id/allergy/{ORG_ID}"
   */
  identifier?: FhirIdentifier[];

  clinicalStatus: { coding: FhirCoding[] };

  verificationStatus: { coding: FhirCoding[] };
  category?: AllergyIntoleranceCategory[];
  code: FhirCodeableConcept;
  patient: FhirReference;
  encounter?: FhirReference;

  /**
   * Tanggal alergi dicatat ke dalam rekam medis.
   * Format: ISO 8601 dengan timezone
   */
  recordedDate?: string;
  recorder?: FhirReference;
}

// ─────────────────────────────────────────────
// EpisodeOfCare
// Ref: https://www.hl7.org/fhir/episodeofcare.html
// ─────────────────────────────────────────────

/**
 * Status lifecycle EpisodeOfCare sesuai FHIR R4.
 *
 * - planned        : Direncanakan, belum dimulai
 * - waitlist       : Dalam antrian
 * - active         : Sedang berlangsung
 * - onhold         : Ditunda sementara
 * - finished       : Selesai dengan normal
 * - cancelled      : Dibatalkan
 * - entered-in-error: Salah input
 */
export type EpisodeOfCareStatus =
  | "planned"
  | "waitlist"
  | "active"
  | "onhold"
  | "finished"
  | "cancelled"
  | "entered-in-error";

/**
 * Periode waktu dengan tanggal mulai dan akhir.
 * Digunakan di EpisodeOfCare.period dan statusHistory.period.
 */
export interface FhirPeriod {
  /** Format: YYYY-MM-DD atau ISO 8601 datetime */
  start: string;
  /** Format: YYYY-MM-DD atau ISO 8601 datetime. Opsional jika masih berjalan. */
  end?: string;
}

/**
 * Satu entri riwayat status EpisodeOfCare.
 * Mencatat kapan status berubah dan dalam rentang waktu apa.
 */
export interface EpisodeOfCareStatusHistory {
  status: EpisodeOfCareStatus;
  period: FhirPeriod;
}

/**
 * Satu entri diagnosis dalam EpisodeOfCare.
 * Menghubungkan EpisodeOfCare dengan resource Condition.
 */
export interface EpisodeOfCareDiagnosis {
  /** Referensi ke resource Condition */
  condition: FhirReference;
  /**
   * Peran diagnosis dalam episode ini.
   * Sistem: http://terminology.hl7.org/CodeSystem/diagnosis-role
   * Contoh: "DD" (Discharged Diagnosis), "AD" (Admission Diagnosis)
   */
  role?: { coding: FhirCoding[] };
  /** Urutan prioritas diagnosis — 1 adalah primer */
  rank?: number;
}

/**
 * Payload EpisodeOfCare yang dikirim ke Satu Sehat.
 * Sesuai FHIR R4 — field opsional ditandai "?".
 */
export interface EpisodeOfCarePayload {
  resourceType: "EpisodeOfCare";
  /** ID resource — wajib untuk PUT/PATCH */
  id?: string;

  /**
   * Identifier lokal dari sistem fasilitas.
   * System URI: "http://sys-ids.kemkes.go.id/episode-of-care/{ORG_ID}"
   */
  identifier?: FhirIdentifier[];

  /** Status episode saat ini */
  status: EpisodeOfCareStatus;

  /**
   * Riwayat perubahan status beserta periode waktunya.
   * Urutan kronologis — entri terbaru di akhir array.
   */
  statusHistory?: EpisodeOfCareStatusHistory[];

  /**
   * Tipe episode perawatan.
   * Sistem: http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type
   * Contoh: "TB-SO" (Tuberkulosis Sensitif Obat)
   */
  type?: { coding: FhirCoding[] }[];

  /** Daftar diagnosis yang terkait dengan episode ini */
  diagnosis?: EpisodeOfCareDiagnosis[];

  /** Referensi pasien pemilik episode ini */
  patient: FhirReference;

  /**
   * Referensi organisasi / fasilitas yang mengelola episode.
   * Biasanya menggunakan Org_id dari env.
   */
  managingOrganization?: FhirReference;

  /** Periode keseluruhan episode — dari mulai hingga selesai */
  period?: FhirPeriod;

  /** Dokter/praktisi yang bertanggung jawab mengelola episode */
  careManager?: FhirReference;
}

// ─────────────────────────────────────────────
// QuestionnaireResponse
// Ref: https://www.hl7.org/fhir/questionnaireresponse.html
// ─────────────────────────────────────────────

/**
 * Status QuestionnaireResponse sesuai FHIR R4.
 * - in-progress    : Sedang dikerjakan, belum selesai
 * - completed      : Sudah selesai diisi
 * - amended        : Sudah selesai lalu diubah
 * - entered-in-error: Salah input
 * - stopped        : Dihentikan sebelum selesai
 */
export type QuestionnaireResponseStatus =
  | "in-progress"
  | "completed"
  | "amended"
  | "entered-in-error"
  | "stopped";

/**
 * Nilai jawaban untuk item bertipe valueCoding.
 * Sistem: http://terminology.kemkes.go.id/CodeSystem/clinical-term
 * Contoh kode: "OV000052" (Sesuai), "OV000053" (Tidak Sesuai)
 */
export interface QuestionnaireAnswerCoding {
  valueCoding: {
    system: string;
    code: string;
    display: string;
  };
}

/** Nilai jawaban untuk item bertipe boolean (ya/tidak) */
export interface QuestionnaireAnswerBoolean {
  valueBoolean: boolean;
}

/** Nilai jawaban untuk item bertipe referensi ke resource FHIR lain */
export interface QuestionnaireAnswerReference {
  valueReference: {
    reference: string;
  };
}

/** Union type semua kemungkinan tipe jawaban dalam QuestionnaireResponse */
export type QuestionnaireAnswer =
  | QuestionnaireAnswerCoding
  | QuestionnaireAnswerBoolean
  | QuestionnaireAnswerReference;

/**
 * Satu item dalam QuestionnaireResponse.
 * Bisa berupa grup (punya `item` nested) atau leaf (punya `answer`).
 *
 * - Grup : linkId "1", "2", "3" — punya sub-item, tidak punya answer langsung
 * - Leaf : linkId "1.1", "1.2", dst — punya answer, tidak punya sub-item
 * - Mixed: linkId "4" — punya answer langsung (bukan sub-item)
 */
export interface QuestionnaireResponseItem {
  /** ID unik item dalam Questionnaire, e.g. "1", "1.1", "2.3" */
  linkId: string;
  /** Teks pertanyaan atau label grup */
  text: string;
  /** Sub-item (untuk item grup) */
  item?: QuestionnaireResponseItem[];
  /** Jawaban (untuk item leaf) */
  answer?: QuestionnaireAnswer[];
}

/**
 * Payload QuestionnaireResponse untuk Questionnaire Q0007 Satu Sehat.
 * Q0007 adalah form pengkajian resep farmasi dengan 3 kelompok persyaratan
 * dan 1 referensi ke MedicationRequest.
 */
export interface QuestionnaireResponsePayload {
  resourceType: "QuestionnaireResponse";
  /** ID resource — wajib untuk PUT/PATCH */
  id?: string;
  /**
   * URL Questionnaire yang dijawab.
   * Untuk Q0007: "https://fhir.kemkes.go.id/Questionnaire/Q0007"
   */
  questionnaire: string;
  status: QuestionnaireResponseStatus;
  /** Pasien yang menjadi subjek pengkajian */
  subject: FhirReference;
  /** Kunjungan terkait */
  encounter: FhirReference;
  /**
   * Tanggal dan waktu pengisian.
   * Format: ISO 8601 dengan timezone
   */
  authored: string;
  /** Apoteker / praktisi yang mengisi form */
  author: FhirReference;
  /**
   * Sumber informasi — biasanya sama dengan subject (pasien).
   * Bisa berbeda jika diisi oleh wali/keluarga.
   */
  source?: FhirReference;
  /** Daftar item jawaban — struktur nested sesuai Questionnaire */
  item: QuestionnaireResponseItem[];
}

// ─────────────────────────────────────────────
// Location
// Ref: https://www.hl7.org/fhir/location.html
// ─────────────────────────────────────────────

export type LocationStatus = "active" | "suspended" | "inactive";
export type LocationMode = "instance" | "kind";

/** Satu titik kontak (telepon, email, URL) */
export interface FhirContactPoint {
  system: "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";
  value: string;
  use?: "home" | "work" | "temp" | "old" | "mobile";
}

/** Koordinat GPS lokasi */
export interface LocationPosition {
  longitude: number;
  latitude: number;
  altitude?: number;
}

/**
 * Payload Location yang dikirim ke Satu Sehat.
 * Sesuai FHIR R4 — field opsional ditandai "?".
 */
export interface LocationPayload {
  resourceType: "Location";
  /** ID resource — wajib untuk PUT/PATCH */
  id?: string;
  /**
   * Identifier lokal dari sistem fasilitas.
   * System URI: "http://sys-ids.kemkes.go.id/location/{ORG_ID}"
   */
  identifier?: FhirIdentifier[];
  /** Status operasional lokasi */
  status: LocationStatus;
  /** Nama lokasi */
  name: string;
  /** Deskripsi lokasi */
  description?: string;
  /**
   * Mode lokasi.
   * - instance : Lokasi fisik nyata (paling umum)
   * - kind     : Template / tipe lokasi generik
   */
  mode?: LocationMode;
  /** Daftar kontak lokasi (telepon, email, URL) */
  telecom?: FhirContactPoint[];
  /**
   * Tipe fisik lokasi.
   * Sistem: http://terminology.hl7.org/CodeSystem/location-physical-type
   */
  physicalType?: { coding: FhirCoding[] };
  /** Koordinat GPS lokasi */
  position?: LocationPosition;
  /** Organisasi yang mengelola lokasi (Org_Poli) */
  managingOrganization?: FhirReference;
}

// ─────────────────────────────────────────────
// Encounter
// Ref: https://www.hl7.org/fhir/encounter.html
// ─────────────────────────────────────────────

export type EncounterStatus =
  | "planned"
  | "arrived"
  | "triaged"
  | "in-progress"
  | "onleave"
  | "finished"
  | "cancelled"
  | "entered-in-error";

/** Satu entri riwayat status dalam Encounter */
export interface EncounterStatusHistory {
  status: EncounterStatus;
  period: FhirPeriod;
}

/** Satu peserta kunjungan (dokter, perawat, dll.) */
export interface EncounterParticipant {
  /** Tipe peran peserta — dari CodeSystem v3-ParticipationType */
  type?: { coding: FhirCoding[] }[];
  /** Referensi ke resource Practitioner */
  individual?: FhirReference;
}

/** Lokasi pelayanan dalam Encounter */
export interface EncounterLocation {
  /** Referensi ke resource Location */
  location: FhirReference;
}

/**
 * Payload Encounter yang dikirim ke Satu Sehat.
 * Sesuai FHIR R4 — field opsional ditandai "?".
 */
export interface EncounterPayload {
  resourceType: "Encounter";
  /** ID resource — wajib untuk PUT/PATCH */
  id?: string;
  /**
   * Identifier lokal dari sistem fasilitas.
   * System URI: "http://sys-ids.kemkes.go.id/encounter/{ORG_ID}"
   */
  identifier?: FhirIdentifier[];
  /** Status encounter saat ini */
  status: EncounterStatus;
  /**
   * Kelas kunjungan — dari CodeSystem v3-ActCode.
   * Contoh: AMB (ambulatory), IMP (inpatient), EMER (emergency)
   */
  class: FhirCoding;
  /** Referensi pasien yang dikunjungi */
  subject: FhirReference;
  /** Daftar peserta kunjungan (dokter, perawat, dll.) */
  participant?: EncounterParticipant[];
  /** Periode kunjungan — mulai dan selesai */
  period?: FhirPeriod;
  /** Lokasi pelayanan */
  location?: EncounterLocation[];
  /** Riwayat perubahan status kunjungan */
  statusHistory?: EncounterStatusHistory[];
  /** Fasilitas kesehatan penyelenggara — menggunakan Org_id */
  serviceProvider?: FhirReference;
}

// ─────────────────────────────────────────────
// Patient
// Ref: https://www.hl7.org/fhir/patient.html
// Satu Sehat: https://fhir.kemkes.go.id/r4/StructureDefinition/Patient
// ─────────────────────────────────────────────

export type PatientGender = "male" | "female" | "other" | "unknown";
export type PatientNameUse = "official" | "usual" | "nickname" | "anonymous" | "old" | "maiden";
export type PatientAddressUse = "home" | "work" | "temp" | "old" | "billing";

export interface PatientName {
  use?: PatientNameUse;
  text: string;
}

/**
 * Extension administrativeCode khusus Satu Sehat.
 * Berisi kode wilayah administratif Indonesia (BPS/Kemendagri).
 */
export interface PatientAdministrativeCode {
  url: "https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode";
  extension: Array<{
    url: "province" | "city" | "district" | "village" | "rw" | "rt";
    valueCode: string;
  }>;
}

export interface PatientAddress {
  use?: PatientAddressUse;
  /** Array baris alamat (biasanya 1 baris) */
  line?: string[];
  city?: string;
  postalCode?: string;
  /** Kode negara ISO 3166 — "ID" untuk Indonesia */
  country?: string;
  extension?: PatientAdministrativeCode[];
}

/** Satu kontak darurat / keluarga pasien */
export interface PatientContact {
  relationship?: Array<{
    coding: Array<{ system: string; code: string }>;
  }>;
  name?: { use?: string; text: string };
  telecom?: Array<{
    system: "phone" | "fax" | "email" | "sms" | "other";
    value: string;
    use?: "home" | "work" | "temp" | "old" | "mobile";
  }>;
}

/** Bahasa komunikasi pasien */
export interface PatientCommunication {
  language: FhirCodeableConcept;
  preferred?: boolean;
}

/**
 * Payload Patient yang dikirim ke Satu Sehat.
 * Sesuai FHIR R4 + profil Satu Sehat.
 * Field opsional ditandai "?".
 */
export interface PatientPayload {
  resourceType: "Patient";
  id?: string;
  /** Profile URL Satu Sehat — disertakan saat POST */
  meta?: { profile: string[] };
  /** Identifier: NIK (wajib untuk registrasi awal) + opsional lainnya */
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: PatientName[];
  gender?: PatientGender;
  /** Format: YYYY-MM-DD */
  birthDate?: string;
  deceasedBoolean?: boolean;
  address?: PatientAddress[];
  maritalStatus?: FhirCodeableConcept;
  /** 0 = bukan kembar; ≥1 = nomor urut kelahiran kembar */
  multipleBirthInteger?: number;
  contact?: PatientContact[];
  communication?: PatientCommunication[];
}

// ─────────────────────────────────────────────
// ServiceRequest
// Ref: https://www.hl7.org/fhir/servicerequest.html
// Digunakan untuk permintaan pemeriksaan radiologi ke Satu Sehat.
// ─────────────────────────────────────────────

export type ServiceRequestStatus =
  | "draft"
  | "active"
  | "on-hold"
  | "revoked"
  | "completed"
  | "entered-in-error"
  | "unknown";

export type ServiceRequestIntent =
  | "proposal"
  | "plan"
  | "directive"
  | "order"
  | "original-order"
  | "reflex-order"
  | "filler-order"
  | "instance-order"
  | "option";

export type ServiceRequestPriority = "routine" | "urgent" | "asap" | "stat";

/**
 * Satu entri orderDetail — modality (DICOM) atau AE title.
 * Field coding bisa partial: modality memiliki code tapi tidak display;
 * AE title memiliki display tapi tidak code.
 */
export interface ServiceRequestOrderDetail {
  coding: Array<{ system?: string; code?: string; display?: string }>;
  text?: string;
}

/**
 * Payload ServiceRequest yang dikirim ke Satu Sehat.
 * Digunakan untuk permintaan pemeriksaan radiologi.
 * Sesuai FHIR R4 — field opsional ditandai "?".
 */
export interface ServiceRequestPayload {
  resourceType: "ServiceRequest";
  /** ID resource — wajib untuk PUT/PATCH */
  id?: string;
  /**
   * Dua identifier:
   * [0] Nomor ServiceRequest lokal (system: sys-ids.kemkes.go.id/servicerequest/{Org_id})
   * [1] Nomor ACSN (use: usual, type: ACSN, system: sys-ids.kemkes.go.id/acsn/{Org_id})
   */
  identifier?: FhirIdentifier[];
  /** Status permintaan */
  status: ServiceRequestStatus;
  /** Intent permintaan — biasanya "original-order" untuk order radiologi */
  intent: ServiceRequestIntent;
  /** Prioritas — routine | urgent | asap | stat */
  priority?: ServiceRequestPriority;
  /**
   * Kategori permintaan.
   * Untuk radiologi: SNOMED 363679005 "Imaging"
   */
  category?: { coding: FhirCoding[] }[];
  /**
   * Kode prosedur — pair LOINC + KPTL.
   * LOINC: kode internasional (e.g. 38036-0 "US Kidney")
   * KPTL: kode tarif nasional Satu Sehat (e.g. 31537 "USG Ginjal")
   */
  code: FhirCodeableConcept;
  /**
   * Detail order — modality DICOM + AE title.
   * [0] Modality code (US, CT, MR, CR, dll.)
   * [1] AE title perangkat (e.g. US0001)
   */
  orderDetail?: ServiceRequestOrderDetail[];
  /** Pasien yang diperiksa */
  subject: FhirReference;
  /** Encounter terkait */
  encounter: FhirReference;
  /** Tanggal/waktu rencana pemeriksaan — ISO 8601 */
  occurrenceDateTime?: string;
  /** Tanggal/waktu order dibuat — ISO 8601 */
  authoredOn?: string;
  /** Dokter pengirim permintaan */
  requester?: FhirReference;
  /** Radiolog/praktisi yang akan melakukan pemeriksaan */
  performer?: FhirReference[];
  /** Area tubuh yang diperiksa — SNOMED CT */
  bodySite?: { coding: FhirCoding[] }[];
  /** Alasan/diagnosis — ICD-10 */
  reasonCode?: { coding: FhirCoding[] }[];
  /** Referensi pendukung (Observation, AllergyIntolerance, Procedure) */
  supportingInfo?: FhirReference[];
}

/**
 * Kode jawaban valueCoding untuk Q0007.
 * Digunakan untuk pertanyaan dengan pilihan "Sesuai" atau "Tidak Sesuai".
 */
export const QUESTIONNAIRE_CODING_ANSWERS = {
  SESUAI: {
    system: "http://terminology.kemkes.go.id/CodeSystem/clinical-term",
    code: "OV000052",
    display: "Sesuai",
  },
  TIDAK_SESUAI: {
    system: "http://terminology.kemkes.go.id/CodeSystem/clinical-term",
    code: "OV000053",
    display: "Tidak Sesuai",
  },
} as const;
