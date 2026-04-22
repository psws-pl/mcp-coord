"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  MessageSquareText,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableAgentPicker } from "@/components/dashboard/searchable-agent-picker";
import { buildAgentDetail, deriveAgentCardStatus, getTaskTitle } from "@/lib/coord/agents";
import {
  assignTask,
  configureAgent,
  getAgent,
  listAgents,
  listMessages,
  listTasks,
  updateAgentStatus,
} from "@/lib/coord/api";
import { useCoordRealtimeRefresh } from "@/lib/coord/live";
import type {
  CoordAgentCapabilities,
  CoordAgentDetail,
  CoordAgentDriver,
  CoordAgentStatus,
  CoordAgentSummary,
  CoordMessageSummary,
  CoordTaskSummary,
} from "@/lib/coord/types";
import { cn } from "@/lib/utils";

const DRIVER_OPTIONS: Array<{
  value: CoordAgentDriver;
  label: string;
}> = [
  { value: "claude", label: "claude" },
  { value: "codex", label: "codex" },
  { value: "gemini", label: "gemini" },
  { value: "aider", label: "aider" },
  { value: "generic", label: "generic" },
  { value: "default", label: "default" },
  { value: "inherit", label: "inherit" },
];

const STATUS_OPTIONS: CoordAgentStatus[] = ["idle", "running", "blocked", "offline"];

interface AgentsPanelProps {
  agents: CoordAgentSummary[];
  tasks: CoordTaskSummary[];
  messages: CoordMessageSummary[];
}

