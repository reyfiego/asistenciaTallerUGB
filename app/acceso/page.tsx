"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { ES_TEXTS } from "@/lib/i18n/es";

function sanitizeNextPath(rawNext: string | null): string {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//") || rawNext === "/") {
    return "/consola";
  }
  return rawNext;
}

function InstructorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = sanitizeNextPath(searchParams.get("next"));

  const [accessKey, setAccessKey] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { configured?: boolean; authenticated?: boolean }) => {
        if (!active) return;
        setIsConfigured(Boolean(data.configured));
        if (data.authenticated) {
          router.replace(nextPath);
        }
      })
      .catch(() => {
        // Ignorar fallo inicial
      });
    return () => {
      active = false;
    };
  }, [nextPath, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!accessKey.trim()) {
      setErrorMessage(ES_TEXTS.auth.invalidKeyError);
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey }),
      });

      if (response.ok) {
        setAccessKey("");
        router.replace(nextPath);
        router.refresh();
        return;
      }

      const data = (await response.json()) as {
        error?: string;
        configured?: boolean;
      };
      if (data.configured === false) {
        setIsConfigured(false);
      }
      setErrorMessage(data.error || ES_TEXTS.auth.invalidKeyError);
    } catch {
      setErrorMessage(ES_TEXTS.auth.invalidKeyError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-16 sm:py-24">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-[11px] text-cyan-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          {ES_TEXTS.auth.badge}
        </span>

        <h1 className="mt-4 text-2xl font-bold text-white">{ES_TEXTS.auth.title}</h1>
        <p className="mt-1.5 text-sm text-slate-400">{ES_TEXTS.auth.subtitle}</p>

        {!isConfigured && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-amber-500/40 bg-amber-950/35 p-3.5 text-xs text-amber-200"
          >
            <p className="flex items-center gap-1.5 font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {ES_TEXTS.auth.notConfiguredTitle}
            </p>
            <p className="mt-1 text-amber-100/85">{ES_TEXTS.auth.notConfiguredBody}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="instructor-key"
              className="block font-mono text-xs font-medium text-slate-300"
            >
              {ES_TEXTS.auth.keyLabel}
            </label>
            <div className="relative mt-1.5">
              <KeyRound className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
              <input
                id="instructor-key"
                type="password"
                autoComplete="current-password"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder={ES_TEXTS.auth.keyPlaceholder}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-mono text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
          >
            <Lock className="h-4 w-4" />
            {isSubmitting ? ES_TEXTS.auth.verifyingButton : ES_TEXTS.auth.submitButton}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AccesoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-10 text-center font-mono text-xs text-slate-400">
          {ES_TEXTS.common.loadingLabel}
        </div>
      }
    >
      <InstructorLoginForm />
    </Suspense>
  );
}
