// app/api/fhir/[resource]/route.ts
// Entry point FHIR API — GET (list/search) dan POST (create)
//
// Request Flow:
//   Browser → route.ts → fhir.dal.ts → Satu Sehat API
//                               ↓
//                          prisma.ts (simpan log)

import { NextRequest, NextResponse } from "next/server";
import { sendToSatuSehat } from "@/app/lib/dal/fhir.dal";
import {
  writeBackPatientRecord,
  nikFromIdentifierParam,
} from "@/app/lib/dal/patient-writeback";
import { maybePractitionerGetWriteBack } from "@/app/lib/dal/practitioner-writeback";
import {
  handleEncounterPostResult,
  handleEncounterGetResult,
} from "@/app/lib/dal/encounter-writeback";
import {
  maybeClinicalWriteBack,
  handleClinicalPostResult,
} from "@/app/lib/dal/clinical-writeback";
import { maybeLabObservationWriteBack } from "@/app/lib/dal/lab-writeback";
import {
  maybeWriteBackSpecimenForServiceRequest,
  maybeMarkSpecimenSent,
} from "@/app/lib/dal/specimen-writeback";
import {
  maybeMarkServiceRequestSent,
  maybeEnsureSpecimenForServiceRequest,
} from "@/app/lib/dal/servicerequest-writeback";
import { maybeMarkObservationSent } from "@/app/lib/dal/observation-writeback";
import { maybeBuildEpisodeOfCareForCondition } from "@/app/lib/dal/episode-of-care-writeback";
import {
  maybeMarkMedicationSent,
  maybeWriteBackMedicationRefs,
} from "@/app/lib/dal/medication-writeback";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import {
  ALLOWED_RESOURCES,
  validateFhirPayload,
} from "@/app/lib/constants/fhir";

// ─────────────────────────────────────────────
// GET /api/fhir/[resource] — ambil list atau search
// ─────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  const { searchParams } = request.nextUrl;
  const queryParams: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  const result = await sendToSatuSehat({
    method: "GET",
    resourceType: resource,
    queryParams,
    userId: session.userId,
  });

  // Patient GET by NIK (2xx) → write-back data yang KOSONG di SIMGOS
  // (id/identifier/meta/name) untuk pasien yang terlanjur dikirim tanpa
  // dilengkapi. HANYA saat pencarian memang memakai NIK (identifier param),
  // ditautkan via NIK itu. Kegagalan tak membatalkan response ke client.
  const knownNik = nikFromIdentifierParam(queryParams.identifier);
  if (
    resource === "Patient" &&
    knownNik &&
    result.status >= 200 &&
    result.status < 300
  ) {
    try {
      const wb = await writeBackPatientRecord(result.data, { knownNik });
      if (wb) {
        console.log(
          `[patient GET writeback] nik=${wb.nik} cols=${wb.cols.join("+")} rows=${wb.updated}`,
        );
      }
    } catch (err) {
      console.error("[patient GET writeback] gagal update SIMGOS patient:", err);
    }
  }

  // Practitioner GET by NIK (2xx) → write-back id + name + meta + dst. ke SIMGOS
  // `practitioner` (kolom yang masih kosong), ditautkan via NIK (refId). Untuk
  // RESOLUSI id nakes dari Satu Sehat (Practitioner tak dibuat, hanya dicari).
  // Kegagalan tak membatalkan response ke client.
  await maybePractitionerGetWriteBack({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
    responseData: result.data,
  });

  // Resource KLINIS (GET search): bila client menyertakan ?module=&key= dan
  // hasilnya 2xx, write-back id + subject + encounter ke baris staging (IF null).
  // Bundle di-normalisasi → hanya diterapkan bila entry-nya tepat satu.
  await maybeClinicalWriteBack({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
    responseData: result.data,
    userId: session.userId,
  });

  // Encounter GET sukses & dapat id → tandai SELESAI catatan "kuning" (kalau ada).
  await handleEncounterGetResult({
    resource,
    status: result.status,
    responseData: result.data,
    userId: session.userId,
  });

  return NextResponse.json(result.data, { status: result.status });
}

