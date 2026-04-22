import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CoordEventsProvider } from "@/lib/coord/sse";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "mcp-coord dashboard",
  description: "Coordination dashboard scaffold for agents, tasks, messages, and plans.",
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
      <body className="min-h-full bg-background text-foreground">
        <CoordEventsProvider>
          <div className="relative grid min-h-screen lg:grid-cols-[19.5rem_minmax(0,1fr)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.08),transparent_32%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.06),transparent_28%)]" />
            <AppSidebar />
            <main className="relative min-w-0">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[linear-gradient(180deg,rgba(255,255,255,0.58),transparent)]" />
              <div className="relative">{children}</div>
            </main>
          </div>
        </CoordEventsProvider>
      </body>
    </html>
  );
}
