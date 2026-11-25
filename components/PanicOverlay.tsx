"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, Lock, ShieldAlert } from "lucide-react";
import type { TelemetryRecord } from "@/lib/telemetryStore";

interface PanicOverlayProps {
  record: TelemetryRecord;
  onComplete: () => void;
}

const PANIC_DURATION_MS = 6000;

export function PanicOverlay({ record, onComplete }: PanicOverlayProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();

    // Pantalla completa forzada cuando el navegador la permite
    try {
      const el = document.documentElement;
      if (typeof el.requestFullscreen === "function" && !document.fullscreenElement) {
        void el.requestFullscreen().catch(() => {
          // Ignorar si el navegador móvil exige gesto directo
        });
      }
    } catch {
      // Ignorar
    }

    // Vibración continua en patrón de alerta
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate([320, 90, 320, 90, 450, 90, 450, 90, 600, 100, 600]);
      }
    } catch {
      // Ignorar
    }

    // Voz sintetizada del sistema
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
          "Acceso concedido. Exportando galería y credenciales del dispositivo."
        );
        utterance.lang = "es-ES";
        utterance.rate = 1.05;
        utterance.pitch = 0.85;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Ignorar si el dispositivo bloquea síntesis de voz sin gesto
    }

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / PANIC_DURATION_MS) * 100));
      setProgress(pct);
      if (elapsed >= PANIC_DURATION_MS) {
        clearInterval(intervalId);
        onComplete();
      }
    }, 80);

    return () => {
      clearInterval(intervalId);
      try {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          navigator.vibrate(0);
        }
      } catch {
        // Ignorar
      }
      try {
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      } catch {
        // Ignorar
      }
      try {
        if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
          void document.exitFullscreen().catch(() => {});
        }
      } catch {
        // Ignorar
      }
    };
  }, [onComplete]);

  const statusLine =
    progress < 30
      ? `Estableciendo túnel de extracción en ${record.modeloInferido}...`
      : progress < 68
        ? `Subiendo 142 fotos de cámara... ${progress}%`
        : progress < 92
          ? `Copiando metadatos GPS y credenciales (${record.claveEnmascarada})...`
          : "Finalizando paquete de exfiltración remota...";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-between bg-slate-950 p-5 text-white">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center">
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/40 p-6 shadow-[0_0_60px_rgba(244,63,94,0.35)]">
          <div className="flex items-center gap-3 text-rose-400">
            <AlertOctagon className="h-9 w-9 shrink-0 animate-pulse" />
            <div>
              <p className="font-mono text-xs font-bold tracking-widest uppercase">
                ALERTA CRÍTICA DE SISTEMA
              </p>
              <h1 className="text-xl font-extrabold text-white">
                Dispositivo Comprometido
              </h1>
            </div>
          </div>

          <div className="mt-5 space-y-2 rounded-xl border border-rose-500/40 bg-slate-950/90 p-4 font-mono text-xs">
            <p className="text-slate-300">
              <span className="text-rose-400">EQUIPO:</span> {record.modeloInferido} ({record.os})
            </p>
            <p className="text-slate-300">
              <span className="text-rose-400">IP / RED:</span> {record.ipParcial} • {record.isp}
            </p>
            <p className="text-slate-300">
              <span className="text-rose-400">CUENTA:</span> {record.correo}
            </p>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between font-mono text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-amber-300">
                <Lock className="h-3.5 w-3.5" />
                {statusLine}
              </span>
              <span className="font-bold text-rose-300">{progress}%</span>
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded-full border border-rose-500/40 bg-slate-900">
              <div
                className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-amber-400 transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="mt-5 flex items-center gap-2 font-mono text-[11px] text-rose-200/80">
            <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400" />
            No cierres esta ventana mientras se completa la transferencia cifrada...
          </p>
        </div>
      </div>
    </div>
  );
}
