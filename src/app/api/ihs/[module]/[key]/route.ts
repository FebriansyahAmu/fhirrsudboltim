// app/api/ihs/[module]/[key]/route.ts
// GET payload FHIR (draft) yang dirakit dari satu baris staging SIMGOS.
// 🔒 Read-only (SELECT). Terautentikasi + rate-limited. Untuk preview/autofill.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getModuleSpec } from "@/app/lib/ihs/registry";
import { getModulePayload } from "@/app/lib/ihs/module-sync";
import { getPatientCreatePayload } from "@/app/lib/ihs/patient.source";
import { resolveEncounterParticipant } from "@/app/lib/ihs/encounter-participant";
import {
  resolveEncounterSubject,
  resolvePatientRefByNopen,
} from "@/app/lib/ihs/encounter-subject";
import { resolveEncounterRefByNopen } from "@/app/lib/ihs/encounter-ref";
import { resolveLabRebuildByRefId } from "@/app/lib/ihs/lab-loinc";
import { subjectRefOf } from "@/app/lib/ihs/registry";
import type { DependsRef } from "@/app/lib/ihs/registry";

/** Referensi (string) pada payload utk sebuah dependensi; null bila kosong. */
function readRef(payload: Record<string, unknown>, dep: DependsRef): string | null {
  const val = payload[dep.refCol];
  if (!val || typeof val !== "object") return null;
  const isArr = dep.refPath.startsWith("$[");
  const obj = isArr ? (Array.isArray(val) ? val[0] : null) : val;
  if (!obj || typeof obj !== "object") return null;
  const ref = (obj as Record<string, unknown>).reference;
  return typeof ref === "string" && ref.trim() ? ref : null;
}

