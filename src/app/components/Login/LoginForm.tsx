"use client";

import { useState } from "react";
import {
  HiOutlineEye,
  HiOutlineEyeSlash,
  HiOutlineLockClosed,
  HiOutlineExclamationCircle,
  HiOutlineUser,
} from "react-icons/hi2";

export default function LoginForm() {
  const [formData, setFormData] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError("");
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        window.location.href = "/dashboard";
      } else {
        setError("Username atau password salah");
      }
    } catch {
      setError("Terjadi kesalahan. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = (invalid: boolean) =>
    `w-full rounded-xl border bg-slate-50/70 py-3 pl-11 pr-4 text-[15px] text-slate-900 placeholder-slate-400 transition-all duration-150 focus:bg-white focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${
      invalid
        ? "border-red-300 focus:border-red-400 focus:ring-red-500/15"
        : "border-slate-200 focus:border-teal-500 focus:ring-teal-500/15"
    }`;

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5"
        >
          <HiOutlineExclamationCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-800">{error}</p>
        </div>
      )}

      {/* Username */}
      <div>
        <label
          htmlFor="username"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Username
        </label>
        <div className="group relative">
          <HiOutlineUser className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-teal-600" />
          <input
            id="username"
            name="username"
            type="text"
            required
            autoComplete="username"
            autoFocus
            aria-invalid={!!error}
            className={inputClass(!!error)}
            placeholder="Masukkan username"
            value={formData.username}
            onChange={handleChange}
            disabled={isLoading}
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Password
        </label>
        <div className="group relative">
          <HiOutlineLockClosed className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-teal-600" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            aria-invalid={!!error}
            className={`${inputClass(!!error)} pr-11`}
            placeholder="Masukkan password"
            value={formData.password}
            onChange={handleChange}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            disabled={isLoading}
            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            aria-pressed={showPassword}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 disabled:opacity-60"
          >
            {showPassword ? (
              <HiOutlineEyeSlash className="h-5 w-5" />
            ) : (
              <HiOutlineEye className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-teal-600 to-emerald-600 px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-teal-600/20 transition-all duration-200 hover:from-teal-500 hover:to-emerald-500 hover:shadow-xl hover:shadow-teal-600/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/35 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none motion-safe:hover:-translate-y-0.5"
      >
        {isLoading ? (
          <>
            <svg
              className="h-5 w-5 animate-spin text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Sedang masuk…
          </>
        ) : (
          "Masuk ke Sistem"
        )}
      </button>
    </form>
  );
}
