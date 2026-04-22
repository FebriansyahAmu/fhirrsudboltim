// src/app/api/tools/dicom-echo/route.ts
// Test koneksi ke DICOM Router via echoscu (DCMTK C-ECHO SCU)

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { getSession } from "@/app/lib/session";
import { getDicomRouterConfig } from "@/app/lib/config/dicom-router.config";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";

function runEchoscu(args: string[]): Promise<{ stdout: string; stderr: string; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn("echoscu", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      const durationMs = Date.now() - start;
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim(), durationMs });
      else reject(new Error(`echoscu exit ${code}:\n${(stderr || stdout).trim()}`));
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(
          "echoscu tidak ditemukan. Install DCMTK dan pastikan echoscu ada di PATH."
        ));
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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const router = getDicomRouterConfig();
  const { host, port, aeTitle } = router;

  try {
    const { stdout, stderr, durationMs } = await runEchoscu([
      "--call", aeTitle,
      host, port,
    ]);

    return NextResponse.json({
      success: true,
      durationMs,
      stdout,
      stderr,
      router,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal melakukan echo ke DICOM Router";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