/** Set referensi Encounter pada payload sesuai bentuk path (objek / array). */
function writeRef(payload: Record<string, unknown>, dep: DependsRef, ref: string): void {
  payload[dep.refCol] = dep.refPath.startsWith("$[")
    ? [{ reference: ref }]
    : { reference: ref };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ module: string; key: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { module, key } = await params;
  const spec = getModuleSpec(module);
  if (!spec) {
    return NextResponse.json(
      { error: `Modul IHS '${module}' belum terdaftar` },
      { status: 404 },
    );
  }

  // Batasi bentuk key (alfanumerik/underscore/dash) — cegah nilai aneh.
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    return NextResponse.json({ error: "Key tidak valid" }, { status: 400 });
  }

  // source=master → rakit payload dari tabel SUMBER (alur POST manual),
  // bukan dari staging yang bisa kosong utk baris belum-terkirim.
  const source = request.nextUrl.searchParams.get("source");

  try {
    if (source === "master") {
      if (!spec.createFromMaster || spec.module !== "patient") {
        return NextResponse.json(
          { error: `Modul '${module}' tidak mendukung rakit dari sumber` },
          { status: 400 },
        );
      }
      const result = await getPatientCreatePayload(key);
      if (!result) {
        return NextResponse.json(
          { error: "Data pasien tidak ditemukan di master" },
          { status: 404 },
        );
      }
      return NextResponse.json(result);
    }

    const result = await getModulePayload(spec, key);
    if (!result) {
      return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
    }

    // Encounter: lengkapi subject (Pasien) & participant (DPJP) otomatis bila
    // kosong — Satu Sehat mewajibkan keduanya. Resolusi via JOIN ke SIMGOS
    // (read-only). Hanya mengisi bila belum ada; tidak menimpa.
    const enriched: string[] = [];
    if (spec.module === "encounter") {
      const payload = result.payload as Record<string, unknown>;

      // subject: kolom encounter.subject SIMGOS bisa BASI (null) bila Patient
      // di-POST setelah Encounter dibuat. Resolusi live via NORM → patient.id.
      const subj = payload.subject;
      const subjRef =
        subj && typeof subj === "object" && !Array.isArray(subj)
          ? (subj as Record<string, unknown>).reference
          : undefined;
      if (typeof subjRef !== "string" || !subjRef.trim()) {
        const subject = await resolveEncounterSubject(key);
        if (subject) {
          payload.subject = subject;
          enriched.push("subject");
        }
      }

      // participant (DPJP) — profil Kemkes mewajibkannya (RuleNumber 10336).
      const part = payload.participant;
      const hasPart = Array.isArray(part) && part.length > 0;
      if (!hasPart) {
        const participant = await resolveEncounterParticipant(key);
        if (participant) {
          payload.participant = participant;
          enriched.push("participant");
        }
      }
    }

    // Data klinis dependen-Encounter dgn referensi Encounter YATIM: resolusi
    // Encounter MILIK nopen-nya (mis. Encounter ranap yg sudah dibuat & dikirim)
    // dan isikan agar bisa dikirim. Tidak menimpa yg sudah ada.
    const encDeps = (
      Array.isArray(spec.dependsOn)
        ? spec.dependsOn
        : spec.dependsOn
          ? [spec.dependsOn]
          : []
    ).filter((d) => d.label === "Encounter");
    if (encDeps.length > 0 && result.nopen) {
      const payload = result.payload as Record<string, unknown>;
      for (const dep of encDeps) {
        if (readRef(payload, dep)) continue; // sudah ada, jangan timpa
        const encRef = await resolveEncounterRefByNopen(result.nopen);
        if (encRef) {
          writeRef(payload, dep, encRef);
          if (!enriched.includes("encounter")) enriched.push("encounter");
        }
      }
    }

    // Subject (Pasien) untuk resource klinis: kolom `subject`/`patient` bisa
    // BASI (null) bila Patient di-POST setelah baris klinis dibuat (trigger
    // memateralisasi subject hanya saat itu). Tanpa ini Satu Sehat menolak
    // ("Reference is mandatory : <Resource>.subject"). Resolusi live via
    // nopen → Patient/<id> (+display). Tidak menimpa; hanya bila kosong &
    // pasien sudah punya IHS id (kalau belum, biarkan → baris tetap menunggu).
    const subjRefSpec = subjectRefOf(spec);
    if (spec.module !== "encounter" && subjRefSpec && result.nopen) {
      const payload = result.payload as Record<string, unknown>;
      if (!readRef(payload, subjRefSpec)) {
        const subject = await resolvePatientRefByNopen(result.nopen);
        if (subject) {
          // Tulis objek subject PENUH ({reference, display}) — bukan hanya ref.
          payload[subjRefSpec.refCol] = subjRefSpec.refPath.startsWith("$[")
            ? [subject]
            : subject;
          if (!enriched.includes(subjRefSpec.refCol)) {
            enriched.push(subjRefSpec.refCol);
          }
        }
      }
    }

    // Observation LAB (jenis=6): tabel SIMGOS `parameter_hasil_to_loinc` rusak
    // (semua → placeholder 11477-7; sebagian tak termapping → code null → gagal
    // 10010). RAKIT ULANG dari peta kita (lab_loinc_map) untuk parameter yang
    // AKTIF & bernilai valid: override `code`, susun ulang `value` dari HASIL,
    // dan tambah `interpretation`. Forward-only — baris yang sudah terkirim tak
    // dikirim ulang; parameter yang belum di-katalog dibiarkan apa adanya.
    if (spec.module === "observation") {
      const [refId, jenis] = key.split("_");
      if (jenis === "6") {
        const payload = result.payload as Record<string, unknown>;
        const rb = await resolveLabRebuildByRefId(refId);
        if (rb) {
          payload.code = rb.code;
          delete payload.valueQuantity;
          delete payload.valueString;
          if (rb.valueQuantity) payload.valueQuantity = rb.valueQuantity;
          if (rb.valueString != null) payload.valueString = rb.valueString;
          if (rb.interpretation) payload.interpretation = rb.interpretation;
          else delete payload.interpretation;
          enriched.push("code");
        }
      }
    }

    // Medication: SIMGOS kerap gagal menghitung `ingredient[].strength.
    // denominator` → tersimpan {code:null, value:0, system:null} (setelah
    // sanitasi generik jadi {value:0} tanpa system). TIGA aturan menolaknya:
    //  (a) Rule 10028 "Invalid coding system" bila system null/kosong;
    //  (b) FHIR Ratio rat-1 "(numerator.empty() xor denominator.exists()) and
    //      (numerator.exists() or extension.exists())" — numerator & denominator
    //      WAJIB sama-sama ada → denominator tak boleh dibuang; dan
    //  (c) Rule 10028 juga menolak code UCUM tak sah (mis. "1" → "Code not found").
    // Perbaikan: bila denominator rusak (hilang / tanpa system valid / value<=0),
    // CERMIN unit numerator — salin `code` & `system` numerator (yang PASTI sah,
    // karena numerator sendiri lolos validasi) ke denominator; nilai denominator
    // dipertahankan bila >0, selain itu ikut nilai numerator (rasio 1). Ini persis
    // konvensi baris yang SUDAH diterima Satu Sehat (mis. "25 mg / 25 mg").
    // Numerator UCUM yang valid tidak disentuh.
    if (spec.module === "medication") {
      const payload = result.payload as Record<string, unknown>;
      const ings = payload.ingredient;
      if (Array.isArray(ings)) {
        for (const ing of ings) {
          if (!ing || typeof ing !== "object") continue;
          const strength = (ing as Record<string, unknown>).strength;
          if (!strength || typeof strength !== "object") continue;
          const st = strength as Record<string, unknown>;
          // Numerator harus punya code+system UCUM valid; kalau tidak, tak ada
          // acuan yang bisa dicermin → biarkan apa adanya (tak muncul di data).
          const num = st.numerator;
          if (!num || typeof num !== "object") continue;
          const numObj = num as Record<string, unknown>;
          const numCode = numObj.code;
          const numSys = numObj.system;
          const numVal = numObj.value;
          const numValidCode = typeof numCode === "string" && numCode.trim() !== "";
          const numValidSys = typeof numSys === "string" && numSys.trim() !== "";
          if (!numValidCode || !numValidSys) continue;

          const den = st.denominator;
          const denObj =
            den && typeof den === "object" ? (den as Record<string, unknown>) : null;
          const sys = denObj?.system;
          const code = denObj?.code;
          const val = denObj?.value;
          const validSys = typeof sys === "string" && sys.trim() !== "";
          const validCode = typeof code === "string" && code.trim() !== "";
          const validVal = typeof val === "number" && val > 0;
          if (!denObj || !validSys || !validCode || !validVal) {
            st.denominator = {
              value: validVal ? (val as number) : typeof numVal === "number" ? numVal : 1,
              code: numCode,
              system: numSys,
            };
            if (!enriched.includes("ingredient")) enriched.push("ingredient");
          }
        }
      }
    }

    return NextResponse.json(enriched.length ? { ...result, enriched } : result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
