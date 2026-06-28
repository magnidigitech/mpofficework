"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as zod from "zod";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { Share, PlusSquare, AlertCircle, ShieldAlert } from "lucide-react";

// Form Schema
const loginSchema = zod.object({
  email: zod.string().email("Invalid email address"),
  password: zod.string().min(6, "Password must be at least 6 characters"),
});

type LoginSchemaInput = zod.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check user-agent and standalone state
  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleMobile = /iphone|ipad|ipod/.test(ua);
    setIsIos(isAppleMobile);

    const isAppStandalone = 
      (window.navigator as any).standalone || 
      window.matchMedia("(display-mode: standalone)").matches;
    setIsStandalone(isAppStandalone);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchemaInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginSchemaInput) => {
    setError(null);
    setLoading(true);
    try {
      const response = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });
      
      if (response.error) {
        setError(response.error.message || "Failed to sign in. Please verify your credentials.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected login error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        {/* Portal Emblem / Heading */}
        <div className="flex flex-col items-center mb-6 text-center">
          <svg className="w-12 h-12 text-primary mb-2" viewBox="0 0 512 512" fill="currentColor">
            <path d="M256 130 L150 195 L362 195 Z" />
            <rect x="165" y="195" width="182" height="15" />
            <rect x="177" y="218" width="18" height="110" />
            <rect x="247" y="218" width="18" height="110" />
            <rect x="317" y="218" width="18" height="110" />
            <rect x="165" y="328" width="182" height="15" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900">MP Office Portal</h1>
          <p className="text-xs text-gray-500 mt-1">Staff Access & Schedule Tracking</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="flex flex-col">
            <label htmlFor="email" className="text-xs font-semibold text-gray-700 mb-1">
              Email Address <span className="text-red-500">*</span>
            </label>
            <input
              id="email"
              type="email"
              placeholder="e.g. staff@office.com"
              {...register("email")}
              className={`w-full ${errors.email ? "border-red-500" : ""}`}
              disabled={loading}
              autoComplete="username"
              required
            />
            {errors.email && (
              <span className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.email.message}
              </span>
            )}
          </div>

          <div className="flex flex-col">
            <label htmlFor="password" className="text-xs font-semibold text-gray-700 mb-1">
              Password <span className="text-red-500">*</span>
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              {...register("password")}
              className={`w-full ${errors.password ? "border-red-500" : ""}`}
              disabled={loading}
              autoComplete="current-password"
              required
            />
            {errors.password && (
              <span className="text-red-500 text-xs mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errors.password.message}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-primary hover:bg-amber-700 text-white font-medium rounded-md transition duration-150 flex items-center justify-center disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>

      {/* iPhone installation guidelines - rendered only for iOS when not opened as standalone PWA */}
      {isIos && !isStandalone && (
        <div className="w-full max-w-md mt-6 bg-amber-50 border border-amber-200 rounded-lg p-5 shadow-sm text-gray-800">
          <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
            <Share className="w-4 h-4 text-primary" />
            Install PWA on iPhone (Required for Push Notifications)
          </h2>
          <ol className="list-decimal list-inside text-xs space-y-1.5 text-gray-700 mt-2">
            <li>
              Open this page inside <strong>Safari</strong> browser.
            </li>
            <li className="flex items-center gap-1 flex-wrap">
              Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-0.5" /> in the toolbar.
            </li>
            <li className="flex items-center gap-1 flex-wrap">
              Scroll down and tap <strong>Add to Home Screen</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-0.5" />.
            </li>
            <li>Launch the portal from your home screen.</li>
            <li>Log in and tap **Enable Notifications** to get push alerts.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
