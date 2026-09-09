// app/api/users/route.ts
// GET /api/users — daftar semua pengguna (Master → Daftar Pengguna).
// 🔒 Hanya admin. Pembuatan akun baru memakai POST /api/auth/register.

import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import { listUsers } from "@/app/lib/dal/auth.dal";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Hanya admin yang dapat melihat daftar pengguna" },
      { status: 403 },
    );
  }

  const users = await listUsers();
  return NextResponse.json({ users, currentUserId: session.userId });
}
