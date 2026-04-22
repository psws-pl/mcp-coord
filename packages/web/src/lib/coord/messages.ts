import type {
  CoordAgentSummary,
  CoordMessageStatus,
  CoordMessageSummary,
} from "@/lib/coord/types";

const DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "full",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export interface CoordMessageGroup {
  key: string;
  label: string;
  items: CoordMessageSummary[];
}

export function sortMessagesChronologically(messages: CoordMessageSummary[]) {
  return [...messages].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export function groupMessagesByDay(messages: CoordMessageSummary[]): CoordMessageGroup[] {
  const groups = new Map<string, CoordMessageSummary[]>();

  for (const message of sortMessagesChronologically(messages)) {
    const dayKey = message.createdAt.slice(0, 10);
    const items = groups.get(dayKey);

    if (items) {
      items.push(message);
      continue;
    }

    groups.set(dayKey, [message]);
  }

  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: formatDayLabel(key),
    items,
  }));
}

export function buildMessageAgentOptions(
  messages: CoordMessageSummary[],
  agents: CoordAgentSummary[],
) {
  const unique = new Set<string>();

  for (const agent of agents) {
    unique.add(agent.id);
  }

  for (const message of messages) {
    unique.add(message.from);
    unique.add(message.to);
  }

  return Array.from(unique).sort((left, right) => left.localeCompare(right));
}

export function getAgentLabel(agentId: string, agents: CoordAgentSummary[]) {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

export function getMessageStatusLabel(status: CoordMessageStatus) {
  switch (status) {
    case "pending":
      return "Pending";
    case "acknowledged":
      return "Acknowledged";
    case "ignored":
      return "Ignored";
    default:
      return status.replaceAll("_", " ");
  }
}

export function getMessageTypeLabel(type: string) {
  return type
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getMessagePreview(body: string, maxLength = 180) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

export function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return TIME_FORMATTER.format(date);
}

function formatDayLabel(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return dayKey;
  }

  const today = new Date();
  const currentDay = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const deltaMs = currentDay.getTime() - date.getTime();
  const deltaDays = Math.round(deltaMs / 86_400_000);

  if (deltaDays === 0) {
    return "Today";
  }

  if (deltaDays === 1) {
    return "Yesterday";
  }

  return DAY_FORMATTER.format(date);
}
