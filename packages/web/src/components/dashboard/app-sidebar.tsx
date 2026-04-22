"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, KanbanSquare, ListTodo, MessagesSquare, Network } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCoordEvents } from "@/lib/coord/sse";

const navigation = [
  {
    href: "/agents",
    label: "Agents",
    description: "Status grid and controls",
    icon: Activity,
  },
  {
    href: "/tasks",
    label: "Tasks",
    description: "Kanban workflow lanes",
    icon: KanbanSquare,
  },
  {
    href: "/messages",
    label: "Messages",
    description: "Coordination timeline",
    icon: MessagesSquare,
  },
  {
    href: "/plans",
    label: "Plans",
    description: "Shared execution plans",
    icon: ListTodo,
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const connection = useCoordEvents();

  return (
    <aside className="relative border-b border-border/70 bg-background/78 px-4 py-4 backdrop-blur xl:px-5 xl:py-5 lg:min-h-screen lg:border-r lg:border-b-0">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.12),transparent_50%)]" />

      <div className="relative mx-auto flex max-w-6xl flex-col gap-5 lg:h-[calc(100vh-2.5rem)] lg:max-w-none">
        <Card className="rounded-[1.75rem]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-[1.35rem] bg-primary/12 text-primary shadow-[0_14px_34px_-24px_rgba(79,70,229,0.45)]">
                <Network className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                  mcp-coord
                </p>
                <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
              </div>
            </div>

            <div className="mt-4 rounded-[1.35rem] border border-border/70 bg-muted/28 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Real-time
                  </p>
                  <p className="mt-1 text-sm font-medium">{labelForStatus(connection)}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex h-2.5 w-2.5 rounded-full shadow-[0_0_0_6px_rgba(255,255,255,0.55)]",
                    dotClassName(connection),
                  )}
                />
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {connection.reason ??
                  (connection.lastEventAt
                    ? `Last event at ${formatTimestamp(connection.lastEventAt)}`
                    : "Waiting for the first dashboard event.")}
              </p>
            </div>
          </CardContent>
        </Card>

        <nav className="grid gap-2">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-[1.35rem] border px-4 py-3.5 shadow-[0_18px_40px_-42px_rgba(15,23,42,0.5)] transition-all",
                  isActive
                    ? "border-primary/20 bg-primary/[0.08] text-foreground shadow-[0_22px_55px_-42px_rgba(79,70,229,0.4)]"
                    : "border-transparent bg-transparent hover:border-border/70 hover:bg-background/88",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-10 items-center justify-center rounded-[1rem] shadow-[0_12px_28px_-22px_rgba(15,23,42,0.45)]",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        <Card className="mt-auto rounded-[1.5rem]">
          <CardContent className="p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">Realtime dashboard</p>
              <Badge variant="muted" className="tracking-[0.18em]">
                SSE
              </Badge>
            </div>
            <p className="mt-2">
              Panels listen for coord invalidations and fall back to 15s polling if
              the dashboard stream keeps dropping.
            </p>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}

function labelForStatus(connection: ReturnType<typeof useCoordEvents>) {
  if (connection.polling) {
    return "Disconnected · polling";
  }

  switch (connection.status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    default:
      return "Disconnected";
  }
}

function dotClassName(connection: ReturnType<typeof useCoordEvents>) {
  if (connection.polling || connection.status === "disconnected") {
    return "bg-red-500";
  }

  switch (connection.status) {
    case "connected":
      return "bg-emerald-500";
    case "connecting":
      return "bg-amber-400";
    case "reconnecting":
      return "bg-amber-400";
    default:
      return "bg-red-500";
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}
