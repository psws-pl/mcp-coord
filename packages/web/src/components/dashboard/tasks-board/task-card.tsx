"use client";

import { ArrowUpRight, Clock3 } from "lucide-react";

import { SearchableAgentPicker } from "@/components/dashboard/searchable-agent-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  getTaskOwnerLabel,
  getTaskPlanLabel,
  getTaskPriorityLabel,
} from "@/lib/coord/tasks";
import type { CoordAgentSummary, CoordPlanSummary, CoordTaskSummary } from "@/lib/coord/types";
import { cn } from "@/lib/utils";

import { formatRelativeTimestamp, priorityBadgeClassName } from "./utils";

interface TaskCardProps {
  task: CoordTaskSummary;
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
  selected: boolean;
  assignPending: boolean;
  onOpenTask: (taskId: string) => void;
  onAssignTask: (task: CoordTaskSummary, agentId: string) => void;
}

export function TaskCard({
  task,
  agents,
  plans,
  selected,
  assignPending,
  onOpenTask,
  onAssignTask,
}: TaskCardProps) {
  return (
    <Card
      className={cn(
        "group rounded-[1.45rem] bg-background/95 p-4 transition duration-200",
        selected
          ? "border-primary/35 bg-primary/[0.045] shadow-[0_22px_55px_-34px_rgba(79,70,229,0.42)]"
          : "hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_22px_55px_-38px_rgba(15,23,42,0.5)]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpenTask(task.id)}
        className="block w-full rounded-[1.1rem] text-left outline-none transition focus-visible:ring-4 focus-visible:ring-primary/12"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              <span>{task.id}</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="size-3" />
                {formatRelativeTimestamp(task.updatedAt)}
              </span>
            </div>
            <h4 className="text-[0.98rem] font-semibold tracking-tight text-foreground">
              {task.title}
            </h4>
          </div>

          <Badge className={priorityBadgeClassName(task.priority)}>
            {getTaskPriorityLabel(task.priority)}
          </Badge>
        </div>

        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {task.description || "No description provided yet."}
        </p>
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="outline" className="px-3 py-1 text-xs normal-case tracking-normal">
          {getTaskOwnerLabel(task.owner, agents)}
        </Badge>
        <Badge variant="muted" className="px-3 py-1 text-xs normal-case tracking-normal">
          {getTaskPlanLabel(task.planId, plans)}
        </Badge>
      </div>

      <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Quick actions
          </p>
          <Button
            type="button"
            variant={selected ? "default" : "outline"}
            size="sm"
            className={cn("rounded-full", selected && "shadow-[0_12px_30px_-22px_rgba(79,70,229,0.7)]")}
            onClick={() => onOpenTask(task.id)}
          >
            <ArrowUpRight className="size-3.5" />
            Details
          </Button>
        </div>

        <SearchableAgentPicker
          agents={agents}
          selectedAgentId={task.owner}
          pendingAgentId={assignPending ? task.owner : null}
          disabled={assignPending}
          label="Quick assign"
          onSelect={(agentId) => void onAssignTask(task, agentId)}
        />
      </div>
    </Card>
  );
}
