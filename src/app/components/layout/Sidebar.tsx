"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { FHIR_MODULES, MODULE_GROUPS } from "@/app/lib/constants/modules";
import type { ModuleGroup } from "@/app/lib/types/api";

// ─────────────────────────────────────────────
// Sub-komponen: Logo
// ─────────────────────────────────────────────
function Logo({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
      <div className="w-8 h-8 rounded-xl bg-linear-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-md shadow-teal-200 shrink-0">
        <span className="text-xs font-black text-white tracking-tight">1S</span>
      </div>
      {!collapsed && (
        <div>
          <p className="text-sm font-bold text-slate-800 leading-none">
            Satu Sehat
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wider uppercase">
            Integrasi FHIR R4
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-komponen: Nav Item
// ─────────────────────────────────────────────
interface NavItemProps {
  icon: string;
  name: string;
  desc: string;
  path: string;
  badge?: string;
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
}

function NavItem({
  icon,
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
      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group relative ${
        isActive
          ? "bg-teal-50 text-teal-700 shadow-sm shadow-teal-100"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
      }`}
      title={collapsed ? name : undefined}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-teal-500 rounded-r-full" />
      )}

      <span className="text-base shrink-0 leading-none">{icon}</span>

      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p
              className={`font-semibold text-[13px] leading-none ${isActive ? "text-teal-700" : "text-slate-700"}`}
            >
              {name}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{desc}</p>
          </div>
          {badge && badge !== "Active" && (
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
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
// Komponen Utama: Sidebar
// ─────────────────────────────────────────────
interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Tutup sidebar saat navigasi di mobile
  useEffect(() => {
    onMobileClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Tutup dengan Escape key
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

  // Prevent scroll saat drawer terbuka di mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const sidebarContent = (
    <aside
      className={`flex flex-col bg-white border-r border-slate-100 h-full transition-all duration-200 ${
        collapsed ? "w-17" : "w-64"
      }`}
      role="navigation"
      aria-label="Navigasi utama"
    >
      {/* Logo + Collapse button */}
      <div className="relative">
        <Logo collapsed={collapsed} />
        {/* Collapse toggle — hanya di desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            {collapsed ? (
              <path
                d="M2 6H10M2 2H10M2 10H10"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M2 6H10M2 2H7M2 10H7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Dashboard Link */}
      <div className="px-3 pt-4 pb-2">
        <NavItem
          icon="🏠"
          name="Dashboard"
          desc="Overview pengiriman"
          path="/dashboard"
          isActive={pathname === "/dashboard"}
          collapsed={collapsed}
        />
      </div>

      {/* Divider */}
      {!collapsed && (
        <div className="px-5 mb-2">
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            Modul FHIR
          </p>
        </div>
      )}

      {/* Module Groups */}
      <nav className="flex-1 px-3 space-y-4 overflow-y-auto pb-4">
        {MODULE_GROUPS.map((group: ModuleGroup) => {
          const groupModules = FHIR_MODULES.filter((m) => m.group === group);
          return (
            <div key={group}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                  {group}
                </p>
              )}
              {collapsed && <div className="h-px bg-slate-100 mx-1 my-2" />}
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
                    onClick={onMobileClose}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className={`border-t border-slate-100 ${collapsed ? "p-3" : "p-4"}`}>
        {collapsed ? (
          <div className="flex justify-center">
            <div className="w-8 h-8 rounded-full bg-linaer-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-xs font-bold text-teal-700">
              A
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-linaer-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-xs font-bold text-teal-700 shrink-0">
              A
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">
                Admin RS
              </p>
              <p className="text-[10px] text-slate-400 truncate">Development</p>
            </div>
            <div
              className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
              title="Online"
            />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* ── Desktop: fixed sidebar ── */}
      <div className="hidden lg:flex h-screen sticky top-0">
        {sidebarContent}
      </div>

      {/* ── Mobile: overlay drawer ── */}
      {/* Backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity duration-200 ${
          mobileOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
        onClick={onMobileClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <div
        className={`lg:hidden fixed inset-y-0 left-0 z-50 h-full transition-transform duration-300 ease-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
      >
        {/* Override collapsed jadi false di mobile */}
        <aside className="flex flex-col bg-white border-r border-slate-100 h-full w-72">
          {/* Logo + Close button untuk mobile */}
          <div className="relative">
            <Logo collapsed={false} />
            <button
              onClick={onMobileClose}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Tutup menu"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 2L12 12M12 2L2 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <div className="px-3 pt-4 pb-2">
            <NavItem
              icon="🏠"
              name="Dashboard"
              desc="Overview pengiriman"
              path="/dashboard"
              isActive={pathname === "/dashboard"}
              collapsed={false}
              onClick={onMobileClose}
            />
          </div>

          <div className="px-5 mb-2">
            <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Modul FHIR
            </p>
          </div>

          <nav className="flex-1 px-3 space-y-4 overflow-y-auto pb-4">
            {MODULE_GROUPS.map((group: ModuleGroup) => {
              const groupModules = FHIR_MODULES.filter(
                (m) => m.group === group,
              );
              return (
                <div key={group}>
                  <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    {group}
                  </p>
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
                        collapsed={false}
                        onClick={onMobileClose}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="border-t border-slate-100 p-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-teal-100 to-emerald-100 flex items-center justify-center text-xs font-bold text-teal-700">
                A
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Admin RS</p>
                <p className="text-[10px] text-slate-400">Development</p>
              </div>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
