import type {
  CoordAgentCardStatus,
  CoordAgentDetail,
  CoordAgentSummary,
  CoordMessageSummary,
  CoordTaskSummary,
} from "@/lib/coord/types";

const STALE_HEARTBEAT_MS = 10 * 60 * 1000;
const TERMINATED_STATUSES = new Set(["offline", "terminated"]);
const RUNNING_STATUSES = new Set(["running"]);

export function deriveAgentCardStatus(
  agent: CoordAgentSummary,
  now = Date.now(),
): CoordAgentCardStatus {
  if (TERMINATED_STATUSES.has(agent.status.toLowerCase())) {
    return "terminated";
  }

  if (agent.lastHeartbeatAt) {
    const heartbeatTime = new Date(agent.lastHeartbeatAt).getTime();

    if (Number.isFinite(heartbeatTime) && now - heartbeatTime > STALE_HEARTBEAT_MS) {
      return "stale";
    }
  }

  if (RUNNING_STATUSES.has(agent.status.toLowerCase())) {
    return "running";
  }

  return "waiting";
}

export function buildAgentDetail(
  agent: CoordAgentSummary,
  tasks: CoordTaskSummary[],
  messages: CoordMessageSummary[],
): CoordAgentDetail {
  const currentTask =
    tasks.find((task) => task.id === agent.currentTaskId) ?? null;
  const taskHistory = tasks
    .filter((task) => task.owner === agent.id || task.id === agent.currentTaskId)
    .sort((left, right) => {
      return (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      );
    })
    .slice(0, 20);
  const recentMessages = messages
    .filter((message) => message.from === agent.id || message.to === agent.id)
    .sort((left, right) => {
      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    })
    .slice(0, 10);

  return {
    ...agent,
    currentTask,
    taskHistory,
    recentMessages,
  };
}

export function getTaskTitle(
  taskId: string | null,
  tasks: CoordTaskSummary[],
) {
  if (!taskId) {
    return null;
  }

  return tasks.find((task) => task.id === taskId)?.title ?? null;
}
