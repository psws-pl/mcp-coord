"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  Filter,
  Layers3,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableAgentPicker } from "@/components/dashboard/searchable-agent-picker";
import {
  assignTask,
  createTask,
  getTask,
  listAgents,
  listPlans,
  listTasks,
  updateTask,
} from "@/lib/coord/api";
import { useCoordRealtimeRefresh } from "@/lib/coord/live";
import {
  buildTaskOwnerOptions,
  buildTaskPlanOptions,
  getTaskOwnerLabel,
  getTaskPlanLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  sortTasksForBoard,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_ORDER,
} from "@/lib/coord/tasks";
import type {
  CoordAgentSummary,
  CoordPlanSummary,
  CoordTaskDetail,
  CoordTaskPriority,
  CoordTaskStatus,
  CoordTaskSummary,
} from "@/lib/coord/types";

interface TasksBoardProps {
  tasks: CoordTaskSummary[];
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
}

interface TaskDraft {
  status: CoordTaskStatus;
  owner: string;
  priority: CoordTaskPriority;
  description: string;
}

interface CreateTaskDraft {
  title: string;
  description: string;
  owner: string;
  priority: CoordTaskPriority;
  planId: string;
}

export function TasksBoard({
  tasks: initialTasks,
  agents: initialAgents,
  plans: initialPlans,
}: TasksBoardProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [agents, setAgents] = useState(initialAgents);
  const [plans, setPlans] = useState(initialPlans);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [detailOverrides, setDetailOverrides] = useState<
    Record<string, CoordTaskDetail>
  >({});
  const [draft, setDraft] = useState<TaskDraft | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [searchValue, setSearchValue] = useState("");
  const [createDraft, setCreateDraft] = useState<CreateTaskDraft>(() =>
    createInitialTaskDraft(agents),
  );
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [assignPendingTaskId, setAssignPendingTaskId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    setPlans(initialPlans);
  }, [initialPlans]);

  useEffect(() => {
    setCreateDraft((current) => {
      if (current.owner) {
        return current;
      }

      return {
        ...current,
        owner: agents[0]?.id ?? "",
      };
    });
  }, [agents]);

  const ownerOptions = useMemo(
    () => buildTaskOwnerOptions(tasks, agents),
    [agents, tasks],
  );
  const planOptions = useMemo(() => buildTaskPlanOptions(tasks, plans), [plans, tasks]);

  const selectedTask = useMemo(() => {
    if (!selectedTaskId) {
      return null;
    }

    return tasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [selectedTaskId, tasks]);

  const selectedDetail = useMemo(() => {
    if (!selectedTask) {
      return null;
    }

    return detailOverrides[selectedTask.id] ?? selectedTask;
  }, [detailOverrides, selectedTask]);

  const hasActiveFilters = ownerFilter !== "all" || planFilter !== "all" || searchValue !== "";

  const filteredTasks = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (ownerFilter !== "all" && (task.owner ?? "unassigned") !== ownerFilter) {
          return false;
        }

        if (planFilter !== "all" && (task.planId ?? "none") !== planFilter) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [task.id, task.title, task.description, task.owner ?? "", task.planId ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort(sortTasksForBoard);
  }, [ownerFilter, planFilter, searchValue, tasks]);

  const tasksByStatus = useMemo(() => {
    return Object.fromEntries(
      TASK_STATUS_ORDER.map((status) => [
        status,
        filteredTasks.filter((task) => task.status === status),
      ]),
    ) as Record<(typeof TASK_STATUS_ORDER)[number], CoordTaskSummary[]>;
  }, [filteredTasks]);

  const draftHasChanges =
    selectedDetail && draft
      ? selectedDetail.status !== draft.status ||
        (selectedDetail.owner ?? "") !== normalizeOwnerValue(draft.owner) ||
        selectedDetail.priority !== draft.priority ||
        selectedDetail.description !== draft.description.trim()
      : false;

  useEffect(() => {
    if (!selectedDetail) {
      setDraft(null);
      return;
    }

    setDraft({
      status: selectedDetail.status,
      owner: selectedDetail.owner ?? "",
      priority: selectedDetail.priority,
      description: selectedDetail.description,
    });
  }, [selectedDetail]);

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    let active = true;
    setIsDetailLoading(true);

    getTask(selectedTaskId)
      .then((result) => {
        if (!active) {
          return;
        }

        setDetailOverrides((current) => ({
          ...current,
          [selectedTaskId]: result.item,
        }));

        if (result.meta.reason) {
          setStatusMessage(result.meta.reason);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load the latest task detail.",
        );
      })
      .finally(() => {
        if (active) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedTaskId]);

  const refreshTasks = async () => {
    const result = await listTasks();
    setTasks(result.items);
  };

  const refreshAgents = async () => {
    const result = await listAgents();
    setAgents(result.items);
  };

  const refreshPlans = async () => {
    const result = await listPlans();
    setPlans(result.items);
  };

  const refreshSelectedTaskDetail = async (taskId: string) => {
    const result = await getTask(taskId);
    setDetailOverrides((current) => ({
      ...current,
      [taskId]: result.item,
    }));
  };

  useCoordRealtimeRefresh({
    handlers: {
      task: async ({ id }) => {
        await refreshTasks();

        if (selectedTaskId === id) {
          await refreshSelectedTaskDetail(id);
        }
      },
      agent: async () => {
        await refreshAgents();
      },
      plan: async () => {
        await refreshPlans();
      },
    },
    poll: async () => {
      await Promise.all([
        refreshTasks(),
        refreshAgents(),
        refreshPlans(),
        selectedTaskId ? refreshSelectedTaskDetail(selectedTaskId) : Promise.resolve(),
      ]);
    },
  });

  const openTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const closeSheet = () => {
    setSelectedTaskId(null);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleSave = async () => {
    if (!selectedTask || !draft) {
      return;
    }

    const previousTasks = tasks;
    const previousDetail = detailOverrides[selectedTask.id];
    const description = draft.description.trim();
    const nextOwner = normalizeOwnerValue(draft.owner);
    const updatedAt = new Date().toISOString();
    const optimisticTask: CoordTaskDetail = {
      ...selectedTask,
      status: draft.status,
      owner: nextOwner,
      priority: draft.priority,
      description,
      updatedAt,
    };

    setSavePending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setTasks((current) =>
      current.map((task) => (task.id === selectedTask.id ? optimisticTask : task)),
    );
    setDetailOverrides((current) => ({
      ...current,
      [selectedTask.id]: optimisticTask,
    }));

    try {
      const result = await updateTask(selectedTask.id, {
        status: draft.status,
        owner: nextOwner,
        priority: draft.priority,
        description,
      });
      setStatusMessage(result.meta.reason ?? "Task updated.");
    } catch (error) {
      setTasks(previousTasks);
      setDetailOverrides((current) => restoreDetailOverride(current, selectedTask.id, previousDetail));
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the task.");
    } finally {
      setSavePending(false);
    }
  };

  const handleCreateTask = async () => {
    const title = createDraft.title.trim();
    const description = createDraft.description.trim();

    if (!title) {
      setErrorMessage("Task title is required.");
      return;
    }

    const previousTasks = tasks;
    const previewId = `task-preview:${Date.now()}`;
    const optimisticTask: CoordTaskSummary = {
      id: previewId,
      title,
      description,
      status: "pending",
      owner: normalizeOwnerValue(createDraft.owner),
      priority: createDraft.priority,
      planId: normalizePlanValue(createDraft.planId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCreatePending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setTasks((current) => [optimisticTask, ...current]);

    try {
      const result = await createTask({
        title,
        description,
        owner: normalizeOwnerValue(createDraft.owner),
        priority: createDraft.priority,
        planId: normalizePlanValue(createDraft.planId),
      });
      setStatusMessage(result.meta.reason ?? "Task created.");
      setCreateDraft(createInitialTaskDraft(agents));

      if (result.item) {
        const createdTask = result.item;
        setTasks((current) =>
          current.map((task) => (task.id === previewId ? createdTask : task)),
        );
      }
    } catch (error) {
      setTasks(previousTasks);
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the task.");
    } finally {
      setCreatePending(false);
    }
  };

  const handleAssignTask = async (task: CoordTaskSummary, agentId: string) => {
    const previousTasks = tasks;
    const previousDetail = detailOverrides[task.id];
    const updatedAt = new Date().toISOString();
    const optimisticTask: CoordTaskDetail = {
      ...task,
      owner: agentId,
      updatedAt,
    };

    setAssignPendingTaskId(task.id);
    setErrorMessage(null);
    setStatusMessage(null);
    setTasks((current) =>
      current.map((currentTask) => (currentTask.id === task.id ? optimisticTask : currentTask)),
    );
    setDetailOverrides((current) => ({
      ...current,
      [task.id]: optimisticTask,
    }));

    try {
      const result = await assignTask({
        agentId,
        taskId: task.id,
      });
      setStatusMessage(result.meta.reason ?? "Task reassigned.");

      if (result.item) {
        const updatedTask = result.item;
        setTasks((current) =>
          current.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)),
        );
        setDetailOverrides((current) => ({
          ...current,
          [task.id]: updatedTask,
        }));
      }
    } catch (error) {
      setTasks(previousTasks);
      setDetailOverrides((current) => restoreDetailOverride(current, task.id, previousDetail));
      setErrorMessage(error instanceof Error ? error.message : "Unable to assign the task.");
    } finally {
      setAssignPendingTaskId(null);
    }
  };

  return (
    <>
      <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">Kanban board</h3>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Status lanes stay aligned to the coord task contract while edit flows
              keep optimistic updates in sync with live task invalidations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            <Filter className="size-4" />
            {filteredTasks.length} visible
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.75fr))_auto]">
          <div className="rounded-3xl border bg-muted/10 p-4 lg:col-span-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold tracking-tight">Create task</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  New dashboard tasks post through the typed coord task tool and stay
                  preview-friendly when the transport falls back.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <Plus className="size-3.5" />
                Pending by default
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Title</span>
                <input
                  value={createDraft.title}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Task title"
                  className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Owner</span>
                <select
                  value={createDraft.owner}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      owner: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Priority</span>
                <select
                  value={createDraft.priority}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      priority: event.target.value as CoordTaskPriority,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                >
                  {TASK_PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {getTaskPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Plan</span>
                <select
                  value={createDraft.planId}
                  onChange={(event) =>
                    setCreateDraft((current) => ({
                      ...current,
                      planId: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                >
                  <option value="">No plan</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-3 block space-y-2 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <textarea
                value={createDraft.description}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={4}
                placeholder="Add implementation notes, acceptance criteria, or blockers."
                className="w-full rounded-3xl border bg-background px-4 py-3 outline-none"
              />
            </label>

            <div className="mt-3 flex justify-end">
              <Button type="button" disabled={createPending} onClick={handleCreateTask}>
                {createPending ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Create task
              </Button>
            </div>
          </div>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Search</span>
            <div className="flex items-center gap-2 rounded-2xl border bg-muted/15 px-3">
              <Search className="size-4 text-muted-foreground" />
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search tasks, owners, or plans"
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Owner</span>
            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              className="h-11 w-full rounded-2xl border bg-background px-3 text-sm outline-none"
            >
              <option value="all">All owners</option>
              <option value="unassigned">Unassigned</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {getTaskOwnerLabel(owner, agents)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">Plan</span>
            <select
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value)}
              className="h-11 w-full rounded-2xl border bg-background px-3 text-sm outline-none"
            >
              <option value="all">All plans</option>
              <option value="none">No plan</option>
              {planOptions.map((planId) => (
                <option key={planId} value={planId}>
                  {getTaskPlanLabel(planId, plans)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full rounded-2xl"
              disabled={!hasActiveFilters}
              onClick={() => {
                setOwnerFilter("all");
                setPlanFilter("all");
                setSearchValue("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {statusMessage ? (
          <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            {statusMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-5">
          {TASK_STATUS_ORDER.map((status) => {
            const laneTasks = tasksByStatus[status];

            return (
              <section
                key={status}
                className="flex min-h-[16rem] flex-col rounded-3xl border bg-muted/15 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold tracking-tight">
                      {getTaskStatusLabel(status)}
                    </p>
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      {laneTasks.length} tasks
                    </p>
                  </div>
                  <span className={laneBadgeClassName(status)}>{getTaskStatusLabel(status)}</span>
                </div>

                <div className="mt-4 flex flex-1 flex-col gap-3">
                  {laneTasks.length > 0 ? (
                    laneTasks.map((task) => (
                      <article
                        key={task.id}
                        className="rounded-2xl border bg-background p-4 transition hover:border-primary/30 hover:bg-muted/10"
                      >
                        <button
                          type="button"
                          onClick={() => openTask(task.id)}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                                {task.id}
                              </p>
                              <h4 className="font-semibold tracking-tight">{task.title}</h4>
                            </div>
                            <span className={priorityBadgeClassName(task.priority)}>
                              {getTaskPriorityLabel(task.priority)}
                            </span>
                          </div>

                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            {task.description}
                          </p>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium">
                              {getTaskOwnerLabel(task.owner, agents)}
                            </span>
                            <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                              {getTaskPlanLabel(task.planId, plans)}
                            </span>
                          </div>
                        </button>

                        <div className="mt-4 border-t pt-4">
                          <SearchableAgentPicker
                            agents={agents}
                            selectedAgentId={task.owner}
                            pendingAgentId={assignPendingTaskId === task.id ? task.owner : null}
                            disabled={assignPendingTaskId === task.id}
                            label="Quick assign"
                            onSelect={(agentId) => void handleAssignTask(task, agentId)}
                          />
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
                      No matching tasks in this lane.
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {selectedDetail && draft ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close task detail"
            className="absolute inset-0 bg-black/35"
            onClick={closeSheet}
          />

          <section className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={laneBadgeClassName(selectedDetail.status)}>
                    {getTaskStatusLabel(selectedDetail.status)}
                  </span>
                  <span className={priorityBadgeClassName(selectedDetail.priority)}>
                    {getTaskPriorityLabel(selectedDetail.priority)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    {selectedDetail.id}
                  </p>
                  <h3 className="text-2xl font-semibold tracking-tight">
                    {selectedDetail.title}
                  </h3>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  Linked plan: {getTaskPlanLabel(selectedDetail.planId, plans)}
                </p>
              </div>

              <Button type="button" variant="ghost" size="icon" onClick={closeSheet}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/20 px-4 py-3 text-sm">
                  <div className="inline-flex items-center gap-2 text-muted-foreground">
                    {isDetailLoading ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Refreshing detail
                      </>
                    ) : (
                      <>
                        <Layers3 className="size-4" />
                        Task detail ready
                      </>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-2 text-muted-foreground">
                    <ArrowUpDown className="size-4" />
                    Updated {formatTimestamp(selectedDetail.updatedAt)}
                  </div>
                </div>

                {statusMessage ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {statusMessage}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {errorMessage}
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Status</span>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                status: event.target.value as CoordTaskStatus,
                              }
                            : current,
                        )
                      }
                      className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                    >
                      {TASK_STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {getTaskStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2 text-sm">
                    <span className="font-medium text-foreground">Priority</span>
                    <select
                      value={draft.priority}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                priority: event.target.value as CoordTaskPriority,
                              }
                            : current,
                        )
                      }
                      className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
                    >
                      {TASK_PRIORITY_ORDER.map((priority) => (
                        <option key={priority} value={priority}>
                          {getTaskPriorityLabel(priority)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <SearchableAgentPicker
                  agents={agents}
                  selectedAgentId={normalizeOwnerValue(draft.owner)}
                  pendingAgentId={assignPendingTaskId === selectedDetail.id ? draft.owner : null}
                  disabled={assignPendingTaskId === selectedDetail.id}
                  label="Owner"
                  onSelect={(agentId) =>
                    setDraft((current) =>
                      current ? { ...current, owner: agentId } : current,
                    )
                  }
                />

                <label className="space-y-2 text-sm">
                  <span className="font-medium text-foreground">Description</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              description: event.target.value,
                            }
                          : current,
                      )
                    }
                    rows={8}
                    className="w-full rounded-3xl border bg-background px-4 py-3 outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="border-t px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4" />
                  {draftHasChanges ? "Unsaved changes ready." : "No pending edits."}
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={closeSheet}>
                    Close
                  </Button>
                  <Button
                    type="button"
                    disabled={savePending || !draftHasChanges}
                    onClick={handleSave}
                  >
                    {savePending ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Saving
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function restoreDetailOverride(
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

function normalizeOwnerValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlanValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createInitialTaskDraft(agents: CoordAgentSummary[]): CreateTaskDraft {
  return {
    title: "",
    description: "",
    owner: agents[0]?.id ?? "",
    priority: "normal",
    planId: "",
  };
}

function laneBadgeClassName(status: CoordTaskStatus) {
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

function priorityBadgeClassName(priority: CoordTaskPriority) {
  switch (priority) {
    case "urgent":
      return "inline-flex rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700";
    case "high":
      return "inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700";
    case "low":
      return "inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700";
    default:
      return "inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700";
  }
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
