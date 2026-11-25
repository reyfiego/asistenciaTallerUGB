"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Camera,
  FileSearch,
  LogOut,
  ShieldAlert,
  Smartphone,
} from "lucide-react";
import { ES_TEXTS } from "@/lib/i18n/es";

const NAV_ITEMS = [
  {
    href: ES_TEXTS.common.nav.consola,
    label: ES_TEXTS.common.navLabels.consola,
    icon: Activity,
  },
  {
    href: ES_TEXTS.common.nav.exif,
    label: ES_TEXTS.common.navLabels.exif,
    icon: Camera,
  },
  {
    href: ES_TEXTS.common.nav.dossier,
    label: ES_TEXTS.common.navLabels.dossier,
    icon: FileSearch,
  },
  {
    href: ES_TEXTS.common.nav.registro,
    label: ES_TEXTS.common.navLabels.registro,
    icon: Smartphone,
  },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  if (
    pathname === "/" ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/acceso")
  ) {
    return null;
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/acceso");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-slate-950/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/consola" className="group flex shrink-0 items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 text-cyan-300 transition group-hover:border-cyan-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="hidden sm:block">
            <p className="font-mono text-sm font-bold leading-tight tracking-wider text-slate-100">
              {ES_TEXTS.common.brandName}
            </p>
            <p className="font-mono text-[10px] leading-tight tracking-widest text-cyan-400/80">
              {ES_TEXTS.common.brandSubtitle}
            </p>
          </div>
        </Link>

        <nav
          aria-label="Navegación docente"
          className="flex items-center gap-1.5 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs transition ${isActive
                  ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white"
                  }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-1.5 font-mono text-xs font-semibold text-rose-200 transition hover:bg-rose-500/25"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{ES_TEXTS.common.logoutButton}</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
