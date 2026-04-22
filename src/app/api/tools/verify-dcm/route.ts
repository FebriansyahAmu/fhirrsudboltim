// src/app/api/tools/verify-dcm/route.ts
// Baca metadata DICOM dari file .dcm yang diupload

import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { isValidDicom } from "@/app/lib/utils/file-validation";

export interface DicomMeta {
  AccessionNumber: string | null;
  StudyDate: string | null;
  StudyTime: string | null;
  StudyDescription: string | null;
  Modality: string | null;
  BodyPartExamined: string | null;
  ViewPosition: string | null;
  SeriesDescription: string | null;
  StudyInstanceUID: string | null;
  SeriesInstanceUID: string | null;
  SOPInstanceUID: string | null;
  SOPClassUID: string | null;
  Manufacturer: string | null;
  ManufacturerModelName: string | null;
  StationName: string | null;
  InstitutionName: string | null;
  Rows: string | null;
  Columns: string | null;
  BitsAllocated: string | null;
  SamplesPerPixel: string | null;
  PhotometricInterpretation: string | null;
  TransferSyntaxUID: string | null;
}

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Python exit code ${code}`));
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const proc3 = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
        let out3 = "";
        let err3 = "";
        proc3.stdout?.on("data", (d: Buffer) => { out3 += d.toString(); });
        proc3.stderr?.on("data", (d: Buffer) => { err3 += d.toString(); });
        proc3.on("close", (c) => {
          if (c === 0) resolve(out3.trim());
          else reject(new Error(err3.trim() || `Python3 exit code ${c}`));
        });
        proc3.on("error", () =>
          reject(new Error("Python tidak ditemukan. Install Python 3 + pydicom."))
        );
      } else {
        reject(err);
      }
    });
  });
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMITS.tools, "tools");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let tempPath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    if (!file.name.match(/\.dcm$/i)) {
      return NextResponse.json({ error: "Hanya file .dcm yang didukung" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 50 MB" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (!isValidDicom(fileBuffer)) {
      return NextResponse.json({ error: "File bukan DICOM yang valid (magic bytes tidak cocok)" }, { status: 400 });
    }

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tempPath = join(tmpdir(), `dcm_verify_${tempId}.dcm`);

    await writeFile(tempPath, fileBuffer);

    const scriptPath = join(process.cwd(), "scripts", "read_dcm.py");
    const stdout = await runPython([scriptPath, tempPath]);

    const meta: DicomMeta & { error?: string } = JSON.parse(stdout);

    if (meta.error) {
      return NextResponse.json({ error: meta.error }, { status: 422 });
    }

    return NextResponse.json({ meta, fileName: file.name });
  } catch (err) {
    console.error("[verify-dcm] error:", err);
    const msg = err instanceof Error ? err.message : "Gagal membaca metadata";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => {});
  }
}
