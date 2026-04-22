"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, Layers3, PlayCircle, ShieldAlert } from "lucide-react";

import { getTaskStatusLabel } from "@/lib/coord/tasks";
import type { CoordAgentSummary, CoordPlanSummary, CoordTaskStatus, CoordTaskSummary } from "@/lib/coord/types";
import { cn } from "@/lib/utils";

import {
  getLaneDescription,
  laneAccentClassName,
  laneBadgeClassName,
  laneIconClassName,
  laneSurfaceClassName,
} from "./utils";
import { TaskCard } from "./task-card";

interface TasksLaneProps {
  status: CoordTaskStatus;
  tasks: CoordTaskSummary[];
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
  selectedTaskId: string | null;
  assignPendingTaskId: string | null;
  onOpenTask: (taskId: string) => void;
  onAssignTask: (task: CoordTaskSummary, agentId: string) => void;
}

const laneIcons = {
  pending: CircleDashed,
  in_progress: PlayCircle,
  review: Layers3,
  done: CheckCircle2,
  blocked: ShieldAlert,
} as const;

export function TasksLane({
  status,
  tasks,
  agents,
  plans,
  selectedTaskId,
  assignPendingTaskId,
  onOpenTask,
  onAssignTask,
}: TasksLaneProps) {
  const Icon = laneIcons[status as keyof typeof laneIcons] ?? AlertTriangle;

  return (
    <section
      className={cn(
        "flex max-h-[calc(100vh-14rem)] w-[20rem] flex-col rounded-[1.75rem] border p-3 shadow-[0_24px_55px_-46px_rgba(15,23,42,0.45)]",
        laneSurfaceClassName(status),
      )}
    >
      <div className="rounded-[1.25rem] bg-background/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-2xl bg-background shadow-[0_12px_25px_-20px_rgba(15,23,42,0.45)]",
                )}
              >
                <Icon className={cn("size-[18px]", laneIconClassName(status))} />
              </span>
              <div>
                <p className="text-sm font-semibold tracking-tight">{getTaskStatusLabel(status)}</p>
                <p className="text-xs text-muted-foreground">{getLaneDescription(status)}</p>
              </div>
            </div>
          </div>

          <span className={laneBadgeClassName(status)}>{tasks.length}</span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/18 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Cards in lane</span>
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", laneAccentClassName(status))} />
            <span>{tasks.length}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                agents={agents}
                plans={plans}
                selected={task.id === selectedTaskId}
                assignPending={assignPendingTaskId === task.id}
                onOpenTask={onOpenTask}
                onAssignTask={onAssignTask}
              />
            ))
          ) : (
            <div className="flex h-full min-h-48 items-center justify-center rounded-[1.45rem] border border-dashed border-border/80 bg-background/55 px-4 py-8 text-center text-sm leading-6 text-muted-foreground">
              No matching tasks in this lane.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
