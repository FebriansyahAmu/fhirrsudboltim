// lib/dal/auth.dal.ts
// Data Access Layer untuk autentikasi user

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "@/app/lib/db/prisma";
import type { users } from "@prisma/client";

// ─────────────────────────────────────────────
// Ambil user berdasarkan username
// ─────────────────────────────────────────────
export async function getUserByUsername(
  username: string,
): Promise<users | null> {
  return prisma.users.findUnique({
    where: { username },
  });
}

// ─────────────────────────────────────────────
// Validasi password — bandingkan plaintext vs hash
// ─────────────────────────────────────────────
export async function validatePassword(
  plaintext: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

// ─────────────────────────────────────────────
// Buat user baru — untuk endpoint register
// ─────────────────────────────────────────────
export interface CreateUserInput {
  username: string;
  password: string;
  role?: "operator" | "admin";
}

export async function createUser(
  input: CreateUserInput,
): Promise<Omit<users, "password">> {
  const hashedPassword = await bcrypt.hash(input.password, 12);

  const user = await prisma.users.create({
    data: {
      id: randomUUID(),
      username: input.username,
      password: hashedPassword,
      role: input.role ?? "operator",
    },
  });

  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

// ─────────────────────────────────────────────
// Cek apakah username sudah dipakai
// ─────────────────────────────────────────────
export async function isUsernameTaken(username: string): Promise<boolean> {
  const count = await prisma.users.count({ where: { username } });
  return count > 0;
}

// ─────────────────────────────────────────────
// Master Pengguna — daftar, ubah, hapus (admin only)
// ─────────────────────────────────────────────

/** User publik (tanpa password) + jumlah aktivitas (log kirim + catatan). */
export interface PublicUser {
  id: string;
  username: string;
  role: string;
  created_at: Date;
  updated_at: Date;
  /** Total baris yang mereferensikan user ini (FK) → penanda "punya jejak". */
  activityCount: number;
  deliveryCount: number;
}

/** Daftar semua user, admin dulu lalu terlama, beserta hitungan aktivitas. */
export async function listUsers(): Promise<PublicUser[]> {
  const rows = await prisma.users.findMany({
    orderBy: [{ role: "asc" }, { created_at: "asc" }],
    select: {
      id: true,
      username: true,
      role: true,
      created_at: true,
      updated_at: true,
      _count: { select: { delivery_logs: true, ihs_row_notes: true } },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    created_at: u.created_at,
    updated_at: u.updated_at,
    deliveryCount: u._count.delivery_logs,
    activityCount: u._count.delivery_logs + u._count.ihs_row_notes,
  }));
}

/** Ambil satu user (tanpa password) berdasarkan id. */
export async function getUserById(id: string): Promise<PublicUser | null> {
  const u = await prisma.users.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      created_at: true,
      updated_at: true,
      _count: { select: { delivery_logs: true, ihs_row_notes: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    created_at: u.created_at,
    updated_at: u.updated_at,
    deliveryCount: u._count.delivery_logs,
    activityCount: u._count.delivery_logs + u._count.ihs_row_notes,
  };
}

/** Ubah role user. */
export async function updateUserRole(
  id: string,
  role: "operator" | "admin",
): Promise<void> {
  await prisma.users.update({
    where: { id },
    data: { role, updated_at: new Date() },
  });
}

/** Reset password user (di-hash ulang, cost 12 seperti createUser). */
export async function updateUserPassword(
  id: string,
  newPassword: string,
): Promise<void> {
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.users.update({
    where: { id },
    data: { password: hashed, updated_at: new Date() },
  });
}

/** Hapus user. Pemanggil WAJIB memastikan tak ada FK (activityCount=0). */
export async function deleteUser(id: string): Promise<void> {
  await prisma.users.delete({ where: { id } });
}
