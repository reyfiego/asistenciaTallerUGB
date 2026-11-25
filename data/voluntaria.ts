// Archivo de configuración OSINT para el Módulo 4 (/dossier).
// INSTRUCCIÓN PARA EL DOCENTE:
// 1. Edita los textos de este archivo con los datos pactados del perfil voluntario o señuelo.
// 2. Reemplaza las 3 imágenes de prueba dentro de /public/osint/ manteniendo estos nombres (o actualiza las rutas aquí).

export interface OsintRoutinePlace {
  name: string;
  frequency: string;
  sourceEvidence: string;
  timeWindow: string;
}

export interface OsintSecurityVector {
  category: string;
  questionOrVector: string;
  exposedAnswer: string;
  publicSource: string;
  riskLevel: "CRÍTICO" | "ALTO" | "MEDIO";
}

export interface OsintEvidenceImage {
  src: string;
  caption: string;
  tag: string;
}

export interface AttackSimulationStep {
  stepNumber: string;
  channel: string;
  title: string;
  attackerAction: string;
  messagePreview: string;
  consequence: string;
}

export interface VolunteerDossierConfig {
  profile: {
    fullName: string;
    aliasHandle: string;
    careerOrRole: string;
    city: string;
    exposureLevel: "CRÍTICO" | "ALTO" | "MODERADO";
    exposureScore: number;
    avatarUrl: string;
    inferredEmail: string;
    mobileCarrier: string;
    summary: string;
  };
  routine: {
    peakPostingHours: string;
    sleepWindowInferred: string;
    frequentPlaces: OsintRoutinePlace[];
    evidenceGallery: OsintEvidenceImage[];
  };
  vectors: {
    simSwapSummary: string;
    items: OsintSecurityVector[];
  };
  attackSimulation: {
    targetAccount: string;
    steps: AttackSimulationStep[];
  };
}

