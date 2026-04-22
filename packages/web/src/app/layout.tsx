import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CoordEventsProvider } from "@/lib/coord/sse";

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
          <div className="grid min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
            <AppSidebar />
            <main className="min-w-0 bg-muted/30">{children}</main>
          </div>
        </CoordEventsProvider>
      </body>
    </html>
  );
}
