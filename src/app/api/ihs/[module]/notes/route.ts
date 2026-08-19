// app/api/ihs/[module]/notes/route.ts
// Simpan/hapus anotasi operator (catatan + mark warna) per baris.
// ✍️ Menulis ke DB KITA sendiri (fhir_satusehat), bukan SIMGOS.
// Terautentikasi + rate-limited.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { checkRateLimit, RATE_LIMITS } from "@/app/lib/rate-limit";
import { getModuleSpec } from "@/app/lib/ihs/registry";
import {
  upsertNote,
  deleteNote,
  isValidMark,
  NOTE_MAX,
} from "@/app/lib/ihs/notes.dal";

const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

function guard(module: string) {
  return getModuleSpec(module);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { module } = await params;
  if (!guard(module)) {
    return NextResponse.json(
      { error: `Modul IHS '${module}' belum terdaftar` },
      { status: 404 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const key = String(body.key ?? "");
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: "Key tidak valid" }, { status: 400 });
  }

  // mark: null/kosong = tanpa warna; selain itu harus salah satu nilai valid.
  let mark: string | null = null;
  if (body.mark != null && body.mark !== "") {
    if (!isValidMark(body.mark)) {
      return NextResponse.json({ error: "Mark tidak valid" }, { status: 400 });
    }
    mark = body.mark;
  }

  let note: string | null = null;
  if (typeof body.note === "string" && body.note.trim() !== "") {
    note = body.note.trim().slice(0, NOTE_MAX);
  }

  const nik =
    typeof body.nik === "string" && body.nik.trim() !== ""
      ? body.nik.trim().slice(0, 32)
      : null;

  // Tidak ada isi sama sekali → perlakukan sebagai hapus.
  if (mark === null && note === null) {
    await deleteNote(module, key);
    return NextResponse.json({ ok: true, note: null });
  }

  try {
    const saved = await upsertNote({
      module,
      refKey: key,
      nik,
      mark,
      note,
      userId: session.userId,
    });
    return NextResponse.json({ ok: true, note: saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan catatan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ module: string }> },
) {
  const limited = checkRateLimit(request, RATE_LIMITS.api, "ihs");
  if (limited) return limited;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const { module } = await params;
  if (!guard(module)) {
    return NextResponse.json(
      { error: `Modul IHS '${module}' belum terdaftar` },
      { status: 404 },
    );
  }

  const key = request.nextUrl.searchParams.get("key") ?? "";
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ error: "Key tidak valid" }, { status: 400 });
  }

  try {
    await deleteNote(module, key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menghapus catatan";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
