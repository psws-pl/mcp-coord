export type CoordAgentStatus =
  | "idle"
  | "running"
  | "blocked"
  | "offline"
  | (string & {});

export type CoordAgentDriver =
  | "claude"
  | "codex"
  | "gemini"
  | "aider"
  | "generic"
  | "default"
  | "inherit"
  | (string & {});

export type CoordAgentCardStatus =
  | "running"
  | "waiting"
  | "stale"
  | "terminated";

export type CoordTaskStatus =
  | "pending"
  | "in_progress"
  | "review"
  | "done"
  | "blocked"
  | (string & {});

export type CoordTaskPriority =
  | "low"
  | "normal"
  | "high"
  | "urgent"
  | (string & {});

export type CoordMessageStatus =
  | "pending"
  | "acknowledged"
  | "ignored"
  | (string & {});

export type CoordPlanStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "blocked"
  | "done"
  | (string & {});

export interface CoordAgentCapabilities {
  domains: string[];
  taskTypes: string[];
  [key: string]: unknown;
}

export interface CoordAgentSummary {
  id: string;
  name: string;
  status: CoordAgentStatus;
  enabled: boolean;
  driver: CoordAgentDriver | null;
  currentTaskId: string | null;
  lastHeartbeatAt: string | null;
  capabilities: CoordAgentCapabilities;
  metadata: Record<string, unknown>;
}

export interface CoordTaskSummary {
  id: string;
  title: string;
  description: string;
  status: CoordTaskStatus;
  priority: CoordTaskPriority;
  owner: string | null;
  planId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CoordTaskDetail = CoordTaskSummary;

export interface CoordMessageSummary {
  id: string;
  from: string;
  to: string;
  type: string;
  body: string;
  status: CoordMessageStatus;
  createdAt: string;
}

export interface CoordAgentDetail extends CoordAgentSummary {
  currentTask: CoordTaskSummary | null;
  taskHistory: CoordTaskSummary[];
  recentMessages: CoordMessageSummary[];
}

export interface CoordPlanTaskCounts {
  total: number;
  done: number;
  active: number;
  blocked: number;
}

export interface CoordPlanSummary {
  id: string;
  name: string;
  description: string;
  status: CoordPlanStatus;
  owner: string | null;
  createdAt: string;
  updatedAt: string;
  taskCounts: CoordPlanTaskCounts;
}

export type CoordStreamChannel =
  | "agents"
  | "tasks"
  | "messages"
  | "plans"
  | "system"
  | (string & {});

export interface CoordRealtimeEvent {
  channel: CoordStreamChannel;
  event: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type CoordRealtimeEntity =
  | "agent"
  | "task"
  | "message"
  | "plan";

export interface CoordDashboardInvalidationPayload {
  entity: CoordRealtimeEntity;
  id: string;
}

export type CoordConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface CoordConnectionState {
  status: CoordConnectionStatus;
  attempts: number;
  endpoint: string | null;
  lastEventAt: string | null;
  lastEvent: CoordRealtimeEvent | null;
  reason: string | null;
  polling: boolean;
  droppedConnections: number;
}

export type CoordResourceSource = "api" | "stub";

export interface CoordResourceMeta {
  source: CoordResourceSource;
  endpoint: string | null;
  reason: string | null;
}

export interface CoordResourceResult<T> {
  items: T[];
  meta: CoordResourceMeta;
}

export interface CoordItemResult<T> {
  item: T;
  meta: CoordResourceMeta;
}

export type CoordMutationTool =
  | "configure_agent"
  | "update_agent_status"
  | "assign_task"
  | "create_task"
  | "update_task"
  | "send_message"
  | "ack_message"
  | "create_plan"
  | "update_plan";

export interface CoordToolMutationMeta extends CoordResourceMeta {
  tool: CoordMutationTool;
  optimistic: boolean;
}

export interface CoordToolMutationResult {
  ok: boolean;
  meta: CoordToolMutationMeta;
}

export interface CoordToolItemMutationResult<T> extends CoordToolMutationResult {
  item: T | null;
}

export interface ConfigureAgentInput {
  enabled?: boolean;
  driver?: CoordAgentDriver | null;
  capabilities?: CoordAgentCapabilities;
  metadata?: Record<string, unknown>;
}

export interface UpdateAgentStatusInput {
  status: CoordAgentStatus;
  currentTaskId?: string | null;
  lastHeartbeatAt?: string;
}

export interface AssignTaskInput {
  agentId: string;
  taskId: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  owner?: string | null;
  priority?: CoordTaskPriority;
  planId?: string | null;
}

export interface UpdateTaskInput {
  status?: CoordTaskStatus;
  owner?: string | null;
  priority?: CoordTaskPriority;
  description?: string;
}

export interface SendMessageInput {
  from?: string | null;
  to: string;
  type: string;
  body: string;
  taskId?: string | null;
  planId?: string | null;
}

export interface CreatePlanInput {
  name: string;
  description?: string;
  owner?: string | null;
}

export interface UpdatePlanInput {
  status?: CoordPlanStatus;
  owner?: string | null;
  description?: string;
}
