"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ListTodo,
  LoaderCircle,
  PauseCircle,
  PlayCircle,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { createPlan, listPlans, listTasks, updatePlan } from "@/lib/coord/api";
import { useCoordRealtimeRefresh } from "@/lib/coord/live";
import {
  formatPlanDate,
  getPlanActionStatus,
  getPlanProgressPercent,
  getPlanStatusBadgeClassName,
  getPlanStatusLabel,
  PLAN_ACTION_STATUSES,
} from "@/lib/coord/plans";
import { getTaskPriorityLabel, getTaskStatusLabel } from "@/lib/coord/tasks";
import type {
  CoordPlanSummary,
  CoordTaskStatus,
  CoordTaskSummary,
} from "@/lib/coord/types";
import { cn } from "@/lib/utils";

interface PlansPanelProps {
  plans: CoordPlanSummary[];
  tasks: CoordTaskSummary[];
}

interface CreatePlanDraft {
  name: string;
  description: string;
  owner: string;
}

const PLAN_STATUS_ACTIONS = [
  {
    status: "active",
    label: "Active",
    icon: PlayCircle,
  },
  {
    status: "paused",
    label: "Paused",
    icon: PauseCircle,
  },
  {
    status: "completed",
    label: "Completed",
    icon: CheckCircle2,
  },
] as const satisfies ReadonlyArray<{
  status: (typeof PLAN_ACTION_STATUSES)[number];
  label: string;
  icon: typeof PlayCircle;
}>;

