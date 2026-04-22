"use client";

import { useState } from "react";
import type { ApiResponse } from "@/app/lib/types/api";
import { safeJsonStringify } from "@/app/lib/utils/security";

// ─────────────────────────────────────────────
// Status styling helpers
// ─────────────────────────────────────────────
function getStatusStyle(status: number | null) {
  if (!status) return { bg: "bg-slate-100", text: "text-slate-500", label: "" };
  if (status >= 200 && status < 300)
    return {
      bg: "bg-emerald-50 ring-1 ring-emerald-200",
      text: "text-emerald-700",
      label: "OK",
    };
  if (status === 400)
    return {
      bg: "bg-amber-50 ring-1 ring-amber-200",
      text: "text-amber-700",
      label: "Bad Request",
    };
  if (status === 401)
    return {
      bg: "bg-orange-50 ring-1 ring-orange-200",
      text: "text-orange-700",
      label: "Unauthorized",
    };
  if (status === 404)
    return {
      bg: "bg-amber-50 ring-1 ring-amber-200",
      text: "text-amber-700",
      label: "Not Found",
    };
  if (status === 422)
    return {
      bg: "bg-orange-50 ring-1 ring-orange-200",
      text: "text-orange-700",
      label: "Unprocessable",
    };
  if (status >= 500)
    return {
      bg: "bg-red-50 ring-1 ring-red-200",
      text: "text-red-700",
      label: "Server Error",
    };
  return { bg: "bg-slate-100", text: "text-slate-600", label: "" };
}

// ─────────────────────────────────────────────
// JSON Syntax Highlighter — AMAN, tidak gunakan innerHTML
// Render dengan React nodes, bukan dangerouslySetInnerHTML
// ─────────────────────────────────────────────
function JsonHighlight({ code }: { code: string }) {
  const lines = code.split("\n");

  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="select-none text-slate-300 text-right pr-4 min-w-10 shrink-0 tabular-nums">
            {i + 1}
          </span>
          <span className="flex-1 break-all">
            <JsonLine line={line} />
          </span>
        </div>
      ))}
    </div>
  );
}

function JsonLine({ line }: { line: string }) {
  // Tokenize dengan regex — output sebagai React elements, BUKAN HTML string
  const tokens: { text: string; cls: string }[] = [];
  let remaining = line;

  const patterns: [RegExp, string][] = [
    [/^("(?:[^"\\]|\\.)*")\s*:/, "key"], // JSON key
    [/^("(?:[^"\\]|\\.)*")/, "string"], // string value
    [/^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/, "number"], // number
    [/^(true|false)/, "boolean"], // boolean
    [/^(null)/, "null"], // null
    [/^([{}[\],])/, "punctuation"], // brackets
    [/^(\s+)/, "whitespace"], // whitespace
    [/^([^\s"{}[\],]+)/, "other"], // fallback
  ];

  while (remaining.length > 0) {
    let matched = false;
    for (const [re, type] of patterns) {
      const m = remaining.match(re);
      if (m) {
        tokens.push({ text: m[0], cls: type });
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: remaining[0], cls: "other" });
      remaining = remaining.slice(1);
    }
  }

  const colorMap: Record<string, string> = {
    key: "text-blue-700",
    string: "text-emerald-700",
    number: "text-amber-700",
    boolean: "text-violet-700",
    null: "text-red-500",
    punctuation: "text-slate-500",
    whitespace: "",
    other: "text-slate-700",
  };

  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} className={colorMap[tok.cls] ?? ""}>
          {tok.text}
        </span>
      ))}
    </>
  );
}

// ─────────────────────────────────────────────
// Komponen Utama: ResponseViewer
// ─────────────────────────────────────────────
export default function ResponseViewer({
  response,
}: {
  response: ApiResponse;
}) {
  const [activeTab, setActiveTab] = useState<"body" | "headers">("body");
  const [copied, setCopied] = useState(false);

  const formatted = response.data ? safeJsonStringify(response.data) : null;
  const statusStyle = getStatusStyle(response.status);

  const handleCopy = () => {
    if (!formatted) return;
    navigator.clipboard.writeText(formatted).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap gap-y-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Response
          </span>

          {response.status && (
            <span
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}
            >
              {response.status}
              {statusStyle.label && (
                <span className="opacity-60 font-medium">
                  {statusStyle.label}
                </span>
              )}
            </span>
          )}

          {response.timeMs && (
            <span className="text-[11px] text-slate-400 font-mono bg-white px-2 py-0.5 rounded-lg border border-slate-100">
              {response.timeMs}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex bg-white rounded-xl p-0.5 gap-0.5 border border-slate-200">
            {(["body", "headers"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-lg capitalize transition-all ${
                  activeTab === tab
                    ? "bg-slate-100 text-slate-800"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {formatted && (
            <button
              onClick={handleCopy}
              className="text-[11px] text-slate-400 hover:text-teal-600 transition-colors font-medium"
            >
              {copied ? "✓" : "Salin"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {/* Loading */}
        {response.loading && (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-teal-200 border-t-teal-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Mengirim request...</p>
            </div>
          </div>
        )}
        {/* Error */}
        {!response.loading && response.error && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-100">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 mt-0.5"
            >
              <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" />
              <path
                d="M8 5V8.5"
                stroke="#ef4444"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="8" cy="11" r="0.75" fill="#ef4444" />
            </svg>
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">
                Gagal mengirim request
              </p>
              {/* Render teks error secara aman — React auto-escape */}
              <p className="text-xs text-red-600 font-mono">{response.error}</p>
            </div>
          </div>
        )}
        ;{/* Empty */}
        {!response.loading && !response.error && !response.data && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl">
              📭
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">
                Belum ada response
              </p>
              <p className="text-xs text-slate-300 mt-1">
                Kirim request untuk melihat hasilnya di sini
              </p>
            </div>
          </div>
        )}
        {/* Body JSON — dirender sebagai React nodes, bukan HTML string */}
        {!response.loading && formatted && activeTab === "body" && (
          <JsonHighlight code={formatted} />
        )}
        {/* Headers info */}
        {!response.loading &&
          Boolean(response.data) &&
          activeTab === "headers" && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl">
                🔒
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Header tidak tersedia
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Response headers dari Satu Sehat API tidak diteruskan melalui proxy
                </p>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
