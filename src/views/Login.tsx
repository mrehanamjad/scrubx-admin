"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Lock, Mail, AlertCircle, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = safeInternalPath(searchParams.get("from"));
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(
    errorParam === "banned"
      ? "This account has been suspended by an administrator."
      : errorParam === "forbidden"
        ? "Access denied. Your account role does not have permission to view that resource."
        : errorParam === "session"
          ? "Your session has expired or is invalid. Please sign in again."
          : ""
  );

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    setLoading(true);

    try {
      const res = await authClient.signIn.email({
        email: email.trim(),
        password,
      });

      if (res.error) {
        setErrorMessage(
          res.error.message || "Invalid email or password. Please verify your credentials."
        );
        setLoading(false);
        return;
      }

      // Successful sign in, push to destination
      router.push(from);
      router.refresh();
    } catch (err: unknown) {
      console.error("[Login Exception]:", err);
      setErrorMessage("An unexpected authentication error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-[420px] space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface shadow-sm ring-1 ring-line">
            <Image
              src="/brand/logo-mark.png"
              alt="ScrubX Logo"
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl"
              priority
            />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-ink">
            ScrubX Admin
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Internal Operations & E-commerce Management
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-line bg-surface shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleLogin} className="space-y-4">
              {errorMessage ? (
                <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <p className="leading-snug">{errorMessage}</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-ink">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@scrubx.pk"
                    required
                    autoComplete="email"
                    className="pl-9 text-sm"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-ink">
                    Password
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    autoComplete="current-password"
                    className="pl-9 pr-10 text-sm font-mono"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={loading || !email || !password}
                  className="w-full bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  {loading ? "Authenticating..." : "Sign In to Admin"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Security Notice */}
        <div className="flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-muted">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Restricted Portal · Role-Based Staff Authentication</span>
        </div>
      </div>
    </div>
  );
}
