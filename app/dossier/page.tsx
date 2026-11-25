"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Fingerprint,
  MapPin,
  MessageSquareWarning,
  RotateCcw,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { VOLUNTEER_DOSSIER } from "@/data/voluntaria";
import { ES_TEXTS } from "@/lib/i18n/es";

export default function DossierPage() {
  const [revealedSteps, setRevealedSteps] = useState(1);

  const { profile, routine, vectors, attackSimulation } = VOLUNTEER_DOSSIER;
  const totalSteps = attackSimulation.steps.length;

  function handleNextStep() {
    setRevealedSteps((prev) => Math.min(totalSteps, prev + 1));
  }

  function handleResetSimulation() {
    setRevealedSteps(1);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-300">
            <Fingerprint className="h-3.5 w-3.5" />
            {ES_TEXTS.dossier.badge}
          </span>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
            {ES_TEXTS.dossier.title}
          </h1>
          <p className="mt-1 text-sm text-slate-300">{ES_TEXTS.dossier.subtitle}</p>
        </div>

        <span className="rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 font-mono text-xs text-slate-400">
          {ES_TEXTS.dossier.configNotice}
        </span>
      </div>

      {/* Dashboard en 4 cuadrantes */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Cuadrante 1: Perfil Objetivo */}
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
              <UserCheck className="h-4 w-4" />
              {ES_TEXTS.dossier.quadrants.profileTitle}
            </h2>
            <span className="rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-0.5 font-mono text-xs font-bold text-rose-300">
              {profile.exposureLevel} ({profile.exposureScore}/100)
            </span>
          </div>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.avatarUrl}
              alt={profile.fullName}
              className="h-28 w-28 shrink-0 rounded-2xl border border-cyan-400/40 bg-slate-950 object-cover"
            />
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold text-white">{profile.fullName}</h3>
              <p className="font-mono text-sm text-cyan-300">{profile.aliasHandle}</p>
              <p className="text-sm text-slate-300">{profile.careerOrRole}</p>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <MapPin className="h-3.5 w-3.5 text-rose-400" />
                {profile.city}
              </p>
            </div>
          </div>

          <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-sm leading-relaxed text-slate-300">
            {profile.summary}
          </p>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <dt className="font-mono text-[11px] text-slate-400">
                {ES_TEXTS.dossier.profileLabels.emailGuess}
              </dt>
              <dd className="mt-1 font-mono text-xs text-amber-300">
                {profile.inferredEmail}
              </dd>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <dt className="font-mono text-[11px] text-slate-400">
                {ES_TEXTS.dossier.profileLabels.phoneCarrier}
              </dt>
              <dd className="mt-1 font-mono text-xs text-slate-200">
                {profile.mobileCarrier}
              </dd>
            </div>
          </dl>
        </section>

        {/* Cuadrante 2: Correlación de Rutina y Ubicación */}
        <section className="rounded-2xl border border-cyan-500/30 bg-slate-900/80 p-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-cyan-300">
              <Clock className="h-4 w-4" />
              {ES_TEXTS.dossier.quadrants.routineTitle}
            </h2>
          </div>

          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5">
            <p className="font-mono text-xs font-semibold text-amber-300">
              {ES_TEXTS.dossier.routineLabels.activeHours}
            </p>
            <p className="mt-1 text-sm text-amber-100/90">{routine.peakPostingHours}</p>
            <p className="mt-1.5 font-mono text-xs text-slate-400">
              {routine.sleepWindowInferred}
            </p>
          </div>

          <div className="mt-4 space-y-2.5">
            <p className="font-mono text-xs text-slate-400">
              {ES_TEXTS.dossier.routineLabels.frequentPlaces}
            </p>
            {routine.frequentPlaces.map((place) => (
              <div
                key={place.name}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">{place.name}</span>
                  <span className="font-mono text-xs text-cyan-300">
                    {place.timeWindow}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {place.frequency} • {place.sourceEvidence}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className="mb-2 font-mono text-xs text-slate-400">
              {ES_TEXTS.dossier.routineLabels.evidenceGallery}
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {routine.evidenceGallery.map((img) => (
                <div
                  key={img.src}
                  className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.caption}
                    className="h-20 w-full object-cover"
                  />
                  <p className="truncate px-2 py-1 font-mono text-[10px] text-cyan-300">
                    {img.tag}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cuadrante 3: Vectores de Recuperación / Ingeniería Social */}
        <section className="rounded-2xl border border-rose-500/35 bg-slate-900/80 p-6">
          <div className="border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300">
              <ShieldAlert className="h-4 w-4" />
              {ES_TEXTS.dossier.quadrants.vectorsTitle}
            </h2>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3.5 text-xs text-rose-100/90">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold text-rose-300">
                {ES_TEXTS.dossier.vectorsLabels.simSwapRisk}
              </p>
              <p className="mt-1">{vectors.simSwapSummary}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {vectors.items.map((item) => (
              <div
                key={item.category}
                className="rounded-xl border border-slate-800 bg-slate-950/85 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-400">
                    {item.category}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      item.riskLevel === "CRÍTICO"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {item.riskLevel}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-medium text-slate-300">
                  {item.questionOrVector}
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-white">
                  {item.exposedAnswer}
                </p>
                <p className="mt-2 text-[11px] text-slate-500">
                  {ES_TEXTS.dossier.vectorsLabels.sourceLabel} {item.publicSource}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Cuadrante 4: Simulador de Secuestro en Cadena (sin audio) */}
        <section className="flex flex-col justify-between rounded-2xl border border-rose-500/40 bg-slate-900/85 p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <h2 className="flex items-center gap-2 font-mono text-sm font-bold text-rose-300">
                <MessageSquareWarning className="h-4 w-4" />
                {ES_TEXTS.dossier.quadrants.simulationTitle}
              </h2>
              <span className="font-mono text-xs text-slate-400">
                {ES_TEXTS.dossier.simulationLabels.targetPrefix}{" "}
                {attackSimulation.targetAccount}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {attackSimulation.steps.slice(0, revealedSteps).map((step) => (
                <div
                  key={step.stepNumber}
                  className="rounded-xl border border-slate-800 bg-slate-950/90 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-rose-300">
                      {step.stepNumber} • {step.channel}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white">{step.title}</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    <strong className="text-amber-300">
                      {ES_TEXTS.dossier.simulationLabels.attackerLabel}{" "}
                    </strong>
                    {step.attackerAction}
                  </p>
                  <blockquote className="mt-2 rounded-lg border-l-4 border-cyan-500 bg-slate-900 p-2.5 font-mono text-xs text-cyan-100">
                    {step.messagePreview}
                  </blockquote>
                  <p className="mt-2 text-xs text-rose-200">
                    <strong className="text-rose-400">
                      {ES_TEXTS.dossier.simulationLabels.impactLabel}{" "}
                    </strong>
                    {step.consequence}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
            {revealedSteps < totalSteps ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-mono text-xs font-bold text-white transition hover:bg-rose-500"
              >
                <span>
                  {revealedSteps === 1
                    ? ES_TEXTS.dossier.simulationLabels.startButton
                    : ES_TEXTS.dossier.simulationLabels.nextStepButton}{" "}
                  ({revealedSteps}/{totalSteps})
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="font-mono text-xs font-bold text-rose-300">
                Cadena completa ejecutada ({totalSteps}/{totalSteps})
              </span>
            )}

            <button
              type="button"
              onClick={handleResetSimulation}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 font-mono text-xs text-slate-300 hover:border-slate-500 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {ES_TEXTS.dossier.simulationLabels.resetButton}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
