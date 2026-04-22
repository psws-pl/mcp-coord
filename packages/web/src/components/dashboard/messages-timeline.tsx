"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Filter,
  LoaderCircle,
  MailQuestion,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ackMessage, listAgents, listMessages, sendMessage } from "@/lib/coord/api";
import { useCoordRealtimeRefresh } from "@/lib/coord/live";
import {
  buildMessageAgentOptions,
  formatMessageTime,
  getAgentLabel,
  getMessagePreview,
  getMessageStatusLabel,
  getMessageTypeLabel,
  groupMessagesByDay,
  sortMessagesChronologically,
} from "@/lib/coord/messages";
import type { CoordAgentSummary, CoordMessageSummary } from "@/lib/coord/types";
import { cn } from "@/lib/utils";

interface MessagesTimelineProps {
  messages: CoordMessageSummary[];
  agents: CoordAgentSummary[];
}

interface MessageDraft {
  to: string;
  type: string;
  body: string;
}

export function MessagesTimeline({
  messages: initialMessages,
  agents: initialAgents,
}: MessagesTimelineProps) {
  const [messages, setMessages] = useState(() =>
    sortMessagesChronologically(initialMessages),
  );
  const [agents, setAgents] = useState(initialAgents);
  const [agentFilter, setAgentFilter] = useState("all");
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<MessageDraft>(() => ({
    to: agents[0]?.id ?? "",
    type: "question",
    body: "",
  }));
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [sendPending, setSendPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMessages(sortMessagesChronologically(initialMessages));
  }, [initialMessages]);

  useEffect(() => {
    setAgents(initialAgents);
  }, [initialAgents]);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      to: current.to || agents[0]?.id || "",
    }));
  }, [agents]);

  const agentOptions = useMemo(() => {
    return buildMessageAgentOptions(messages, agents);
  }, [agents, messages]);

  const filteredMessages = useMemo(() => {
    if (agentFilter === "all") {
      return messages;
    }

    return messages.filter(
      (message) => message.from === agentFilter || message.to === agentFilter,
    );
  }, [agentFilter, messages]);

  const groupedMessages = useMemo(() => {
    return groupMessagesByDay(filteredMessages);
  }, [filteredMessages]);

  const pendingCount = filteredMessages.filter((message) => message.status === "pending").length;
  const hasActiveFilters = agentFilter !== "all";

  const refreshMessages = async () => {
    const result = await listMessages();
    setMessages(sortMessagesChronologically(result.items));
  };

  const refreshAgents = async () => {
    const result = await listAgents();
    setAgents(result.items);
  };

  useCoordRealtimeRefresh({
    handlers: {
      message: async () => {
        await refreshMessages();
      },
      agent: async () => {
        await refreshAgents();
      },
    },
    poll: async () => {
      await Promise.all([refreshMessages(), refreshAgents()]);
    },
  });

  const handleAcknowledge = async (messageId: string) => {
    const previousMessages = messages;

    setPendingAction(messageId);
    setErrorMessage(null);
    setStatusMessage(null);
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, status: "acknowledged" } : message,
      ),
    );

    try {
      const result = await ackMessage(messageId);
      setStatusMessage(result.meta.reason ?? "Message acknowledged.");
    } catch (error) {
      setMessages(previousMessages);
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to acknowledge the message.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleIgnore = (messageId: string) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, status: "ignored" } : message,
      ),
    );
    setErrorMessage(null);
    setStatusMessage(
      "Ignore is previewed locally until the backend message action contract is published.",
    );
  };

  const toggleExpanded = (messageId: string) => {
    setExpandedMessageIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  };

  const handleSendMessage = async () => {
    const body = draft.body.trim();

    if (!draft.to) {
      setErrorMessage("Select a recipient before sending a message.");
      return;
    }

    if (!body) {
      setErrorMessage("Message body is required.");
      return;
    }

    const previewId = `message-preview:${Date.now()}`;
    const previousMessages = messages;
    const optimisticMessage: CoordMessageSummary = {
      id: previewId,
      from: "dashboard",
      to: draft.to,
      type: draft.type,
      body,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    setSendPending(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setMessages((current) => sortMessagesChronologically([optimisticMessage, ...current]));

    try {
      const result = await sendMessage({
        to: draft.to,
        type: draft.type,
        body,
      });
      setStatusMessage(result.meta.reason ?? "Message sent.");
      setDraft({
        to: draft.to,
        type: draft.type,
        body: "",
      });

      if (result.item) {
        const sentMessage = result.item;
        setMessages((current) =>
          sortMessagesChronologically(
            current.map((message) => (message.id === previewId ? sentMessage : message)),
          ),
        );
      }
    } catch (error) {
      setMessages(previousMessages);
      setErrorMessage(error instanceof Error ? error.message : "Unable to send the message.");
    } finally {
      setSendPending(false);
    }
  };

  return (
    <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h3 className="text-xl font-semibold tracking-tight">Chronological timeline</h3>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Message rows are grouped by day, show delivery state inline, and stay
            aligned with live send and acknowledge mutations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <Filter className="size-4" />
          {filteredMessages.length} visible
          <span className="rounded-full border bg-muted/20 px-2.5 py-1 text-[11px]">
            {pendingCount} pending
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
          <h4 className="text-sm font-semibold tracking-tight">Send message</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            New messages post through the live coord message tool when the dashboard key is configured.
          </p>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.8fr)_auto]">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-foreground">To</span>
            <select
              value={draft.to}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  to: event.target.value,
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
            <span className="font-medium text-foreground">Type</span>
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
              className="h-11 w-full rounded-2xl border bg-background px-3 outline-none"
            >
              {["question", "assignment", "status", "handoff", "incident"].map((type) => (
                <option key={type} value={type}>
                  {getMessageTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button type="button" disabled={sendPending} onClick={handleSendMessage} className="h-11 w-full rounded-2xl">
              {sendPending ? <LoaderCircle className="size-4 animate-spin" /> : <MailQuestion className="size-4" />}
              Send
            </Button>
          </div>
        </div>

        <label className="mt-3 block space-y-2 text-sm">
          <span className="font-medium text-foreground">Body</span>
          <textarea
            value={draft.body}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                body: event.target.value,
              }))
            }
            rows={4}
            placeholder="Share a coordination update, question, or handoff."
            className="w-full rounded-3xl border bg-background px-4 py-3 outline-none"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-foreground">Agent</span>
          <select
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="h-11 w-full rounded-2xl border bg-background px-3 text-sm outline-none"
          >
            <option value="all">All agents</option>
            {agentOptions.map((agentId) => (
              <option key={agentId} value={agentId}>
                {getAgentLabel(agentId, agents)}
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
            onClick={() => setAgentFilter("all")}
          >
            Clear filters
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {groupedMessages.length > 0 ? (
          groupedMessages.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="sticky top-0 z-10 -mx-2 rounded-full bg-background/90 px-2 py-1 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  {group.label}
                </p>
              </div>

              <div className="space-y-3">
                {group.items.map((message) => {
                  const isExpanded = expandedMessageIds.includes(message.id);
                  const isPending = message.status === "pending";

                  return (
                    <article
                      key={message.id}
                      className={cn(
                        "rounded-3xl border p-5 shadow-sm transition",
                        isPending
                          ? "border-amber-500/40 bg-amber-500/10"
                          : "bg-muted/10",
                      )}
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold tracking-tight text-foreground">
                              {getAgentLabel(message.from, agents)} →{" "}
                              {getAgentLabel(message.to, agents)}
                            </span>
                            <span className={getTypeBadgeClassName(message.type)}>
                              {getMessageTypeLabel(message.type)}
                            </span>
                            <span className={getStatusChipClassName(message.status)}>
                              {getMessageStatusLabel(message.status)}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <p
                              className={cn(
                                "text-sm leading-6 text-muted-foreground",
                                !isExpanded && "line-clamp-2",
                              )}
                            >
                              {isExpanded ? message.body : getMessagePreview(message.body)}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              <span>{message.id}</span>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {isPending ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={pendingAction === message.id}
                                onClick={() => handleAcknowledge(message.id)}
                              >
                                {pendingAction === message.id ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <BadgeCheck className="size-4" />
                                )}
                                Ack
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={pendingAction === message.id}
                                onClick={() => handleIgnore(message.id)}
                              >
                                <X className="size-4" />
                                Ignore
                              </Button>
                            </>
                          ) : null}

                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleExpanded(message.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                            {isExpanded ? "Collapse" : "Expand"}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-3xl border border-dashed bg-muted/10 px-6 py-12 text-center">
            <MailQuestion className="mx-auto size-8 text-muted-foreground" />
            <h4 className="mt-4 text-lg font-semibold tracking-tight">No messages found</h4>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Try a different agent filter or wait for new coordination traffic.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function getStatusChipClassName(status: CoordMessageSummary["status"]) {
  switch (status) {
    case "pending":
      return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-amber-700 dark:text-amber-200";
    case "acknowledged":
      return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-200";
    case "ignored":
      return "rounded-full border border-slate-500/30 bg-slate-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-700 dark:text-slate-200";
    default:
      return "rounded-full border bg-muted/20 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground";
  }
}

function getTypeBadgeClassName(type: string) {
  const normalized = type.toLowerCase();

  if (normalized === "assignment") {
    return "rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-700 dark:text-sky-200";
  }

  if (normalized === "handoff") {
    return "rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-violet-700 dark:text-violet-200";
  }

  if (normalized === "incident") {
    return "rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-rose-700 dark:text-rose-200";
  }

  return "rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-primary";
}
