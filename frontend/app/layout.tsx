import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "../lib/auth-context.js";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gemini Subtitle Translator — Professional SRT Translation",
  description: "Translate SRT subtitle files with Gemini AI. Preserves original timing metadata and provides sequence, reading speed, and safety validation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#030014] text-slate-100 selection:bg-purple-500/30 selection:text-purple-200">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
