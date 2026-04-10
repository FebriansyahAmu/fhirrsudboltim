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
