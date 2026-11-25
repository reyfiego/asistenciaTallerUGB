import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal de Eventos y Acreditación Digital | UGB",
  description:
    "Plataforma de registro de asistencia, acreditación y constancias digitales de eventos universitarios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full dark antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 font-sans text-slate-100">
        <Navbar />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
