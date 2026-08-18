"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useCallback } from "react";
import type { IconType } from "react-icons";
import {
  LuLayoutDashboard,
  LuStethoscope,
  LuUsers,
  LuPill,
  LuWrench,
  LuX,
} from "react-icons/lu";
import { FHIR_MODULES, MODULE_GROUPS } from "@/app/lib/constants/modules";
import type { ModuleGroup } from "@/app/lib/types/api";

// Ikon per grup modul
const GROUP_ICON: Record<ModuleGroup, IconType> = {
  Klinis: LuStethoscope,
  "Pasien & Praktisi": LuUsers,
  "Obat & Diagnosa": LuPill,
  Utilitas: LuWrench,
};

// ─────────────────────────────────────────────
// Nav Item
// ─────────────────────────────────────────────
interface NavItemProps {
  icon: IconType;
  name: string;
  desc: string;
  path: string;
  badge?: string;
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
}

function NavItem({
  icon: Icon,
  name,
  desc,
  path,
  badge,
  isActive,
  collapsed,
  onClick,
}: NavItemProps) {
  return (
    <Link
      href={path}
      onClick={onClick}
      title={collapsed ? name : undefined}
      aria-current={isActive ? "page" : undefined}
      className={`group relative flex items-center rounded-xl text-sm transition-all duration-150 ${
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2"
      } ${
        isActive
          ? "bg-teal-50 text-teal-700"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
      {/* Indikator aktif */}
      <span
        className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-teal-500 transition-opacity ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
      />

      <span
        className={`grid shrink-0 place-items-center rounded-lg transition-colors ${
          collapsed ? "h-9 w-9" : "h-8 w-8"
        } ${
          isActive
            ? "bg-teal-100/70 text-teal-700"
            : "text-slate-500 group-hover:bg-white group-hover:text-slate-700"
        }`}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>

      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[13px] font-semibold leading-tight ${
                isActive ? "text-teal-700" : "text-slate-700"
              }`}
            >
              {name}
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
              {desc}
            </span>
          </span>
          {badge && badge !== "Active" && (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                badge === "Beta"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {badge}
            </span>
          )}
        </>
      )}
    </Link>
  );
}

// ─────────────────────────────────────────────
// Isi navigasi (dipakai desktop & drawer mobile)
// ─────────────────────────────────────────────
function NavContent({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="px-3 pb-2 pt-4">
        <NavItem
          icon={LuLayoutDashboard}
          name="Dashboard"
          desc="Overview pengiriman"
          path="/dashboard"
          isActive={pathname === "/dashboard"}
          collapsed={collapsed}
          onClick={onNavigate}
        />
      </div>

      {!collapsed && (
        <p className="px-6 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-300">
          Modul FHIR
        </p>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6">
        {MODULE_GROUPS.map((group: ModuleGroup) => {
          const GroupIcon = GROUP_ICON[group];
          const groupModules = FHIR_MODULES.filter((m) => m.group === group);
          return (
            <div key={group}>
              {collapsed ? (
                <div className="mx-2 my-2 h-px bg-slate-100" />
              ) : (
                <p className="mb-1 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  <GroupIcon className="h-3 w-3" />
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {groupModules.map((mod) => (
                  <NavItem
                    key={mod.path}
                    icon={mod.icon}
                    name={mod.name}
                    desc={mod.desc}
                    path={mod.path}
                    badge={mod.badge}
                    isActive={pathname === mod.path}
                    collapsed={collapsed}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();

  // Tutup drawer saat navigasi
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Tutup dengan Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) onMobileClose();
    },
    [mobileOpen, onMobileClose],
  );
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Kunci scroll saat drawer terbuka
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {/* ── Desktop: sidebar sticky di bawah topbar ── */}
      <div className="sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 lg:block">
        <aside
          className={`flex h-full flex-col border-r border-slate-200/70 bg-white transition-[width] duration-200 ${
            collapsed ? "w-[74px]" : "w-64"
          }`}
          role="navigation"
          aria-label="Navigasi utama"
        >
          <NavContent collapsed={collapsed} pathname={pathname} />
        </aside>
      </div>

      {/* ── Mobile: drawer ── */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-y-0 left-0 z-50 h-full transition-transform duration-300 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
      >
        <aside className="flex h-full w-72 flex-col bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Image src="/ehis-logo.svg" alt="Logo eHIS" width={28} height={28} />
              <div className="leading-tight">
                <p className="text-sm font-bold text-slate-800">Satu Sehat</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                  Integrasi FHIR R4
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onMobileClose}
              aria-label="Tutup menu"
              className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <LuX className="h-4 w-4" />
            </button>
          </div>
          <NavContent
            collapsed={false}
            pathname={pathname}
            onNavigate={onMobileClose}
          />
        </aside>
      </div>
    </>
  );
}
