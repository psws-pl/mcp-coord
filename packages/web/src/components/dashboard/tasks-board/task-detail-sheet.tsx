"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowUpDown, CheckCircle2, Layers3, LoaderCircle, X } from "lucide-react";

import { SearchableAgentPicker } from "@/components/dashboard/searchable-agent-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  getTaskOwnerLabel,
  getTaskPlanLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_ORDER,
} from "@/lib/coord/tasks";
import type {
  CoordAgentSummary,
  CoordPlanSummary,
  CoordTaskDetail,
  CoordTaskPriority,
  CoordTaskStatus,
} from "@/lib/coord/types";

import type { TaskDraft } from "./types";
import {
  formControlClassName,
  formatTimestamp,
  laneBadgeClassName,
  priorityBadgeClassName,
} from "./utils";

interface TaskDetailSheetProps {
  selectedDetail: CoordTaskDetail | null;
  draft: TaskDraft | null;
  setDraft: Dispatch<SetStateAction<TaskDraft | null>>;
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
  assignPendingTaskId: string | null;
  draftHasChanges: boolean;
  isDetailLoading: boolean;
  savePending: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onClose: () => void;
  onSave: () => void;
}

export function TaskDetailSheet({
  selectedDetail,
  draft,
  setDraft,
  agents,
  plans,
  assignPendingTaskId,
  draftHasChanges,
  isDetailLoading,
  savePending,
  statusMessage,
  errorMessage,
  onClose,
  onSave,
}: TaskDetailSheetProps) {
  if (!selectedDetail || !draft) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close task detail"
        className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <section className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border/70 bg-background/95 shadow-2xl backdrop-blur">
        <div className="border-b border-border/70 bg-background/92 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={laneBadgeClassName(selectedDetail.status)}>
                  {getTaskStatusLabel(selectedDetail.status)}
                </Badge>
                <Badge className={priorityBadgeClassName(selectedDetail.priority)}>
                  {getTaskPriorityLabel(selectedDetail.priority)}
                </Badge>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                  {selectedDetail.id}
                </p>
                <h3 className="text-2xl font-semibold tracking-tight text-balance">
                  {selectedDetail.title}
                </h3>
                <p className="text-sm leading-6 text-muted-foreground">
                  Linked plan: {getTaskPlanLabel(selectedDetail.planId, plans)}
                </p>
              </div>
            </div>

            <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onClose}>
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="rounded-[1.35rem] bg-muted/18 px-4 py-3 shadow-none">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Owner
                </p>
                <p className="mt-2 text-sm font-semibold">{getTaskOwnerLabel(selectedDetail.owner, agents)}</p>
              </Card>
              <Card className="rounded-[1.35rem] bg-muted/18 px-4 py-3 shadow-none">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Updated
                </p>
                <p className="mt-2 text-sm font-semibold">{formatTimestamp(selectedDetail.updatedAt)}</p>
              </Card>
              <Card className="rounded-[1.35rem] bg-muted/18 px-4 py-3 shadow-none">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Live detail
                </p>
                <p className="mt-2 text-sm font-semibold">
                  {isDetailLoading ? "Refreshing…" : "Ready"}
                </p>
              </Card>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-[1.35rem] border border-border/70 bg-background/88 px-4 py-3 text-sm">
              <div className="inline-flex items-center gap-2 text-muted-foreground">
                {isDetailLoading ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Refreshing task detail
                  </>
                ) : (
                  <>
                    <Layers3 className="size-4" />
                    Detail synced
                  </>
                )}
              </div>
              <div className="inline-flex items-center gap-2 text-muted-foreground">
                <ArrowUpDown className="size-4" />
                Updated {formatTimestamp(selectedDetail.updatedAt)}
              </div>
            </div>

            {statusMessage ? (
              <div className="rounded-[1.35rem] border border-primary/20 bg-primary/[0.07] px-4 py-3 text-sm text-primary">
                {statusMessage}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="rounded-[1.35rem] border border-destructive/25 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive">
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
                  className={formControlClassName}
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
                  className={formControlClassName}
                >
                  {TASK_PRIORITY_ORDER.map((priority) => (
                    <option key={priority} value={priority}>
                      {getTaskPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-[1.35rem] border border-border/70 bg-muted/[0.24] p-4">
              <SearchableAgentPicker
                agents={agents}
                selectedAgentId={draft.owner || null}
                pendingAgentId={assignPendingTaskId === selectedDetail.id ? draft.owner : null}
                disabled={assignPendingTaskId === selectedDetail.id}
                label="Owner"
                onSelect={(agentId) =>
                  setDraft((current) => (current ? { ...current, owner: agentId } : current))
                }
              />
            </div>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <Textarea
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
                rows={10}
              />
            </label>
          </div>
        </div>

        <div className="border-t border-border/70 bg-background/92 px-6 py-5 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4" />
              {draftHasChanges ? "Unsaved changes ready." : "No pending edits."}
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
                Close
              </Button>
              <Button
                type="button"
                className="rounded-full shadow-[0_16px_35px_-24px_rgba(79,70,229,0.55)]"
                disabled={savePending || !draftHasChanges}
                onClick={onSave}
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
  );
}
