import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AppOverlays } from "@/components/app-overlays";
import { ThemeProvider } from "@/components/theme-provider";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mhistree — Longitudinal Health Companion",
  description:
    "A living medical history. Mhistree turns everyday interactions, measurements and documents into a time-aware health record with provenance you control.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider />
        {children}
        <AppOverlays />
      </body>
    </html>
  );
}
