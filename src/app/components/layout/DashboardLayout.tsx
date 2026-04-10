"use client";

import { useState } from "react";
import Sidebar from "./Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function DashboardLayout({
  children,
  title,
  breadcrumbs,
}: DashboardLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* ── Mobile Top Bar ── */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-30">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Buka menu navigasi"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path
                d="M2 5H16M2 9H16M2 13H16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>

          {/* Logo mobile */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm">
              <span className="text-[10px] font-black text-white">1S</span>
            </div>
            {title && (
              <span className="text-sm font-semibold text-slate-800 truncate">
                {title}
              </span>
            )}
          </div>
        </header>

        {/* ── Breadcrumbs (Desktop) ── */}
        {breadcrumbs && (
          <div className="hidden lg:flex items-center gap-1.5 px-6 pt-4 pb-0">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M3 2L7 5L3 8"
                      stroke="#cbd5e1"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {crumb.href ? (
                  <a
                    href={crumb.href}
                    className="text-xs text-slate-400 hover:text-teal-600 transition-colors"
                  >
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-xs text-slate-600 font-medium">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* ── Main Content ── */}
        <main className="flex-1 p-4 lg:p-6 xl:p-8 max-w-screen-2xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
