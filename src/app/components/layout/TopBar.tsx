"use client";

import Image from "next/image";
import { LuMenu, LuPanelLeftClose, LuPanelLeftOpen } from "react-icons/lu";
import UserMenu from "./UserMenu";

interface TopBarProps {
  title?: string;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onMenuClick: () => void;
}

export default function TopBar({
  title,
  collapsed,
  onToggleSidebar,
  onMenuClick,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-slate-200/70 bg-white/85 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6">
      {/* Mobile: buka drawer */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Buka menu navigasi"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:hidden"
      >
        <LuMenu className="h-5 w-5" />
      </button>

      {/* Desktop: ciutkan / perluas sidebar */}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        className="hidden h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 lg:grid"
      >
        {collapsed ? (
          <LuPanelLeftOpen className="h-5 w-5" />
        ) : (
          <LuPanelLeftClose className="h-5 w-5" />
        )}
      </button>

      {/* Logo + brand */}
      <div className="flex items-center gap-2.5">
        <Image
          src="/ehis-logo.svg"
          alt="Logo eHIS"
          width={30}
          height={30}
          className="shrink-0"
          priority
        />
        <div className="leading-tight">
          <p className="text-sm font-bold text-slate-800">
            Satu Sehat <span className="text-teal-600">BOLTIM</span>
          </p>
          <p className="hidden text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 sm:block">
            Integrasi FHIR R4
          </p>
        </div>
      </div>

      {/* Judul halaman (desktop) */}
      {title && (
        <div className="hidden items-center gap-3 lg:flex">
          <span className="h-5 w-px bg-slate-200" />
          <span className="text-sm font-semibold text-slate-500">{title}</span>
        </div>
      )}

      {/* Kanan: user menu */}
      <div className="ml-auto flex items-center gap-1.5">
        <UserMenu />
      </div>
    </header>
  );
}
