"use client";

import type { HttpMethod } from "@/app/lib/types/api";
import { METHOD_CONFIG } from "@/app/lib/constants/modules";

interface ApiMethodTabsProps {
  methods: HttpMethod[];
  activeMethod: HttpMethod;
  onChange: (method: HttpMethod) => void;
}

const ACTIVE_STYLES: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 ring-2 ring-blue-200 shadow-sm",
  emerald: "bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200 shadow-sm",
  amber: "bg-amber-50 text-amber-700 ring-2 ring-amber-200 shadow-sm",
  violet: "bg-violet-50 text-violet-700 ring-2 ring-violet-200 shadow-sm",
  red: "bg-red-50 text-red-700 ring-2 ring-red-200 shadow-sm",
};

const INACTIVE_STYLES: Record<string, string> = {
  blue: "text-slate-500 hover:bg-blue-50/50 hover:text-blue-700",
  emerald: "text-slate-500 hover:bg-emerald-50/50 hover:text-emerald-700",
  amber: "text-slate-500 hover:bg-amber-50/50 hover:text-amber-700",
  violet: "text-slate-500 hover:bg-violet-50/50 hover:text-violet-700",
  red: "text-slate-500 hover:bg-red-50/50 hover:text-red-700",
};

export default function ApiMethodTabs({
  methods,
  activeMethod,
  onChange,
}: ApiMethodTabsProps) {
  return (
    <div
      className="flex items-center gap-1.5 bg-white rounded-2xl p-1.5 border border-slate-100 shadow-sm w-fit flex-wrap"
      role="tablist"
      aria-label="HTTP Method"
    >
      {methods.map((method) => {
        const isActive = method === activeMethod;
        const config = METHOD_CONFIG[method];
        const colorKey = config.color;

        return (
          <button
            key={method}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(method)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all duration-150 ${
              isActive ? ACTIVE_STYLES[colorKey] : INACTIVE_STYLES[colorKey]
            }`}
          >
            <span className="font-mono tracking-wider">{method}</span>
            <span
              className={`hidden sm:block font-medium transition-opacity ${
                isActive ? "opacity-60" : "opacity-0 group-hover:opacity-40"
              }`}
            >
              {config.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