export const VOLUNTEER_DOSSIER: VolunteerDossierConfig = {
  profile: {
    fullName: "Valeria Mendoza (Perfil Señuelo UGB)",
    aliasHandle: "@valemendoza.sv",
    careerOrRole: "Lic. en Comunicaciones y Periodismo • 4.º Año",
    city: "San Miguel, El Salvador",
    exposureLevel: "CRÍTICO",
    exposureScore: 89,
    avatarUrl: "/osint/perfil-objetivo.svg",
    inferredEmail: "v.mendoza.ugb@*****.com",
    mobileCarrier: "Tigo / Claro (Portabilidad visible en recargas y estados)",
    summary:
      "Cuenta pública en Instagram y TikTok. Publica historias en tiempo real desde campus, cafeterías cercanas y eventos estudiantiles sin desactivar etiquetas de ubicación.",
  },
  routine: {
    peakPostingHours: "07:45 - 08:30 (llegada) • 12:15 - 13:40 (almuerzo) • 20:00 - 22:15 (domicilio)",
    sleepWindowInferred: "23:30 - 06:15 (inactividad consistente durante 14 días analizados)",
    frequentPlaces: [
      {
        name: "Campus UGB — Edificio de Comunicaciones",
        frequency: "Lunes a viernes (mañana)",
        sourceEvidence: "Historias destacadas 'Uni 2026' + reflejo de carnet estudiantil",
        timeWindow: "08:00 - 11:30",
      },
      {
        name: "Café Central Roosevelt, San Miguel",
        frequency: "3 veces por semana",
        sourceEvidence: "Check-in público y sticker de ubicación en Reels",
        timeWindow: "15:30 - 17:00",
      },
      {
        name: "Polideportivo / Gimnasio Zona Norte",
        frequency: "Martes y jueves",
        sourceEvidence: "Selfies en espejo con logotipo visible al fondo",
        timeWindow: "18:15 - 19:30",
      },
    ],
    evidenceGallery: [
      {
        src: "/osint/perfil-objetivo.svg",
        caption: "Foto de perfil pública reutilizada en 3 plataformas distintas.",
        tag: "FOTO 01 • PERFIL",
      },
      {
        src: "/osint/historia-rutina.svg",
        caption: "Historia destacada con ubicación exacta y hora de llegada recurrente.",
        tag: "FOTO 02 • RUTINA",
      },
      {
        src: "/osint/captura-vinculos.svg",
        caption: "Comentarios abiertos revelando nombre de mascota y segundo apellido materno.",
        tag: "FOTO 03 • VÍNCULOS",
      },
    ],
  },
  vectors: {
    simSwapSummary:
      "Con fecha de nacimiento, DUI parcial visible en acreditación vieja, operadora móvil y nombre de la madre, un atacante supera la verificación telefónica básica.",
    items: [
      {
        category: "Pregunta de seguridad #1",
        questionOrVector: "¿Nombre de tu primera mascota?",
        exposedAnswer: "Maxi (Golden Retriever)",
        publicSource: "Destacada 'Mi bebé' + comentario del 14/03 en TikTok",
        riskLevel: "CRÍTICO",
      },
      {
        category: "Vínculo familiar directo",
        questionOrVector: "Segundo apellido / Nombre de la madre",
        exposedAnswer: "Sra. Roxana Castellanos (etiquetada en Día de la Madre)",
        publicSource: "Publicación abierta en Facebook / Instagram",
        riskLevel: "ALTO",
      },
      {
        category: "Fecha clave / PIN débil",
        questionOrVector: "Fecha de nacimiento probable (posible PIN bancario)",
        exposedAnswer: "18 de octubre de 2004 (1810 / 2004)",
        publicSource: "Post de cumpleaños con globos numéricos '22'",
        riskLevel: "CRÍTICO",
      },
      {
        category: "Correo en biografía",
        questionOrVector: "Mismo correo para colaboraciones y recuperación",
        exposedAnswer: "v.mendoza.ugb@*****.com",
        publicSource: "Botón 'Correo' en perfil profesional de Instagram",
        riskLevel: "ALTO",
      },
    ],
  },
  attackSimulation: {
    targetAccount: "@valemendoza.sv + WhatsApp vinculado",
    steps: [
      {
        stepNumber: "PASO 1",
        channel: "Instagram DM / WhatsApp",
        title: "Phishing hiper-personalizado aprovechando su rutina",
        attackerAction:
          "El atacante espera a las 15:40 (cuando suele estar en Café Central Roosevelt) y le escribe fingiendo ser prensa del campus.",
        messagePreview:
          "\"Hola Valeria! Te escribimos de Prensa UGB por la cobertura de hoy en la Roosevelt. Validamos tu insignia aquí para etiquetar tu perfil: bit.ly/ugb-prensa-sv\"",
        consequence:
          "Si cae e introduce su clave o acepta permisos, entrega dispositivo, clave parcial y sesión.",
      },
      {
        stepNumber: "PASO 2",
        channel: "Soporte Operadora Móvil",
        title: "SIM Swapping usando datos de comentarios abiertos",
        attackerAction:
          "Con su fecha de nacimiento (18/10/2004), nombre de la madre (Roxana Castellanos) y operadora visible, solicita reposición de eSIM/chip.",
        messagePreview:
          "\"Buenas tardes, perdí mi teléfono hoy por la tarde. Confirmo titular: Valeria Mendoza Castellanos, nacida el 18/10/2004, contacto familiar Roxana Castellanos.\"",
        consequence:
          "Si la línea cae en manos del atacante, intercepta todos los códigos 2FA enviados por SMS.",
      },
      {
        stepNumber: "PASO 3",
        channel: "Recuperación de Cuenta (01:00 AM)",
        title: "Toma total mientras el objetivo duerme",
        attackerAction:
          "Ejecuta el ataque a las 01:00 AM (ventana de sueño inferida 23:30–06:15) usando el correo público de su biografía + código SMS interceptado.",
        messagePreview:
          "\"Tu código de restablecimiento de Instagram / WhatsApp es 849-201. No lo compartas con nadie.\"",
        consequence:
          "Cambia correo, activa su propia app 2FA y extorsiona o suplanta la identidad de la figura pública frente a sus seguidores.",
      },
    ],
  },
};
