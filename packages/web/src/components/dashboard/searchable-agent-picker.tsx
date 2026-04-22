"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, UserRoundPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
          className="rounded-full border-border/70 bg-background/80"
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
        >
          <ChevronsUpDown className="size-4" />
          {isOpen ? "Hide" : "Choose"}
        </Button>
      </div>

      {isOpen ? (
        <Card className="rounded-[1.35rem] bg-muted/[0.18] p-3 shadow-none">
          <label className="flex items-center gap-2 rounded-[1.15rem] border border-border/70 bg-background/90 px-3 py-2 text-sm text-muted-foreground transition focus-within:border-primary/35 focus-within:ring-4 focus-within:ring-primary/10">
            <Search className="size-4" />
            <Input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search agents"
              className="h-auto border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
              disabled={disabled}
            />
          </label>

          <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
            {filteredAgents.length > 0 ? (
              filteredAgents.map((agent) => {
                const isSelected = agent.id === selectedAgentId;
                const isPending = pendingAgentId === agent.id;

                return (
                    <Card
                      key={agent.id}
                      className={cn(
                        "overflow-hidden rounded-[1.15rem] bg-background/92 transition hover:border-primary/25 hover:-translate-y-0.5",
                        isSelected && "border-primary/30 bg-primary/[0.05] shadow-[0_18px_40px_-30px_rgba(79,70,229,0.28)]",
                      )}
                    >
                      <button
                        type="button"
                        disabled={disabled || isPending}
                        onClick={() => {
                          onSelect(agent.id);
                          setIsOpen(false);
                          setSearchValue("");
                        }}
                        className="flex w-full items-start justify-between px-3 py-3 text-left"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{agent.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant="muted" className="normal-case tracking-normal">
                              {agent.id}
                            </Badge>
                            <Badge
                              variant={agent.enabled ? "outline" : "muted"}
                              className="normal-case tracking-normal"
                            >
                              {agent.enabled ? "enabled" : "disabled"}
                            </Badge>
                          </div>
                        </div>

                        <div className="ml-3 shrink-0">
                          {isSelected ? (
                            <Check className="size-4 text-primary" />
                          ) : (
                            <UserRoundPlus className="size-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                    </Card>
                  );
                })
            ) : (
              <div className="rounded-[1.15rem] border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
                No matching agents.
              </div>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
