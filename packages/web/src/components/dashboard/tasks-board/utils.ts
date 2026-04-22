import { cn } from "@/lib/utils";
import type {
  CoordAgentSummary,
  CoordTaskDetail,
  CoordTaskPriority,
  CoordTaskStatus,
} from "@/lib/coord/types";

import type { CreateTaskDraft } from "./types";

export const formControlClassName =
  "h-11 w-full rounded-2xl border border-border/70 bg-background/85 px-3.5 text-sm text-foreground shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-muted-foreground focus:border-primary/35 focus:bg-background focus:ring-4 focus:ring-primary/10";

export function restoreDetailOverride(
  current: Record<string, CoordTaskDetail>,
  taskId: string,
  previous: CoordTaskDetail | undefined,
) {
  if (previous) {
    return {
      ...current,
      [taskId]: previous,
    };
  }

  const next = { ...current };
  delete next[taskId];
  return next;
}

export function normalizeOwnerValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizePlanValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createInitialTaskDraft(agents: CoordAgentSummary[]): CreateTaskDraft {
  return {
    title: "",
    description: "",
    owner: agents[0]?.id ?? "",
    priority: "normal",
    planId: "",
  };
}

export function laneBadgeClassName(status: CoordTaskStatus) {
  return cn(
    "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]",
    laneToneClassName(status),
  );
}

export function priorityBadgeClassName(priority: CoordTaskPriority) {
  switch (priority) {
    case "urgent":
      return "inline-flex items-center rounded-full border border-rose-200/80 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-700";
    case "high":
      return "inline-flex items-center rounded-full border border-orange-200/80 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-700";
    case "low":
      return "inline-flex items-center rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700";
    default:
      return "inline-flex items-center rounded-full border border-violet-200/80 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-700";
  }
}

export function laneSurfaceClassName(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "border-slate-200/90 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]";
    case "in_progress":
      return "border-blue-200/90 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98))]";
    case "review":
      return "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,251,235,0.96),rgba(255,255,255,0.98))]";
    case "done":
      return "border-emerald-200/90 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.98))]";
    case "blocked":
      return "border-rose-200/90 bg-[linear-gradient(180deg,rgba(255,241,242,0.96),rgba(255,255,255,0.98))]";
    default:
      return "border-border/80 bg-background";
  }
}

export function laneToneClassName(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "border-slate-200/80 bg-slate-50 text-slate-700";
    case "in_progress":
      return "border-blue-200/80 bg-blue-50 text-blue-700";
    case "review":
      return "border-amber-200/80 bg-amber-50 text-amber-700";
    case "done":
      return "border-emerald-200/80 bg-emerald-50 text-emerald-700";
    case "blocked":
      return "border-rose-200/80 bg-rose-50 text-rose-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

export function laneAccentClassName(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "bg-slate-400";
    case "in_progress":
      return "bg-blue-500";
    case "review":
      return "bg-amber-500";
    case "done":
      return "bg-emerald-500";
    case "blocked":
      return "bg-rose-500";
    default:
      return "bg-muted-foreground";
  }
}

export function laneIconClassName(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "text-slate-500";
    case "in_progress":
      return "text-blue-600";
    case "review":
      return "text-amber-600";
    case "done":
      return "text-emerald-600";
    case "blocked":
      return "text-rose-600";
    default:
      return "text-muted-foreground";
  }
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelativeTimestamp(value: string) {
  const delta = Math.round((Date.now() - new Date(value).getTime()) / 60000);

  if (delta < 1) {
    return "just now";
  }

  if (delta < 60) {
    return `${delta}m ago`;
  }

  const hours = Math.round(delta / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function getLaneDescription(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "Ready to pick up";
    case "in_progress":
      return "Currently being worked";
    case "review":
      return "Waiting on validation";
    case "done":
      return "Completed and clear";
    case "blocked":
      return "Needs intervention";
    default:
      return "Task lane";
  }
}
