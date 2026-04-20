// src/app/api/tools/send-to-router/route.ts
// Kirim file .dcm ke DICOM Router via storescu (DCMTK)

import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import { getSession } from "@/app/lib/session";
import dicomRouterConfig from "@/app/lib/config/dicom-router.config";

export type { DicomRouterConfig as RouterConfig } from "@/app/lib/config/dicom-router.config";

// spawn — bukan exec, tidak ada shell, tidak ada injection risk
function runStorescu(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("storescu", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`storescu exit ${code}:\n${(stderr || stdout).trim()}`));
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(
          "storescu tidak ditemukan. Install DCMTK dan pastikan storescu ada di PATH."
        ));
      } else {
        reject(err);
      }
    });
  });
}

// GET — expose config router untuk ditampilkan di UI
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(dicomRouterConfig);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    tempPath = join(tmpdir(), `dcm_send_${tempId}.dcm`);
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    const { host, port, aeTitle } = dicomRouterConfig;

    const { stdout, stderr } = await runStorescu([
      "--call", aeTitle,
      host, port,
      tempPath,
    ]);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      stdout,
      stderr,
      router: dicomRouterConfig,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengirim ke DICOM Router";
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (tempPath) await unlink(tempPath).catch(() => {});
  }
}
