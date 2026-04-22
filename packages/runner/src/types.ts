/**
 * Shared types for @mcp-coord/runner.
 *
 * These stubs define the contracts consumed across ar-002 → ar-010.
 * Implementations land in their respective tasks:
 *   - AgentDriver + DriverRegistry  → ar-002
 *   - McpCoordClient                → ar-003
 *   - JobSpawner                    → ar-004 / ar-005
 *   - Driver impls                  → ar-006 → ar-010
 */

import type { V1Job } from '@kubernetes/client-node';

// ── Task ─────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'blocked'
  | 'done';

/** Minimal task shape as returned by the mcp-coord list_tasks / get_task tools. */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  /** Agent name; runner looks up driver via get_agent(name). */
  owner: string;
  planId?: string;
  metadata?: Record<string, unknown>;
}

export interface CoordAgent {
  id?: string;
  name: string;
  status?: string;
  enabled: boolean;
  driver: DriverName | null;
  capabilities?: Record<string, unknown>;
  currentTaskId?: string | null;
  lastHeartbeatAt?: string | null;
  metadata?: Record<string, unknown>;
}

// ── Driver ───────────────────────────────────────────────────────────────────

export const SUPPORTED_DRIVER_NAMES = [
  'claude',
  'codex',
  'gemini',
  'aider',
  'generic',
] as const;

export type DriverName = (typeof SUPPORTED_DRIVER_NAMES)[number];

export function isDriverName(value: string): value is DriverName {
  return (SUPPORTED_DRIVER_NAMES as readonly string[]).includes(value);
}

export interface DriverOptions {
  /** k8s namespace for the spawned Job (default: "coord"). */
  namespace: string;
  /** TTL seconds after completion before k8s cleans up the Job (default: 3600). */
  ttlSeconds: number;
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
}

export interface AgentResult {
  success: boolean;
  /** Short human-readable summary written to task metadata. */
  summary?: string;
  /** Error message written to task metadata on failure. */
  error?: string;
}

/**
 * Every CLI agent driver must implement this interface.
 * Drivers are single files — no changes to runner core when adding a new one.
 */
export interface AgentDriver {
  /** Unique driver name: "claude" | "codex" | "gemini" | "aider" | "generic" */
  readonly name: DriverName;

  /**
   * Build the k8s Job spec for the given task and branch.
   * @param task     - the coord task being executed
   * @param branch   - isolated git branch name: "task/{taskId}"
   * @param options  - namespace, TTL, pull policy
   */
  buildJobSpec(task: Task, branch: string, options: DriverOptions): V1Job;

  /**
   * Parse raw job log output into a structured result.
   * @param logs - raw stdout/stderr from the k8s Job
   */
  parseOutput(logs: string): AgentResult;
}

// ── Kubernetes Job lifecycle ──────────────────────────────────────────────────

export type RunnerJobPhase =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'unknown';

export interface JobSpawnerOptions {
  namespace: string;
  kubeconfig?: string;
  pollIntervalMs?: number;
}

export interface JobConditionSnapshot {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastProbeTime?: string;
  lastTransitionTime?: string;
}

export interface JobContainerSnapshot {
  name: string;
  image?: string;
  ready: boolean;
  restartCount: number;
  state: 'waiting' | 'running' | 'terminated' | 'unknown';
  reason?: string;
  message?: string;
  exitCode?: number;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobPodSnapshot {
  name: string;
  phase?: string;
  reason?: string;
  message?: string;
  startTime?: string;
  podIP?: string;
  hostIP?: string;
  initContainers: JobContainerSnapshot[];
  containers: JobContainerSnapshot[];
}

export interface JobStatusSnapshot {
  active: number;
  succeeded: number;
  failed: number;
  ready: number;
  startTime?: string;
  completionTime?: string;
  conditions: JobConditionSnapshot[];
}

export interface JobWatchUpdate {
  jobName: string;
  namespace: string;
  phase: RunnerJobPhase;
  terminal: boolean;
  observedAt: string;
  status: JobStatusSnapshot;
  pods: JobPodSnapshot[];
}

export interface JobLogEntry {
  podName: string;
  containerName: string;
  containerType: 'init' | 'main';
  previous: boolean;
  content: string;
  error?: string;
}

export interface JobWatchResult {
  jobName: string;
  namespace: string;
  final: JobWatchUpdate;
  logs: JobLogEntry[];
}

export interface WatchJobOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  logTailLines?: number;
  includePreviousLogs?: boolean;
  onUpdate?: (update: JobWatchUpdate) => void | Promise<void>;
}
