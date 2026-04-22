import type {
  CoordAgentSummary,
  CoordPlanSummary,
  CoordTaskPriority,
  CoordTaskStatus,
  CoordTaskSummary,
} from "@/lib/coord/types";

export const TASK_STATUS_ORDER = [
  "pending",
  "in_progress",
  "review",
  "done",
  "blocked",
] as const satisfies readonly CoordTaskStatus[];

export const TASK_PRIORITY_ORDER = [
  "low",
  "normal",
  "high",
  "urgent",
] as const satisfies readonly CoordTaskPriority[];

export function getTaskStatusLabel(status: CoordTaskStatus) {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "review":
      return "Review";
    default:
      return startCase(status);
  }
}

export function getTaskPriorityLabel(priority: CoordTaskPriority) {
  return startCase(priority);
}

export function getTaskPriorityWeight(priority: CoordTaskPriority) {
  switch (priority) {
    case "low":
      return 0;
    case "normal":
      return 1;
    case "high":
      return 2;
    case "urgent":
      return 3;
    default:
      return 1;
  }
}

export function getTaskOwnerLabel(
  owner: string | null,
  agents: CoordAgentSummary[],
) {
  if (!owner) {
    return "Unassigned";
  }

  return agents.find((agent) => agent.id === owner)?.name ?? owner;
}

export function getTaskPlanLabel(planId: string | null, plans: CoordPlanSummary[]) {
  if (!planId) {
    return "No plan";
  }

  return plans.find((plan) => plan.id === planId)?.name ?? planId;
}

export function buildTaskOwnerOptions(
  tasks: CoordTaskSummary[],
  agents: CoordAgentSummary[],
) {
  const owners = new Set(
    tasks.map((task) => task.owner).filter((owner): owner is string => Boolean(owner)),
  );

  for (const agent of agents) {
    owners.add(agent.id);
  }

  return [...owners].sort((left, right) => left.localeCompare(right));
}

export function buildTaskPlanOptions(tasks: CoordTaskSummary[], plans: CoordPlanSummary[]) {
  const planIds = new Set(
    tasks.map((task) => task.planId).filter((planId): planId is string => Boolean(planId)),
  );

  for (const plan of plans) {
    planIds.add(plan.id);
  }

  return [...planIds].sort((left, right) => left.localeCompare(right));
}

export function sortTasksForBoard(left: CoordTaskSummary, right: CoordTaskSummary) {
  const priorityDelta =
    getTaskPriorityWeight(right.priority) - getTaskPriorityWeight(left.priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function startCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
