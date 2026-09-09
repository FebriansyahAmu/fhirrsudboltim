/**
 * app/master/pengguna/page.tsx
 *
 * Master → Daftar Pengguna. Panel admin untuk mengelola akun & akses:
 * daftar pengguna, buat akun, reset password, ubah role, hapus.
 * 🔒 Hanya admin (gerbang UI + API di-enforce server-side).
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LuUsersRound,
  LuShieldCheck,
  LuLoaderCircle,
  LuLock,
  LuArrowLeft,
} from "react-icons/lu";

import DashboardLayout from "@/app/components/layout/DashboardLayout";
import UserManagementPanel from "@/app/components/master/UserManagementPanel";
import { useCurrentUser } from "@/app/lib/hooks/useCurrentUser";

const TABS = [
  { key: "pengguna", label: "Daftar Pengguna", icon: LuUsersRound },
] as const;

export default function MasterPenggunaPage() {
  const { loading, isAdmin } = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pengguna");

  return (
    <DashboardLayout
      title="Master"
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Master" },
        { label: "Daftar Pengguna" },
      ]}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-teal-200 bg-linear-to-br from-teal-100 to-emerald-100 text-2xl shadow-sm">
              👥
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Master Pengguna
                </h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2 py-1 text-[10px] font-bold text-teal-700">
                  <LuShieldCheck className="h-3 w-3" />
                  Admin
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                Kelola akun, peran, dan akses pengguna sistem
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b border-slate-200">
          <div className="flex gap-1">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  role="tab"
                  aria-selected={active}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? "border-teal-500 text-teal-700"
                      : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700"
                  }`}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
            <LuLoaderCircle className="h-5 w-5 animate-spin" />
            <span className="text-sm">Memeriksa akses…</span>
          </div>
        ) : !isAdmin ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-sm">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-400">
              <LuLock className="h-7 w-7" />
            </span>
            <h2 className="text-lg font-bold text-slate-800">Akses Ditolak</h2>
            <p className="text-sm text-slate-500">
              Halaman Master Pengguna hanya dapat diakses oleh Administrator.
            </p>
            <Link
              href="/dashboard"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-teal-200 transition-colors hover:bg-teal-700"
            >
              <LuArrowLeft className="h-4 w-4" />
              Kembali ke Dashboard
            </Link>
          </div>
        ) : (
          tab === "pengguna" && <UserManagementPanel />
        )}
      </div>
    </DashboardLayout>
  );
}