export function AgentsPanel({
  agents: initialAgents,
  tasks: initialTasks,
  messages: initialMessages,
}: AgentsPanelProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [tasks, setTasks] = useState(initialTasks);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [detailOverrides, setDetailOverrides] = useState<
    Record<string, CoordAgentDetail>
  >({});
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [driverPending, setDriverPending] = useState(false);
  const [enabledPending, setEnabledPending] = useState(false);
  const [capabilitiesPending, setCapabilitiesPending] = useState(false);
  const [cardStatusDrafts, setCardStatusDrafts] = useState<Record<string, CoordAgentStatus>>({});
  const [statusPendingAgentId, setStatusPendingAgentId] = useState<string | null>(null);
  const [assignPendingTaskId, setAssignPendingTaskId] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [taskTypeInput, setTaskTypeInput] = useState("");
  const [capabilityDraft, setCapabilityDraft] = useState<CoordAgentCapabilities>({
    domains: [],
    taskTypes: [],
  });

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) {
      return null;
    }

    return agents.find((agent) => agent.id === selectedAgentId) ?? null;
  }, [agents, selectedAgentId]);

  const selectedDetail = useMemo(() => {
    if (!selectedAgent) {
      return null;
    }

    const fallback = buildAgentDetail(selectedAgent, tasks, messages);
    const hydrated = detailOverrides[selectedAgent.id];

    if (!hydrated) {
      return fallback;
    }

    return {
      ...hydrated,
      ...selectedAgent,
      currentTask: hydrated.currentTask ?? fallback.currentTask,
      taskHistory: hydrated.taskHistory,
      recentMessages: hydrated.recentMessages,
    };
  }, [detailOverrides, messages, selectedAgent, tasks]);

  const openTasks = useMemo(() => {
    return tasks
      .filter((task) => task.status !== "done")
      .sort((left, right) => {
        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();

    return openTasks
      .filter((task) => {
        if (!selectedAgentId) {
          return false;
        }

        if (task.owner === selectedAgentId) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [task.id, task.title, task.description, task.owner ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }, [openTasks, selectedAgentId, taskSearch]);

  useEffect(() => {
    if (!selectedDetail) {
      return;
    }

    setCapabilityDraft({
      domains: [...selectedDetail.capabilities.domains],
      taskTypes: [...selectedDetail.capabilities.taskTypes],
    });
    setDomainInput("");
    setTaskTypeInput("");
    setTaskSearch("");
  }, [selectedDetail]);

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    let active = true;
    setIsDetailLoading(true);

    getAgent(selectedAgentId)
      .then((result) => {
        if (!active) {
          return;
        }

        setDetailOverrides((current) => ({
          ...current,
          [selectedAgentId]: result.item,
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
          error instanceof Error
            ? error.message
            : "Failed to load the latest agent detail.",
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
  }, [selectedAgentId]);

  useEffect(() => {
    setCardStatusDrafts((current) => {
      const next = { ...current };

      for (const agent of agents) {
        if (!next[agent.id]) {
          next[agent.id] = agent.status;
        }
      }

      return next;
    });
  }, [agents]);

  const refreshAgents = async () => {
    const result = await listAgents();
    setAgents(result.items);
  };

  const refreshTasks = async () => {
    const result = await listTasks();
    setTasks(result.items);
  };

  const refreshMessages = async () => {
    const result = await listMessages();
    setMessages(result.items);
  };

  const refreshSelectedAgentDetail = async (agentId: string) => {
    const result = await getAgent(agentId);
    setDetailOverrides((current) => ({
      ...current,
      [agentId]: result.item,
    }));
  };

  useCoordRealtimeRefresh({
    handlers: {
      agent: async ({ id }) => {
        await refreshAgents();

        if (selectedAgentId === id) {
          await refreshSelectedAgentDetail(id);
        }
      },
      task: async () => {
        await refreshTasks();

        if (selectedAgentId) {
          await refreshSelectedAgentDetail(selectedAgentId);
        }
      },
      message: async () => {
        await refreshMessages();

        if (selectedAgentId) {
          await refreshSelectedAgentDetail(selectedAgentId);
        }
      },
    },
    poll: async () => {
      await Promise.all([
        refreshAgents(),
        refreshTasks(),
        refreshMessages(),
        selectedAgentId ? refreshSelectedAgentDetail(selectedAgentId) : Promise.resolve(),
      ]);
    },
  });

  const closeSheet = () => {
    setSelectedAgentId(null);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const handleForceStatus = async (agent: CoordAgentSummary) => {
    const nextStatus = cardStatusDrafts[agent.id] ?? agent.status;

    if (nextStatus === agent.status) {
      setStatusMessage(`Agent "${agent.name}" is already ${agent.status}.`);
      return;
    }

    const previousAgents = agents;
    const updatedAt = new Date().toISOString();

    setStatusPendingAgentId(agent.id);
    setErrorMessage(null);
    setStatusMessage(null);
    setAgents((current) =>
      current.map((candidate) =>
        candidate.id === agent.id
          ? {
              ...candidate,
              status: nextStatus,
              lastHeartbeatAt: updatedAt,
            }
          : candidate,
      ),
    );

    try {
      const result = await updateAgentStatus(agent.id, {
        status: nextStatus,
        currentTaskId: agent.currentTaskId,
        lastHeartbeatAt: updatedAt,
      });
      setStatusMessage(result.meta.reason ?? `Agent forced to ${nextStatus}.`);

      if (result.item) {
        const updatedAgent = result.item;
        setAgents((current) =>
          current.map((candidate) => (candidate.id === agent.id ? updatedAgent : candidate)),
        );
      }
    } catch (error) {
      setAgents(previousAgents);
      setErrorMessage(error instanceof Error ? error.message : "Unable to force the agent status.");
    } finally {
      setStatusPendingAgentId(null);
    }
  };

  const handleEnabledToggle = async () => {
    if (!selectedAgent) {
      return;
    }

    const previousAgents = agents;
    const nextEnabled = !selectedAgent.enabled;
    setEnabledPending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgent.id ? { ...agent, enabled: nextEnabled } : agent,
      ),
    );

    try {
      const result = await configureAgent(selectedAgent.id, { enabled: nextEnabled });
      setStatusMessage(result.meta.reason);
    } catch (error) {
      setAgents(previousAgents);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update agent enablement.",
      );
    } finally {
      setEnabledPending(false);
    }
  };

  const handleDriverChange = async (nextDriver: CoordAgentDriver) => {
    if (!selectedAgent) {
      return;
    }

    const previousAgents = agents;
    setDriverPending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgent.id ? { ...agent, driver: nextDriver } : agent,
      ),
    );

    try {
      const result = await configureAgent(selectedAgent.id, { driver: nextDriver });
      setStatusMessage(result.meta.reason);
    } catch (error) {
      setAgents(previousAgents);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update the agent driver.",
      );
    } finally {
      setDriverPending(false);
    }
  };

  const handleCapabilitiesSave = async () => {
    if (!selectedAgent) {
      return;
    }

    const previousAgents = agents;
    const nextCapabilities: CoordAgentCapabilities = {
      ...selectedAgent.capabilities,
      domains: capabilityDraft.domains,
      taskTypes: capabilityDraft.taskTypes,
    };

    setCapabilitiesPending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setAgents((current) =>
      current.map((agent) =>
        agent.id === selectedAgent.id
          ? { ...agent, capabilities: nextCapabilities }
          : agent,
      ),
    );

    try {
      const result = await configureAgent(selectedAgent.id, {
        capabilities: nextCapabilities,
      });
      setStatusMessage(result.meta.reason);
    } catch (error) {
      setAgents(previousAgents);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the agent capabilities.",
      );
    } finally {
      setCapabilitiesPending(false);
    }
  };

  const handleAssignTask = async (task: CoordTaskSummary, agentId: string) => {
    const previousAgents = agents;
    const previousTasks = tasks;
    const updatedAt = new Date().toISOString();

    setAssignPendingTaskId(task.id);
    setErrorMessage(null);
    setStatusMessage(null);
    setTasks((current) =>
      current.map((currentTask) =>
        currentTask.id === task.id
          ? { ...currentTask, owner: agentId, updatedAt }
          : currentTask,
      ),
    );

    try {
      const result = await assignTask({
        agentId,
        taskId: task.id,
      });
      setStatusMessage(result.meta.reason ?? "Task assignment updated.");
      setTaskSearch("");

      if (result.item) {
        const updatedTask = result.item;
        setTasks((current) =>
          current.map((currentTask) => (currentTask.id === task.id ? updatedTask : currentTask)),
        );
      }
    } catch (error) {
      setAgents(previousAgents);
      setTasks(previousTasks);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to assign the task.",
      );
    } finally {
      setAssignPendingTaskId(null);
    }
  };

  return (
    <>
      <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-semibold tracking-tight">Status grid</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Cards highlight the current execution state, driver choice, and
            heartbeat freshness before you open the full detail sheet.
          </p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const cardStatus = deriveAgentCardStatus(agent);
            const currentTaskTitle = getTaskTitle(agent.currentTaskId, tasks);
            const statusDraft = cardStatusDrafts[agent.id] ?? agent.status;

            return (
              <article
                key={agent.id}
                className="group rounded-3xl border bg-muted/15 p-5 transition hover:border-primary/30 hover:bg-muted/30"
              >
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setStatusMessage(null);
                    setSelectedAgentId(agent.id);
                  }}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                        Agent
                      </p>
                      <h4 className="text-lg font-semibold tracking-tight">{agent.name}</h4>
                    </div>
                    <span className={statusBadgeClassName(cardStatus)}>{cardStatus}</span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className={enabledBadgeClassName(agent.enabled)}>
                      {agent.enabled ? "enabled" : "disabled"}
                    </span>
                    <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                      {formatDriver(agent.driver)}
                    </span>
                  </div>

                  <dl className="mt-5 space-y-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Current task</dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {currentTaskTitle ?? "No active task"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Last heartbeat</dt>
                      <dd className="mt-1 font-medium text-foreground">
                        {formatHeartbeat(agent.lastHeartbeatAt)}
                      </dd>
                    </div>
                  </dl>
                </button>

                <div className="mt-4 border-t pt-4">
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Force status
                  </p>
                  <div className="mt-2 flex gap-2">
                    <select
                      value={statusDraft}
                      onChange={(event) =>
                        setCardStatusDrafts((current) => ({
                          ...current,
                          [agent.id]: event.target.value as CoordAgentStatus,
                        }))
                      }
                      disabled={statusPendingAgentId === agent.id}
                      className="h-10 flex-1 rounded-xl border bg-background px-3 text-sm outline-none"
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      disabled={statusPendingAgentId === agent.id}
                      onClick={() => void handleForceStatus(agent)}
                    >
                      {statusPendingAgentId === agent.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Apply
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selectedDetail ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close agent detail"
            className="absolute inset-0 bg-black/35"
            onClick={closeSheet}
          />

          <section className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={statusBadgeClassName(deriveAgentCardStatus(selectedDetail))}>
                    {deriveAgentCardStatus(selectedDetail)}
                  </span>
                  <span className={enabledBadgeClassName(selectedDetail.enabled)}>
                    {selectedDetail.enabled ? "enabled" : "disabled"}
                  </span>
                  <span className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
                    {formatDriver(selectedDetail.driver)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                    Agent detail
                  </p>
                  <h3 className="text-2xl font-semibold tracking-tight">
                    {selectedDetail.name}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Full record, recent coordination activity, and optimistic task
                    routing controls.
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={closeSheet}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              {isDetailLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Refreshing the latest agent detail.
                </div>
              ) : null}

              {statusMessage ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground">
                  {statusMessage}
                </div>
              ) : null}

              {errorMessage ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive">
                  {errorMessage}
                </div>
              ) : null}

              <DetailSection
                icon={Bot}
                title="Full record"
                description="The summary stays aligned with the shared typed coord model."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="ID" value={selectedDetail.id} />
                  <DetailField label="Raw status" value={selectedDetail.status} />
                  <DetailField
                    label="Current task"
                    value={selectedDetail.currentTask?.title ?? "No active task"}
                  />
                  <DetailField
                    label="Last heartbeat"
                    value={formatTimestamp(selectedDetail.lastHeartbeatAt)}
                  />
                </div>
                <div className="mt-4 rounded-2xl bg-muted/30 p-4">
                  <p className="text-sm font-medium">Metadata</p>
                  <pre className="mt-2 overflow-x-auto text-xs leading-6 text-muted-foreground">
                    {JSON.stringify(selectedDetail.metadata, null, 2)}
                  </pre>
                </div>
              </DetailSection>

              <DetailSection
                icon={Settings2}
                title="Configuration"
                description="Mutations are modeled against configure_agent and applied optimistically in the dashboard."
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="rounded-2xl border p-4">
                    <p className="text-sm font-medium">Enable or disable</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Disabled agents stay visible in the grid but are skipped by the
                      runner.
                    </p>
                    <Button
                      className="mt-4"
                      variant={selectedDetail.enabled ? "outline" : "default"}
                      onClick={handleEnabledToggle}
                      disabled={enabledPending}
                    >
                      {enabledPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {selectedDetail.enabled ? "Disable agent" : "Enable agent"}
                    </Button>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <label className="text-sm font-medium" htmlFor="driver-select">
                      Driver selector
                    </label>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      The selected value is normalized for a future configure_agent
                      transport without inventing a new mutation contract.
                    </p>
                    <select
                      id="driver-select"
                      className="mt-4 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-ring"
                      value={selectedDetail.driver ?? "inherit"}
                      onChange={(event) =>
                        void handleDriverChange(event.target.value as CoordAgentDriver)
                      }
                      disabled={driverPending}
                    >
                      {DRIVER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </DetailSection>

              <DetailSection
                icon={Sparkles}
                title="Capabilities"
                description="Edit domains and task types as tags, then persist with configure_agent."
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <CapabilityEditor
                    label="Domains"
                    placeholder="Add a domain"
                    tags={capabilityDraft.domains}
                    inputValue={domainInput}
                    onInputChange={setDomainInput}
                    onAdd={() => {
                      setCapabilityDraft((current) => ({
                        ...current,
                        domains: appendCapabilityTag(current.domains, domainInput),
                      }));
                      setDomainInput("");
                    }}
                    onRemove={(value) => {
                      setCapabilityDraft((current) => ({
                        ...current,
                        domains: current.domains.filter((tag) => tag !== value),
                      }));
                    }}
                    disabled={capabilitiesPending}
                  />
                  <CapabilityEditor
                    label="Task types"
                    placeholder="Add a task type"
                    tags={capabilityDraft.taskTypes}
                    inputValue={taskTypeInput}
                    onInputChange={setTaskTypeInput}
                    onAdd={() => {
                      setCapabilityDraft((current) => ({
                        ...current,
                        taskTypes: appendCapabilityTag(current.taskTypes, taskTypeInput),
                      }));
                      setTaskTypeInput("");
                    }}
                    onRemove={(value) => {
                      setCapabilityDraft((current) => ({
                        ...current,
                        taskTypes: current.taskTypes.filter((tag) => tag !== value),
                      }));
                    }}
                    disabled={capabilitiesPending}
                  />
                </div>

                <Button
                  className="mt-4"
                  onClick={() => void handleCapabilitiesSave()}
                  disabled={capabilitiesPending}
                >
                  {capabilitiesPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : null}
                  Save capabilities
                </Button>
              </DetailSection>

              <DetailSection
                icon={Settings2}
                title="Task history"
                description="Latest 20 tasks associated with this agent."
              >
                <div className="space-y-3">
                  {selectedDetail.taskHistory.length > 0 ? (
                    selectedDetail.taskHistory.map((task) => (
                      <article key={task.id} className="rounded-2xl border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h4 className="font-medium">{task.title}</h4>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {task.description}
                            </p>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{task.status}</p>
                            <p>{formatTimestamp(task.updatedAt)}</p>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState copy="No recent task history for this agent yet." />
                  )}
                </div>
              </DetailSection>

              <DetailSection
                icon={MessageSquareText}
                title="Recent messages"
                description="Last 10 messages to or from this agent."
              >
                <div className="space-y-3">
                  {selectedDetail.recentMessages.length > 0 ? (
                    selectedDetail.recentMessages.map((message) => (
                      <article key={message.id} className="rounded-2xl border p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">
                              {message.from} → {message.to}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-muted-foreground">
                              {message.body}
                            </p>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <p>{message.type}</p>
                            <p>{formatTimestamp(message.createdAt)}</p>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <EmptyState copy="No recent messages for this agent yet." />
                  )}
                </div>
              </DetailSection>

               <DetailSection
                 icon={Search}
                 title="Assign task"
                 description="Search open tasks, then route each task with the shared searchable agent picker."
               >
                 <label
                   htmlFor="assign-task-search"
                   className="flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm text-muted-foreground"
                >
                  <Search className="size-4" />
                  <input
                    id="assign-task-search"
                    value={taskSearch}
                    onChange={(event) => setTaskSearch(event.target.value)}
                    placeholder="Search open tasks"
                    className="w-full bg-transparent outline-none"
                  />
                </label>

                <div className="mt-4 space-y-3">
                  {filteredTasks.length > 0 ? (
                    filteredTasks.map((task) => (
                      <article key={task.id} className="rounded-2xl border p-4">
                         <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                           <div>
                             <p className="font-medium">{task.title}</p>
                             <p className="mt-1 text-sm leading-6 text-muted-foreground">
                               {task.description}
                            </p>
                            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                {task.id} • {task.status} • {task.owner ?? "unassigned"}
                              </p>
                            </div>
                            <div className="w-full max-w-xs">
                              <SearchableAgentPicker
                                agents={agents}
                                selectedAgentId={task.owner}
                                disabled={assignPendingTaskId === task.id}
                                label="Route task"
                                onSelect={(agentId) => void handleAssignTask(task, agentId)}
                              />
                            </div>
                          </div>
                        </article>
                      ))
                  ) : (
                    <EmptyState copy="No matching open tasks remain for this agent." />
                  )}
                </div>
              </DetailSection>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function DetailSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Bot;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-lg font-semibold tracking-tight">{title}</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-muted/30 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium leading-6">{value}</p>
    </div>
  );
}

function CapabilityEditor({
  label,
  placeholder,
  tags,
  inputValue,
  onInputChange,
  onAdd,
  onRemove,
  disabled,
}: {
  label: string;
  placeholder: string;
  tags: string[];
  inputValue: string;
  onInputChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(tag)}
              disabled={disabled}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tags yet.</p>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={inputValue}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 flex-1 rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-ring"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAdd();
            }
          }}
          disabled={disabled}
        />
        <Button
          variant="outline"
          onClick={onAdd}
          disabled={disabled || inputValue.trim().length === 0}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
      {copy}
    </div>
  );
}

