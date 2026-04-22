export const COORD_AGENT_STATUSES = [
  'starting',
  'running',
  'waiting',
  'completed',
  'stale',
  'terminated',
] as const;

export const COORD_TASK_STATUSES = [
  'pending',
  'in_progress',
  'review',
  'done',
  'blocked',
  'cancelled',
] as const;

export const COORD_TASK_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;

export const COORD_MESSAGE_STATUSES = [
  'pending',
  'acknowledged',
  'done',
  'blocked',
  'ignored',
] as const;

export const COORD_MESSAGE_TYPES = [
  'task',
  'handoff',
  'question',
  'blocker',
  'review-request',
  'schema-change',
  'env-change',
  'broadcast',
  'incident',
] as const;

export const COORD_PLAN_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
] as const;

export type CoordAgentStatus = (typeof COORD_AGENT_STATUSES)[number];
export type CoordTaskStatus = (typeof COORD_TASK_STATUSES)[number];
export type CoordTaskPriority = (typeof COORD_TASK_PRIORITIES)[number];
export type CoordMessageStatus = (typeof COORD_MESSAGE_STATUSES)[number];
export type CoordMessageType = (typeof COORD_MESSAGE_TYPES)[number];
export type CoordPlanStatus = (typeof COORD_PLAN_STATUSES)[number];

export type CoordJsonObject = Record<string, unknown>;
