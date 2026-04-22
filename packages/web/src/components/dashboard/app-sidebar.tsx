"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, KanbanSquare, ListTodo, MessagesSquare, Network } from "lucide-react";

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
    <aside className="border-b bg-background/95 px-4 py-5 backdrop-blur lg:min-h-screen lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:max-w-none">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Network className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                mcp-coord
              </p>
              <h1 className="text-lg font-semibold tracking-tight">
                Dashboard
              </h1>
            </div>
          </div>
          <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Real-time
                </p>
                <p className="mt-1 text-sm font-medium">
                  {labelForStatus(connection)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex h-2.5 w-2.5 rounded-full",
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
        </div>

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
                  "rounded-2xl border px-4 py-3 transition-colors",
                  isActive
                    ? "border-primary/20 bg-primary/10 text-foreground"
                    : "border-transparent hover:border-border hover:bg-muted/60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-9 items-center justify-center rounded-xl",
                      isActive ? "bg-primary text-primary-foreground" : "bg-muted",
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

        <div className="rounded-2xl border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          <p className="font-medium text-foreground">Realtime dashboard</p>
          <p className="mt-2">
            Panels listen for coord invalidations and fall back to 15s polling if
            the dashboard stream keeps dropping.
          </p>
        </div>
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
