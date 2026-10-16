import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DemoWatermark } from "@/components/demo/DemoWatermark";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en" className="dark">
      <body className={`${inter.className} antialiased`}>
        {children}
        <DemoWatermark />
      </body>
    </html>
  );
}
