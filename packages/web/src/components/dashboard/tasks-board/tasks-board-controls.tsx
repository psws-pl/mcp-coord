"use client";

import type { Dispatch, SetStateAction } from "react";
import { Filter, KanbanSquare, Layers3, LoaderCircle, Plus, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getTaskOwnerLabel,
  getTaskPlanLabel,
  getTaskPriorityLabel,
  getTaskStatusLabel,
  TASK_PRIORITY_ORDER,
} from "@/lib/coord/tasks";
import type {
  CoordAgentSummary,
  CoordPlanSummary,
  CoordTaskPriority,
  CoordTaskStatus,
} from "@/lib/coord/types";

import type { CreateTaskDraft } from "./types";
import { formControlClassName, laneBadgeClassName } from "./utils";

interface TasksBoardControlsProps {
  agents: CoordAgentSummary[];
  plans: CoordPlanSummary[];
  createDraft: CreateTaskDraft;
  setCreateDraft: Dispatch<SetStateAction<CreateTaskDraft>>;
  createPending: boolean;
  handleCreateTask: () => void;
  ownerOptions: string[];
  ownerFilter: string;
  setOwnerFilter: (value: string) => void;
  planOptions: string[];
  planFilter: string;
  setPlanFilter: (value: string) => void;
  searchValue: string;
  setSearchValue: (value: string) => void;
  filteredCount: number;
  totalCount: number;
  laneCounts: Array<{ status: CoordTaskStatus; count: number }>;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  statusMessage: string | null;
  errorMessage: string | null;
}

export function TasksBoardControls({
  agents,
  plans,
  createDraft,
  setCreateDraft,
  createPending,
  handleCreateTask,
  ownerOptions,
  ownerFilter,
  setOwnerFilter,
  planOptions,
  planFilter,
  setPlanFilter,
  searchValue,
  setSearchValue,
  filteredCount,
  totalCount,
  laneCounts,
  hasActiveFilters,
  clearFilters,
  statusMessage,
  errorMessage,
}: TasksBoardControlsProps) {
  return (
    <Card className="relative overflow-hidden rounded-[2rem] bg-background/90 backdrop-blur">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_55%),linear-gradient(90deg,rgba(255,255,255,0.7),transparent)]" />

      <CardContent className="relative grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.35fr)_24rem]">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge className="gap-2 border-primary/15 bg-primary/[0.08] px-3 py-1 text-primary">
                <KanbanSquare className="size-3.5" />
                Tasks board
              </Badge>

              <div className="space-y-2">
                <h3 className="text-2xl font-semibold tracking-tight text-balance sm:text-[2rem]">
                  A calmer dashboard shell with the kanban front and center
                </h3>
                <p className="max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[0.95rem]">
                  Keep lane counts, filters, and quick actions close together so the board feels
                  lighter to scan and easier to use throughout the day.
                </p>
              </div>
            </div>

            <Card className="rounded-[1.35rem] bg-background/85 px-4 py-3 shadow-[0_16px_45px_-36px_rgba(15,23,42,0.45)]">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
                Visible work
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-tight">{filteredCount}</span>
                <span className="pb-1 text-sm text-muted-foreground">of {totalCount}</span>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {laneCounts.map(({ status, count }) => (
              <Card
                key={status}
                className="rounded-[1.35rem] bg-background/85 p-4 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.5)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {getTaskStatusLabel(status)}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">{count}</p>
                  </div>
                  <span className={laneBadgeClassName(status)}>{getTaskStatusLabel(status)}</span>
                </div>
              </Card>
            ))}
          </div>

          <div className="rounded-[1.5rem] border border-border/70 bg-muted/[0.36] p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  <Filter className="size-3.5" />
                  Filter and focus
                </div>
                <p className="text-sm text-muted-foreground">
                  Search titles, narrow by owner or plan, then clear back to the full board.
                </p>
              </div>
              {hasActiveFilters ? (
                <Badge
                  variant="outline"
                  className="gap-2 border-primary/15 bg-background/80 px-3 py-1 text-primary"
                >
                  Filtered view
                </Badge>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,0.85fr))_auto]">
              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Search</span>
                <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/85 px-3.5 shadow-[0_1px_0_rgba(15,23,42,0.03)] transition focus-within:border-primary/35 focus-within:ring-4 focus-within:ring-primary/10">
                  <Search className="size-4 text-muted-foreground" />
                  <Input
                    value={searchValue}
                    onChange={(event) => setSearchValue(event.target.value)}
                    placeholder="Search tasks, owners, or plans"
                    className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  />
                </div>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium text-foreground">Owner</span>
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                  className={formControlClassName}
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
                  className={formControlClassName}
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
                  className="h-11 w-full rounded-2xl border-border/70 bg-background/85"
                  disabled={!hasActiveFilters}
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </div>
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
        </div>

        <Card className="rounded-[1.75rem] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <Layers3 className="size-3.5" />
                Quick create
              </div>
              <div>
                <h4 className="text-lg font-semibold tracking-tight">
                  Add a new task without leaving the board
                </h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Keep creation lightweight so the board stays the main workspace.
                </p>
              </div>
            </div>

            <Badge variant="muted" className="gap-2 border-border/70 px-3 py-1">
              <Plus className="size-3.5" />
              Pending
            </Badge>
          </div>

          <div className="mt-5 space-y-4">
            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Title</span>
              <Input
                value={createDraft.title}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Task title"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
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
                  className={formControlClassName}
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
                className={formControlClassName}
              >
                <option value="">No plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-medium text-foreground">Description</span>
              <Textarea
                value={createDraft.description}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                rows={5}
                placeholder="Add implementation notes, acceptance criteria, or blockers."
              />
            </label>

            <Button
              type="button"
              className="h-11 w-full rounded-2xl shadow-[0_16px_35px_-24px_rgba(79,70,229,0.55)]"
              disabled={createPending}
              onClick={handleCreateTask}
            >
              {createPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Creating task
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  Create task
                </>
              )}
            </Button>
          </div>
        </Card>
      </CardContent>
    </Card>
  );
}
