// app/api/auth/register/route.ts
// POST /api/auth/register — buat akun operator baru
//
// Body JSON:
//   { "username": "string", "password": "string", "role": "operator" | "admin" }
//
// Role bersifat opsional, default: "operator"
// Endpoint ini sebaiknya diproteksi di production (hanya admin yang bisa akses)

import { NextRequest, NextResponse } from "next/server";
import { createUser, isUsernameTaken } from "@/app/lib/dal/auth.dal";
import { getSession } from "@/app/lib/session";

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,50}$/;
const ALLOWED_ROLES = new Set(["operator", "admin"]);

export async function POST(request: NextRequest) {
  // Hanya admin yang boleh register user baru
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Hanya admin yang dapat mendaftarkan user" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body tidak valid" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Body harus berupa JSON object" }, { status: 400 });
  }

  const { username, password, role } = body as Record<string, unknown>;

  // Validasi username
  if (typeof username !== "string" || !USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      { error: "Username harus 3-50 karakter, hanya huruf, angka, dan underscore" },
      { status: 400 },
    );
  }

  // Validasi password
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    return NextResponse.json(
      { error: "Password minimal 8 karakter" },
      { status: 400 },
    );
  }

  // Validasi role
  if (role !== undefined && (typeof role !== "string" || !ALLOWED_ROLES.has(role))) {
    return NextResponse.json(
      { error: "Role tidak valid. Gunakan: operator | admin" },
      { status: 400 },
    );
  }

  // Cek duplikat username
  const taken = await isUsernameTaken(username);
  if (taken) {
    return NextResponse.json({ error: "Username sudah digunakan" }, { status: 409 });
  }

  const user = await createUser({
    username,
    password,
    role: (role as "operator" | "admin") ?? "operator",
  });

  return NextResponse.json(
    {
      message: "User berhasil dibuat",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_at: user.created_at,
      },
    },
    { status: 201 },
  );
}
