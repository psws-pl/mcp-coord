"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, UserRoundPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CoordAgentSummary } from "@/lib/coord/types";
import { cn } from "@/lib/utils";

interface SearchableAgentPickerProps {
  agents: CoordAgentSummary[];
  selectedAgentId: string | null;
  onSelect: (agentId: string) => void;
  disabled?: boolean;
  pendingAgentId?: string | null;
  label?: string;
  className?: string;
}

export function SearchableAgentPicker({
  agents,
  selectedAgentId,
  onSelect,
  disabled = false,
  pendingAgentId = null,
  label = "Assign agent",
  className,
}: SearchableAgentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );
  const filteredAgents = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return [...agents]
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((agent) => {
        if (!query) {
          return true;
        }

        return [agent.id, agent.name, ...agent.capabilities.domains, ...agent.capabilities.taskTypes]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [agents, searchValue]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {selectedAgent?.name ?? "No agent selected"}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronsUpDown className="size-4" />
          {isOpen ? "Hide" : "Choose"}
        </Button>
      </div>

      {isOpen ? (
        <div className="rounded-2xl border bg-muted/10 p-3">
          <label className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-sm text-muted-foreground">
            <Search className="size-4" />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search agents"
              className="w-full bg-transparent outline-none"
              disabled={disabled}
            />
          </label>

          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {filteredAgents.length > 0 ? (
              filteredAgents.map((agent) => {
                const isSelected = agent.id === selectedAgentId;
                const isPending = pendingAgentId === agent.id;

                return (
                  <button
                    key={agent.id}
                    type="button"
                    disabled={disabled || isPending}
                    onClick={() => {
                      onSelect(agent.id);
                      setIsOpen(false);
                      setSearchValue("");
                    }}
                    className={cn(
                      "flex w-full items-start justify-between rounded-2xl border bg-background px-3 py-3 text-left transition hover:border-primary/30",
                      isSelected && "border-primary/30 bg-primary/5",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{agent.name}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {agent.id} • {agent.enabled ? "enabled" : "disabled"}
                      </p>
                    </div>

                    <div className="ml-3 shrink-0">
                      {isSelected ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <UserRoundPlus className="size-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                No matching agents.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
