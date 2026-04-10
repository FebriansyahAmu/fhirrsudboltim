// app/api/auth/login/route.ts
// POST /api/auth/login — verifikasi kredensial, set session cookie

import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, validatePassword } from "@/app/lib/dal/auth.dal";
import { setSessionCookie } from "@/app/lib/session";

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).username !== "string" ||
    typeof (body as Record<string, unknown>).password !== "string"
  ) {
    return NextResponse.json(
      { error: "Username dan password wajib diisi" },
      { status: 400 },
    );
  }

  const { username, password } = body as { username: string; password: string };

  // Batasi panjang input untuk mencegah DoS
  if (username.length > 100 || password.length > 200) {
    return NextResponse.json({ error: "Input tidak valid" }, { status: 400 });
  }

  const user = await getUserByUsername(username);

  // Selalu jalankan bcrypt.compare meski user tidak ada (mencegah timing attack)
  const dummyHash =
    "$2b$12$invalidhashinvalidhashinvalidhashinvalidhashinvalidhas";
  const passwordValid = user
    ? await validatePassword(password, user.password)
    : await validatePassword(password, dummyHash).then(() => false);

  if (!user || !passwordValid) {
    return NextResponse.json(
      { error: "Username atau password salah" },
      { status: 401 },
    );
  }

  await setSessionCookie({
    userId: user.id,
    username: user.username,
    role: user.role,
  });

  return NextResponse.json({ ok: true });
}
