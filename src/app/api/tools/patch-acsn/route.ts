// src/app/api/tools/patch-acsn/route.ts
// Patch AccessionNumber (dan opsional StudyDescription) pada file .dcm yang sudah ada

import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { getSession } from "@/app/lib/session";

interface PatchResult {
  AccessionNumber: string | null;
  StudyDescription: string | null;
  SOPInstanceUID: string | null;
  error?: string;
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let tempIn = "";
  let tempOut = "";

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const acsn = (formData.get("acsn") as string | null)?.trim();
    const studyDescription = (formData.get("studyDescription") as string | null)?.trim() ?? "";

    if (!file) {
      return NextResponse.json({ error: "File tidak ditemukan" }, { status: 400 });
    }
    if (!file.name.match(/\.dcm$/i)) {
      return NextResponse.json({ error: "Hanya file .dcm yang didukung" }, { status: 400 });
    }
    if (!acsn) {
      return NextResponse.json({ error: "Accession Number wajib diisi" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Ukuran file maksimal 50 MB" }, { status: 400 });
    }

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tempIn  = join(tmpdir(), `dcm_patch_in_${tempId}.dcm`);
    tempOut = join(tmpdir(), `dcm_patch_out_${tempId}.dcm`);

    await writeFile(tempIn, Buffer.from(await file.arrayBuffer()));

    const scriptPath = join(process.cwd(), "scripts", "patch_acsn.py");
    const pythonArgs = [scriptPath, tempIn, tempOut, "--acsn", acsn];
    if (studyDescription) pythonArgs.push("--study-description", studyDescription);

    const stdout = await runPython(pythonArgs);
    const result: PatchResult = JSON.parse(stdout);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const dcmBuffer = await readFile(tempOut);
    const outName = file.name.replace(/\.dcm$/i, `_patched.dcm`);

    return new NextResponse(dcmBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/dicom",
        "Content-Disposition": `attachment; filename="${outName}"`,
        "X-Patch-AccessionNumber":  result.AccessionNumber  ?? "",
        "X-Patch-StudyDescription": result.StudyDescription ?? "",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal melakukan patch";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tempIn)  await unlink(tempIn).catch(() => {});
    if (tempOut) await unlink(tempOut).catch(() => {});
  }
}
