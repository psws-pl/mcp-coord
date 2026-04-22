import type { CoordPlanStatus, CoordPlanSummary } from "@/lib/coord/types";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const PLAN_ACTION_STATUSES = [
  "active",
  "paused",
  "completed",
] as const satisfies readonly CoordPlanStatus[];

export type CoordPlanActionStatus = (typeof PLAN_ACTION_STATUSES)[number];

export function getPlanActionStatus(status: CoordPlanStatus) {
  switch (status) {
    case "blocked":
    case "paused":
      return "paused" as const;
    case "done":
    case "completed":
      return "completed" as const;
    case "active":
      return "active" as const;
    default:
      return "draft" as const;
  }
}

export function getPlanStatusLabel(status: CoordPlanStatus) {
  const actionStatus = getPlanActionStatus(status);

  switch (actionStatus) {
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    default:
      return status === "draft" ? "Draft" : startCase(status);
  }
}

export function getPlanStatusBadgeClassName(status: CoordPlanStatus) {
  switch (getPlanActionStatus(status)) {
    case "active":
      return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-700";
    case "paused":
      return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-700";
    case "completed":
      return "inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-700";
    default:
      return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-700";
  }
}

export function formatPlanDate(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return DATE_FORMATTER.format(date);
}

export function getPlanProgressPercent(plan: CoordPlanSummary) {
  if (plan.taskCounts.total <= 0) {
    return 0;
  }

  return Math.min(
    100,
    Math.max(0, Math.round((plan.taskCounts.done / plan.taskCounts.total) * 100)),
  );
}

function startCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