function appendCapabilityTag(current: string[], candidate: string) {
  const next = candidate.trim();

  if (!next || current.includes(next)) {
    return current;
  }

  return [...current, next];
}

function formatDriver(driver: CoordAgentDriver | null) {
  if (driver == null || driver === "inherit" || driver === "default") {
    return "inherit default";
  }

  return driver;
}

function formatHeartbeat(value: string | null) {
  if (!value) {
    return "No heartbeat recorded";
  }

  return `${formatTimestamp(value)} (${formatRelative(value)})`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelative(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(1, Math.round(Math.abs(diffMs) / 60_000));

  if (diffMinutes < 60) {
    return diffMs >= 0 ? `${diffMinutes}m ago` : `in ${diffMinutes}m`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return diffMs >= 0 ? `${diffHours}h ago` : `in ${diffHours}h`;
}

function statusBadgeClassName(status: ReturnType<typeof deriveAgentCardStatus>) {
  return cn(
    "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
    status === "running" && "bg-emerald-500/15 text-emerald-700",
    status === "waiting" && "bg-yellow-500/15 text-yellow-700",
    status === "stale" && "bg-amber-500/15 text-amber-700",
    status === "terminated" && "bg-red-500/15 text-red-700",
  );
}

function enabledBadgeClassName(enabled: boolean) {
  return cn(
    "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
    enabled
      ? "bg-primary/10 text-primary"
      : "bg-muted text-muted-foreground",
  );
}
