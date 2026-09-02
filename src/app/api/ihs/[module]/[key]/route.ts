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
import { resolveEncounterSubject } from "@/app/lib/ihs/encounter-subject";
import { resolveEncounterRefByNopen } from "@/app/lib/ihs/encounter-ref";
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

    return NextResponse.json(enriched.length ? { ...result, enriched } : result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal membaca data SIMGOS";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
