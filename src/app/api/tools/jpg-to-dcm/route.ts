// src/app/api/tools/jpg-to-dcm/route.ts
// Konversi JPG → DICOM via Python script (pydicom)

import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { isValidJpeg } from "@/app/lib/utils/file-validation";

function runPython(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Coba "python" dulu, fallback ke "python3" jika gagal (di server)
    const proc = spawn("python", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Python exit code ${code}`));
    });
    proc.on("error", (err) => {
      // Jika "python" tidak ditemukan, coba "python3"
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const proc3 = spawn("python3", args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr3 = "";
        proc3.stderr?.on("data", (d: Buffer) => { stderr3 += d.toString(); });
        proc3.on("close", (code3) => {
          if (code3 === 0) resolve();
          else reject(new Error(stderr3.trim() || `Python3 exit code ${code3}`));
        });
        proc3.on("error", () =>
          reject(new Error("Python tidak ditemukan. Install Python 3 + pydicom + numpy + pillow."))
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

  let inputPath = "";
  let outputPath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const acsn = (formData.get("acsn") as string | null)?.trim() ?? "";
    const studyDate = (formData.get("studyDate") as string | null) ?? ""; // YYYY-MM-DD
    const studyTime = (formData.get("studyTime") as string | null) ?? ""; // HH:MM

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    if (!acsn) {
      return NextResponse.json({ error: "Accession Number wajib diisi" }, { status: 400 });
    }
    if (!file.name.match(/\.(jpg|jpeg)$/i)) {
      return NextResponse.json({ error: "Hanya file JPG/JPEG yang didukung" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 20 MB" }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    if (!isValidJpeg(fileBuffer)) {
      return NextResponse.json({ error: "File bukan JPEG yang valid (magic bytes tidak cocok)" }, { status: 400 });
    }

    // Konversi date/time ke format DICOM
    const dicomDate = studyDate ? studyDate.replace(/-/g, "") : "";
    const dicomTime = studyTime
      ? (() => {
          const [hh, mm] = studyTime.split(":");
          return `${hh}${mm}00.000000`;
        })()
      : "";

    // Tulis file sementara
    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    inputPath = join(tmpdir(), `dcm_in_${tempId}.jpg`);
    outputPath = join(tmpdir(), `dcm_out_${tempId}.dcm`);

    await writeFile(inputPath, fileBuffer);

    // Jalankan Python script
    const scriptPath = join(process.cwd(), "scripts", "jpg_to_dcm.py");
    const args = [scriptPath, inputPath, "--output", outputPath, "--acsn", acsn];
    if (dicomDate) args.push("--study-date", dicomDate);
    if (dicomTime) args.push("--study-time", dicomTime);

    await runPython(args);

    const dcmBuffer = await readFile(outputPath);

    // Kembalikan file DCM sebagai download
    const outName = file.name.replace(/\.(jpg|jpeg)$/i, ".dcm");
    return new NextResponse(dcmBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/dicom",
        "Content-Disposition": `attachment; filename="${outName}"`,
        "X-File-Name": outName,
      },
    });
  } catch (err) {
    console.error("[jpg-to-dcm] error:", err);
    const msg = err instanceof Error ? err.message : "Konversi gagal";
    return NextResponse.json(
      { error: msg },
      { status: 500 },
    );
  } finally {
    // Bersihkan file sementara
    await Promise.all([
      inputPath ? unlink(inputPath).catch(() => {}) : Promise.resolve(),
      outputPath ? unlink(outputPath).catch(() => {}) : Promise.resolve(),
    ]);
  }
}
