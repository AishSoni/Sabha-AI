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
        <AppearanceProvider>
          <Providers>{children}</Providers>
        </AppearanceProvider>
      </body>
    </html>
  );
}