// ─────────────────────────────────────────────
// POST /api/fhir/[resource] — buat resource baru
// ─────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "fhir");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Tidak terautentikasi" },
      { status: 401 },
    );
  }

  const { resource } = await params;

  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json(
      { error: "Resource type tidak diizinkan" },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const validationError = validateFhirPayload(payload, resource);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const result = await sendToSatuSehat({
    method: "POST",
    resourceType: resource,
    payload,
    userId: session.userId,
  });

  // Write-back data IHS ke SIMGOS untuk Patient yang berhasil dibuat (2xx):
  // id + identifier + meta + name (kolom yang masih kosong saja). Menautkan
  // baris via NIK. Kegagalan write-back tidak membatalkan response ke client.
  if (
    resource === "Patient" &&
    result.status >= 200 &&
    result.status < 300
  ) {
    try {
      const wb = await writeBackPatientRecord(result.data, { requestPayload: payload });
      if (wb) {
        console.log(
          `[patient writeback] nik=${wb.nik} id=${wb.ihsId ?? "-"} cols=${wb.cols.join("+")} rows=${wb.updated}`,
        );
      } else {
        console.warn(
          "[patient writeback] dilewati: NIK/data tidak dapat diekstrak dari response",
        );
      }
    } catch (err) {
      console.error("[patient writeback] gagal update SIMGOS patient:", err);
    }
  }

  // Encounter: write-back id ke SIMGOS bila sukses (2xx), atau catatan
  // "kuning" (warning) di DB kita bila gagal (4xx/5xx). Ditautkan via refId
  // (= identifier[0].value). Kegagalan proses ini tidak membatalkan response.
  if (resource === "Encounter") {
    try {
      await handleEncounterPostResult({
        status: result.status,
        responseData: result.data,
        requestPayload: payload,
        userId: session.userId,
      });
    } catch (err) {
      console.error("[encounter] gagal memproses hasil POST:", err);
    }
  }

  // Resource KLINIS: sukses (2xx) → write-back id + subject + encounter ke
  // staging (IF null); gagal (4xx/5xx) → catatan "kuning" di DB kita. Baris
  // ditautkan via (module,key) dari client (?module=&key=) — resource klinis
  // tak punya identifier untuk ditautkan dari response. Patient/Encounter punya
  // jalur sendiri. Dibungkus agar kegagalan proses ini tak memutus response.
  try {
    await handleClinicalPostResult({
      searchParams: request.nextUrl.searchParams,
      resource,
      status: result.status,
      responseData: result.data,
      userId: session.userId,
    });
  } catch (err) {
    console.error("[clinical] gagal memproses hasil POST:", err);
  }

  // Condition: sukses (2xx) → bila diagnosis UTAMA yang KODE-nya ter-map di
  // `diagnosa_to_eof`, bangun baris EpisodeOfCare (`eof`) via CALL proc
  // `episodeOfCare` (id Condition sudah ditulis handleClinicalPostResult di
  // atas). Menutup guard trigger `condition_after_update` yang null-unsafe
  // (`NEW.id != OLD.id` = NULL saat id NULL→uuid) → tanpa ini `eof` kosong.
  // Gerbang kelayakan & idempotensi ditangani di dalam fungsi.
  await maybeBuildEpisodeOfCareForCondition({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // Observation LAB (jenis=6): sukses (2xx) → write-back code/value/interpretation
  // hasil rakit-ulang ke SIMGOS `observation` agar staging konsisten dgn yang
  // dikirim ke Satu Sehat (bukan lagi 11477-7). No-op utk non-LAB. Tak memutus
  // response (fungsi sudah menangani error sendiri).
  await maybeLabObservationWriteBack({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // Observation lab/rad (jenis 6/7): sukses (2xx) → setel `observation.send = 0`
  // (id sudah ditulis handleClinicalPostResult di atas). Transisi send 1→0
  // memicu trigger SIMGOS `observation_after_update` membangun DiagnosticReport
  // yang hilang. Tanpa ini, DiagnosticReport tak pernah dibuat (berhenti ~31
  // Jul). Hanya jenis 6/7; jenis lain diabaikan. Fungsi menangani error sendiri.
  await maybeMarkObservationSent({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // ServiceRequest LAB: sukses (2xx) → propagasikan IHS id-nya ke `specimen.request`
  // (specimen.refId = SR.refId) agar Specimen bisa merujuk SR yang baru terkirim.
  // No-op utk SR non-LAB. Fungsi sudah menangani error sendiri.
  await maybeWriteBackSpecimenForServiceRequest({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
    responseData: result.data,
  });

  // ServiceRequest: sukses (2xx) → setel `service_request.send = 0` (id sudah
  // ditulis handleClinicalPostResult di atas). Transisi send 1→0 memicu trigger
  // SIMGOS `service_request_after_update` membangun Specimen (lab, JENIS=8) /
  // ImagingStudy (radiologi, JENIS=7) yang hilang — otomatis merujuk SR ini
  // karena id-nya sudah ada. Tanpa ini, specimen/imaging tak pernah dibuat
  // (berhenti sejak ~10 Agu). Trigger swa-gerbang JENIS; SR lain hanya ditandai
  // sent. Fungsi menangani error sendiri.
  await maybeMarkServiceRequestSent({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // ServiceRequest LAB tanpa petugas (performer null): trigger `service_request_
  // before_update` memaksa send=0 di setiap update, jadi flip di atas TAK
  // menghasilkan transisi 1→0 → trigger pembangun Specimen tak menyala & rantai
  // lab (Specimen→Observation→DiagnosticReport) putus. Pastikan Specimen ada via
  // INSERT langsung (menyalin persis statement trigger; no-op bila trigger sudah
  // membuatnya / SR bukan lab). Dipanggil SESUDAH flip send agar guard NOT EXISTS
  // menghormati specimen yang mungkin baru dibuat trigger. Menangani error sendiri.
  await maybeEnsureSpecimenForServiceRequest({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // Specimen: sukses (2xx) → setel `specimen.send = 0` (id sudah ditulis
  // handleClinicalPostResult di atas). Transisi send 1→0 memicu trigger SIMGOS
  // `specimen_after_update` → hasillabToObservation → membangun Observation
  // hasil lab yang hilang (lalu Observation memicu DiagnosticReport saat dikirim).
  // Tanpa ini, rantai lab terputus. Fungsi menangani error sendiri.
  await maybeMarkSpecimenSent({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // Medication: sukses (2xx) → setel `medication.send = 0` (id sudah ditulis
  // oleh handleClinicalPostResult di atas). Transisi send 1→0 memicu trigger
  // SIMGOS `medication_after_update` membangun baris MedicationRequest/Dispense
  // yang hilang (lengkap dgn medicationReference dari id terkini). Tanpa ini,
  // baris resep/penyerahan tak pernah dibuat. Fungsi menangani error sendiri.
  await maybeMarkMedicationSent({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
  });

  // Medication: sukses (2xx) → propagasikan IHS id-nya ke `medicationReference`
  // pada MedicationRequest & MedicationDispense (composite key sama) agar keduanya
  // bisa merujuk Medication yang baru terkirim. Pelengkap: memperbaiki referensi
  // basi pada baris hilir yang SUDAH ada (trigger EXISTS-path tak memperbaruinya).
  await maybeWriteBackMedicationRefs({
    searchParams: request.nextUrl.searchParams,
    resource,
    status: result.status,
    responseData: result.data,
  });

  return NextResponse.json(result.data, { status: result.status });
}
