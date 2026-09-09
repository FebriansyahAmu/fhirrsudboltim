// app/api/users/[id]/route.ts
// PATCH  /api/users/:id — ubah role dan/atau reset password.
// DELETE /api/users/:id — hapus pengguna.
// 🔒 Hanya admin. Dengan pengaman anti self-lockout & FK (jejak aktivitas).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session";
import {
  getUserById,
  updateUserRole,
  updateUserPassword,
  deleteUser,
} from "@/app/lib/dal/auth.dal";

const ALLOWED_ROLES = new Set(["operator", "admin"]);

/** Gerbang admin — kembalikan sesi bila lolos, atau response error bila tidak. */
async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { error: "Tidak terautentikasi" },
        { status: 401 },
      ),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Hanya admin yang dapat mengelola pengguna" },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { session } = gate;
  const { id } = await params;

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
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
  const { role, password } = body as Record<string, unknown>;

  if (role === undefined && password === undefined) {
    return NextResponse.json(
      { error: "Tidak ada perubahan (role atau password wajib diisi)" },
      { status: 400 },
    );
  }

  // ── Ubah role ──
  if (role !== undefined) {
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role)) {
      return NextResponse.json(
        { error: "Role tidak valid. Gunakan: operator | admin" },
        { status: 400 },
      );
    }
    // Cegah self-lockout: admin tak boleh menurunkan role dirinya sendiri.
    if (id === session.userId && role !== "admin") {
      return NextResponse.json(
        { error: "Anda tidak dapat menurunkan role akun sendiri" },
        { status: 400 },
      );
    }
    await updateUserRole(id, role as "operator" | "admin");
  }

  // ── Reset password ──
  if (password !== undefined) {
    if (typeof password !== "string" || password.length < 8 || password.length > 200) {
      return NextResponse.json(
        { error: "Password minimal 8 karakter" },
        { status: 400 },
      );
    }
    await updateUserPassword(id, password);
  }

  const updated = await getUserById(id);
  return NextResponse.json({ message: "Pengguna diperbarui", user: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { session } = gate;
  const { id } = await params;

  if (id === session.userId) {
    return NextResponse.json(
      { error: "Anda tidak dapat menghapus akun sendiri" },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }

  // FK guard: log kirim & catatan mereferensikan user ini → tolak hapus
  // agar riwayat tetap utuh (relasi tak di-cascade).
  if (target.activityCount > 0) {
    return NextResponse.json(
      {
        error:
          "Pengguna memiliki riwayat aktivitas (log kirim/catatan) sehingga tidak dapat dihapus. Turunkan role menjadi operator bila perlu menonaktifkan akses.",
      },
      { status: 409 },
    );
  }

  await deleteUser(id);
  return NextResponse.json({ message: "Pengguna dihapus" });
}
