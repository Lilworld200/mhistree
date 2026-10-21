import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import "../features/professional-onboarding/styles.css";
const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
});
export const metadata: Metadata = {
  title: { default: "Mhistree", template: "%s · Mhistree" },
  description: "Your continuing health history.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={manrope.className + " " + manrope.variable}>
        {children}
      </body>
    </html>
  );
}