export function PlansPanel({ plans: initialPlans, tasks }: PlansPanelProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [planTasks, setPlanTasks] = useState(tasks);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(
    initialPlans[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<CreatePlanDraft>({
    name: "",
    description: "",
    owner: "orch",
  });
  const [createPending, setCreatePending] = useState(false);
  const [pendingStatusKey, setPendingStatusKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlans(initialPlans);
    setExpandedPlanId((current) =>
      current && initialPlans.some((plan) => plan.id === current)
        ? current
        : initialPlans[0]?.id ?? null,
    );
  }, [initialPlans]);

  useEffect(() => {
    setPlanTasks(tasks);
  }, [tasks]);

  const tasksByPlanId = useMemo(() => {
    const grouped = new Map<string, CoordTaskSummary[]>();

    for (const task of planTasks) {
      if (!task.planId) {
        continue;
      }

      const items = grouped.get(task.planId);

      if (items) {
        items.push(task);
        continue;
      }

      grouped.set(task.planId, [task]);
    }

    for (const [planId, planTasks] of grouped.entries()) {
      grouped.set(planId, [...planTasks].sort(sortLinkedTasks));
    }

    return grouped;
  }, [planTasks]);

  const refreshPlans = async () => {
    const result = await listPlans();
    setPlans(result.items);
  };

  const refreshTasks = async () => {
    const result = await listTasks();
    setPlanTasks(result.items);
  };

  useCoordRealtimeRefresh({
    handlers: {
      plan: async () => {
        await refreshPlans();
      },
      task: async () => {
        await Promise.all([refreshTasks(), refreshPlans()]);
      },
    },
    poll: async () => {
      await Promise.all([refreshPlans(), refreshTasks()]);
    },
  });

  const handleStatusUpdate = async (
    planId: string,
    nextStatus: (typeof PLAN_ACTION_STATUSES)[number],
  ) => {
    const currentPlan = plans.find((plan) => plan.id === planId);

    if (!currentPlan) {
      return;
    }

    if (getPlanActionStatus(currentPlan.status) === nextStatus) {
      return;
    }

    const previousPlans = plans;
    const optimisticPlan: CoordPlanSummary = {
      ...currentPlan,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    const actionKey = `${planId}:${nextStatus}`;

    setPendingStatusKey(actionKey);
    setErrorMessage(null);
    setStatusMessage(null);
    setPlans((current) =>
      current.map((plan) => (plan.id === planId ? optimisticPlan : plan)),
    );

    try {
      const result = await updatePlan(planId, {
        status: nextStatus,
      });
      setStatusMessage(result.meta.reason ?? `Plan marked ${nextStatus}.`);
    } catch (error) {
      setPlans(previousPlans);
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the plan.");
    } finally {
      setPendingStatusKey(null);
    }
  };

  const handleCreatePlan = async () => {
    const name = draft.name.trim();
    const description = draft.description.trim();

    if (!name) {
      setErrorMessage("Plan name is required.");
      return;
    }

    const previousPlans = plans;
    const optimisticPlan: CoordPlanSummary = {
      id: `plan-preview:${Date.now()}`,
      name,
      description,
      status: "draft",
      owner: normalizePlanOwner(draft.owner),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskCounts: {
        total: 0,
        done: 0,
        active: 0,
        blocked: 0,
      },
    };

    setCreatePending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setPlans((current) => [optimisticPlan, ...current]);
    setExpandedPlanId(optimisticPlan.id);

    try {
      const result = await createPlan({
        name,
        description,
        owner: normalizePlanOwner(draft.owner),
      });
      setStatusMessage(result.meta.reason ?? "Plan created.");
      setDraft({
        name: "",
        description: "",
        owner: draft.owner,
      });

      if (result.item) {
        const createdPlan = result.item;
        setPlans((current) =>
          current.map((plan) => (plan.id === optimisticPlan.id ? createdPlan : plan)),
        );
        setExpandedPlanId(createdPlan.id);
      }
    } catch (error) {
      setPlans(previousPlans);
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the plan.");
    } finally {
      setCreatePending(false);
    }
  };

  return (
    <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">Plans grid</h3>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Plan cards stay backed by the typed plan collection, surface progress from linked
            task counts, and stay aligned with live coord plan mutations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <ListTodo className="size-4" />
          {plans.length} plans
          <span className="rounded-full border bg-muted/20 px-2.5 py-1 text-[11px]">
            {planTasks.filter((task) => task.planId).length} linked tasks
          </span>
        </div>
      </div>

      {statusMessage ? (
        <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-6 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 rounded-3xl border bg-muted/10 p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold tracking-tight">Create plan</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            Plan creation posts through the live coord plan tool with an optimistic
            preview while the request is in flight.
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_auto]">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Name</span>
            <input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Plan name"
              className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Owner</span>
            <input
              value={draft.owner}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  owner: event.target.value,
                }))
              }
              placeholder="orch"
              className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
            />
          </label>

          <div className="flex items-end">
            <Button type="button" disabled={createPending} onClick={handleCreatePlan} className="h-11 w-full rounded-2xl">
              {createPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create plan
            </Button>
          </div>
        </div>

        <label className="mt-3 block space-y-2 text-sm">
          <span className="font-medium text-foreground">Description</span>
          <textarea
            value={draft.description}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            rows={4}
            placeholder="Describe the execution scope, outcomes, or constraints."
            className="w-full rounded-3xl border bg-background px-4 py-3 outline-none"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => {
          const linkedTasks = tasksByPlanId.get(plan.id) ?? [];
          const isExpanded = expandedPlanId === plan.id;
          const progressPercent = getPlanProgressPercent(plan);

          return (
            <article
              key={plan.id}
              className={cn(
                "rounded-3xl border bg-muted/10 p-5 shadow-sm transition",
                isExpanded && "border-primary/30 bg-primary/5",
              )}
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedPlanId((current) => (current === plan.id ? null : plan.id))
                }
                className="w-full text-left"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        {plan.id}
                      </p>
                      <span className={getPlanStatusBadgeClassName(plan.status)}>
                        {getPlanStatusLabel(plan.status)}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-lg font-semibold tracking-tight">{plan.name}</h4>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {plan.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                    {isExpanded ? "Collapse" : "Expand"}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Owner
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {plan.owner ?? "Unassigned"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Created
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {formatPlanDate(plan.createdAt)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Progress
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {plan.taskCounts.done}/{plan.taskCounts.total} tasks complete
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <span>{progressPercent}% complete</span>
                    <span>{linkedTasks.length} linked tasks</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </button>

              <div className="mt-5 flex flex-col gap-3 border-t pt-4">
                <div className="flex flex-wrap gap-2">
                  {PLAN_STATUS_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    const actionKey = `${plan.id}:${action.status}`;
                    const isActive = getPlanActionStatus(plan.status) === action.status;
                    const isPending = pendingStatusKey === actionKey;

                    return (
                      <Button
                        key={action.status}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        disabled={Boolean(pendingStatusKey)}
                        onClick={() => handleStatusUpdate(plan.id, action.status)}
                      >
                        {isPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Icon className="size-4" />
                        )}
                        {action.label}
                      </Button>
                    );
                  })}
                </div>

                {isExpanded ? (
                  <div className="rounded-2xl border bg-background/90 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h5 className="font-semibold tracking-tight">Linked task list</h5>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Task chips stay aligned with the shared task contract and preview the
                          current linked scope for this plan.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        <span className="rounded-full border px-3 py-1">
                          {plan.taskCounts.active} active
                        </span>
                        <span className="rounded-full border px-3 py-1">
                          {plan.taskCounts.blocked} blocked
                        </span>
                      </div>
                    </div>

                    {linkedTasks.length > 0 ? (
                      <ul className="mt-4 space-y-3">
                        {linkedTasks.map((task) => (
                          <li
                            key={task.id}
                            className="rounded-2xl border bg-muted/10 px-4 py-3"
                          >
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                    {task.id}
                                  </p>
                                  <span className={getTaskStatusChipClassName(task.status)}>
                                    {getTaskStatusLabel(task.status)}
                                  </span>
                                </div>
                                <div>
                                  <p className="font-semibold tracking-tight">{task.title}</p>
                                  <p className="text-sm leading-6 text-muted-foreground">
                                    {task.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium">
                                  {task.owner ?? "Unassigned"}
                                </span>
                                <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                                  {getTaskPriorityLabel(task.priority)}
                                </span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
                        No linked tasks are available yet for this plan.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function sortLinkedTasks(left: CoordTaskSummary, right: CoordTaskSummary) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function normalizePlanOwner(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getTaskStatusChipClassName(status: CoordTaskStatus) {
  switch (status) {
    case "pending":
      return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700";
    case "in_progress":
      return "inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700";
    case "review":
      return "inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700";
    case "done":
      return "inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700";
    case "blocked":
      return "inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700";
    default:
      return "inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground";
  }
}
