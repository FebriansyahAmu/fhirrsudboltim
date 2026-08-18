"use client";

import { useState } from "react";
import { LuChevronRight } from "react-icons/lu";
import Link from "next/link";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans">
      <TopBar
        title={title}
        collapsed={collapsed}
        onToggleSidebar={() => setCollapsed((c) => !c)}
        onMenuClick={() => setMobileOpen(true)}
      />

      <div className="flex flex-1">
        <Sidebar
          collapsed={collapsed}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 px-4 pt-4 sm:px-6 lg:px-8"
            >
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <LuChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-xs font-medium text-slate-400 transition-colors hover:text-teal-600"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-xs font-semibold text-slate-600">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}

          {/* Konten full-width, responsif */}
          <main className="w-full flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
