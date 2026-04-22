"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  sortTasksForBoard,
  TASK_STATUS_ORDER,
} from "@/lib/coord/tasks";
import type {
  CoordAgentSummary,
  CoordPlanSummary,
  CoordTaskDetail,
  CoordTaskSummary,
} from "@/lib/coord/types";

import { TaskDetailSheet } from "./tasks-board/task-detail-sheet";
import { TasksBoardControls } from "./tasks-board/tasks-board-controls";
import { TasksLane } from "./tasks-board/tasks-lane";
import type { CreateTaskDraft, TaskDraft } from "./tasks-board/types";
import {
  createInitialTaskDraft,
  normalizeOwnerValue,
  normalizePlanValue,
  restoreDetailOverride,
} from "./tasks-board/utils";

interface TasksBoardProps {
  tasks: CoordTaskSummary[];
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
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
    createInitialTaskDraft(initialAgents),
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

  const laneCounts = useMemo(
    () =>
      TASK_STATUS_ORDER.map((status) => ({
        status,
        count: tasksByStatus[status].length,
      })),
    [tasksByStatus],
  );

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
      setDetailOverrides((current) =>
        restoreDetailOverride(current, selectedTask.id, previousDetail),
      );
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
      <div className="space-y-6">
        <TasksBoardControls
          agents={agents}
          plans={plans}
          createDraft={createDraft}
          setCreateDraft={setCreateDraft}
          createPending={createPending}
          handleCreateTask={handleCreateTask}
          ownerOptions={ownerOptions}
          ownerFilter={ownerFilter}
          setOwnerFilter={setOwnerFilter}
          planOptions={planOptions}
          planFilter={planFilter}
          setPlanFilter={setPlanFilter}
          searchValue={searchValue}
          setSearchValue={setSearchValue}
          filteredCount={filteredTasks.length}
          totalCount={tasks.length}
          laneCounts={laneCounts}
          hasActiveFilters={hasActiveFilters}
          clearFilters={() => {
            setOwnerFilter("all");
            setPlanFilter("all");
            setSearchValue("");
          }}
          statusMessage={statusMessage}
          errorMessage={errorMessage}
        />

        <Card className="rounded-[2rem] bg-background/85 backdrop-blur">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                  Interactive board
                </p>
                <h3 className="text-xl font-semibold tracking-tight">
                  Kanban is the primary workflow view
                </h3>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  Open any card for detail editing, keep quick assignment close to the work, and
                  scan each lane with sticky headers and stronger priority cues.
                </p>
              </div>

              <Badge variant="muted" className="gap-2 border-border/70 px-3.5 py-2">
                {filteredTasks.length} cards in view
              </Badge>
            </div>

            <div className="mt-5 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-4 pr-1">
                {TASK_STATUS_ORDER.map((status) => (
                  <TasksLane
                    key={status}
                    status={status}
                    tasks={tasksByStatus[status]}
                    agents={agents}
                    plans={plans}
                    selectedTaskId={selectedTaskId}
                    assignPendingTaskId={assignPendingTaskId}
                    onOpenTask={openTask}
                    onAssignTask={handleAssignTask}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TaskDetailSheet
        selectedDetail={selectedDetail}
        draft={draft}
        setDraft={setDraft}
        agents={agents}
        plans={plans}
        assignPendingTaskId={assignPendingTaskId}
        draftHasChanges={draftHasChanges}
        isDetailLoading={isDetailLoading}
        savePending={savePending}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        onClose={closeSheet}
        onSave={handleSave}
      />
    </>
  );
}
