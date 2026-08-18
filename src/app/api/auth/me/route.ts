// app/api/auth/me/route.ts
// GET /api/auth/me — kembalikan info sesi user yang sedang login (untuk TopBar)

import { NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  return NextResponse.json({
    username: session.username,
    role: session.role,
  });
}
