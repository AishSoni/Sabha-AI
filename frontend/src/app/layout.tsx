import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppearanceProvider } from "@/components/appearance";
import { Providers } from "./providers";
import "./globals.css";

const satoshi = localFont({
  src: [
    {
      path: "./fonts/Satoshi-Variable.woff2",
      weight: "300 900",
      style: "normal",
    },
    {
      path: "./fonts/Satoshi-VariableItalic.woff2",
      weight: "300 900",
      style: "italic",
    },
  ],
  variable: "--font-satoshi",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "sans-serif",
  ],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: "Sabha - AI Advisory Board",
  description: "Multi-agent collaborative workspace for AI-powered advisory discussions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={satoshi.variable}>
      <body className="antialiased">
        <a
          href="#main-content"
          className="type-control sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-popup focus:rounded-control focus:border focus:border-control focus:bg-surface focus:px-4 focus:py-2 focus:text-ink focus:shadow-[var(--shadow-overlay)] focus:outline-2 focus:outline-offset-2 focus:outline-focus-ring"
        >
          Skip to main content
        </a>
        <AppearanceProvider>
          <Providers>{children}</Providers>
        </AppearanceProvider>
      </body>
    </html>
  );
}
