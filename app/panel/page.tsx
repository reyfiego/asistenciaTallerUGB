import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Camera,
  FileSearch,
  Lock,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { ES_TEXTS } from "@/lib/i18n/es";

const MODULE_ICONS = [Smartphone, Activity, Camera, FileSearch];

export default function DocenteOverviewPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <section className="rounded-2xl border border-cyan-500/25 bg-slate-900/75 p-6 shadow-[0_0_40px_rgba(8,145,178,0.12)] backdrop-blur sm:p-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          {ES_TEXTS.home.heroTag}
        </span>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">
          {ES_TEXTS.home.heroTitle}
        </h1>

        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">
          {ES_TEXTS.home.heroDescription}
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-semibold text-emerald-300">
              {ES_TEXTS.home.privacyNoticeTitle}
            </p>
            <p className="mt-1 text-emerald-100/80">
              {ES_TEXTS.home.privacyNoticeBody}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-5 md:grid-cols-2">
        {ES_TEXTS.home.modules.map((mod, index) => {
          const Icon = MODULE_ICONS[index] ?? Smartphone;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-6 transition hover:border-cyan-400/50 hover:bg-slate-900"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs tracking-wider text-cyan-400">
                    {mod.badge}
                  </span>
                  <span className="rounded-lg border border-slate-700 bg-slate-800/80 p-2 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <h2 className="mt-4 text-xl font-bold text-white group-hover:text-cyan-200">
                  {mod.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  {mod.description}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-2 font-mono text-xs font-semibold text-cyan-300">
                <span>{mod.cta}</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
