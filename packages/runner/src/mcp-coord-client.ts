import type { RunnerConfig } from './config';
import type { CoordAgent, DriverName, Task, TaskStatus } from './types';
import { isDriverName } from './types';

interface McpToolPayload {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface JsonRpcErrorPayload {
  code?: number;
  message?: string;
}

type FetchLike = typeof fetch;

export interface RegisterAgentInput {
  name: string;
  status?: string;
  driver?: DriverName | null;
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  owner?: string;
  description?: string;
  planId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SendMessageInput {
  to: string;
  body: string;
  from?: string;
  type?: string;
  taskId?: string;
  planId?: string;
}

export class McpCoordClient {
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly config: Pick<RunnerConfig, 'mcordKey' | 'mcordUrl'>,
    options: {
      fetchImpl?: FetchLike;
    } = {},
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async registerAgent(input: RegisterAgentInput): Promise<void> {
    await this.callTool('register_agent', {
      name: input.name,
      status: input.status,
      driver: input.driver,
      capabilities: input.capabilities,
      metadata: input.metadata,
    });
  }

  async listTasks(filters: {
    status?: TaskStatus;
    owner?: string;
    planId?: string;
  } = {}): Promise<Task[]> {
    const payload = await this.callTool('list_tasks', {
      status: filters.status,
      owner: filters.owner,
      plan_id: filters.planId,
    });

    return parseTasks(payload.structuredContent?.['tasks']);
  }

  async getAgent(name: string): Promise<CoordAgent> {
    const payload = await this.callTool('get_agent', { name });

    return parseAgent(payload.structuredContent?.['agent']);
  }

  async updateTask(taskId: string, input: UpdateTaskInput): Promise<void> {
    await this.callTool('update_task', {
      id: taskId,
      status: input.status,
      owner: input.owner,
      description: input.description,
      plan_id: input.planId,
      metadata: input.metadata,
    });
  }

  async sendMessage(input: SendMessageInput): Promise<void> {
    await this.callTool('send_message', {
      from: input.from,
      to: input.to,
      type: input.type,
      body: input.body,
      task_id: input.taskId,
      plan_id: input.planId,
    });
  }

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolPayload> {
    const response = await this.fetchImpl(this.config.mcordUrl, {
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `${name}:${Date.now()}`,
        method: 'tools/call',
        params: {
          name,
          arguments: Object.fromEntries(
            Object.entries(args).filter(([, value]) => value !== undefined),
          ),
        },
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Coord-Key': this.config.mcordKey,
      },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(
        `[runner] Coord API ${name} call failed with status ${response.status}.`,
      );
    }

    const envelope = (await response.json()) as Record<string, unknown>;
    const errorPayload = asRecord(envelope['error']);
    if (errorPayload) {
      const rpcError = errorPayload as JsonRpcErrorPayload;
      throw new Error(
        `[runner] Coord API ${name} RPC error: ${rpcError.message ?? 'unknown error'}`,
      );
    }

    const result = asRecord(envelope['result']);
    if (!result) {
      throw new Error(`[runner] Coord API ${name} returned an empty result.`);
    }

    const payload = result as McpToolPayload;
    if (payload.isError) {
      throw new Error(
        `[runner] Coord API ${name} tool error: ${readToolMessage(payload) ?? 'unknown tool error'}`,
      );
    }

    return payload;
  }
}

function parseTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) {
    throw new Error('[runner] Coord API list_tasks response is missing tasks[].');
  }

  return value.map(parseTask);
}

function parseTask(value: unknown): Task {
  const record = asRecord(value);
  if (!record) {
    throw new Error('[runner] Coord API task payload must be an object.');
  }

  const status = record['status'];
  const owner = record['owner'];
  const id = record['id'];
  const title = record['title'];
  const description = record['description'];

  if (!isTaskStatus(status)) {
    throw new Error(`[runner] Invalid task status from coord: ${String(status)}`);
  }

  if (
    typeof id !== 'string' ||
    typeof title !== 'string' ||
    typeof description !== 'string' ||
    typeof owner !== 'string'
  ) {
    throw new Error('[runner] Coord API task payload is missing required fields.');
  }

  return {
    id,
    title,
    description,
    status,
    owner,
    planId: typeof record['plan_id'] === 'string' ? record['plan_id'] : undefined,
    metadata: asRecord(record['metadata']) ?? undefined,
  };
}

function parseAgent(value: unknown): CoordAgent {
  const record = asRecord(value);
  if (!record) {
    throw new Error('[runner] Coord API agent payload must be an object.');
  }

  const name = record['name'];
  const enabled = record['enabled'];
  const driver = record['driver'];

  if (typeof name !== 'string' || typeof enabled !== 'boolean') {
    throw new Error('[runner] Coord API agent payload is missing required fields.');
  }

  if (driver !== null && driver !== undefined && typeof driver !== 'string') {
    throw new Error('[runner] Coord API agent.driver must be a string or null.');
  }

  if (typeof driver === 'string' && !isDriverName(driver)) {
    throw new Error(`[runner] Coord API returned unsupported driver "${driver}".`);
  }

  return {
    id: typeof record['id'] === 'string' ? record['id'] : undefined,
    name,
    status: typeof record['status'] === 'string' ? record['status'] : undefined,
    enabled,
    driver: driver ?? null,
    capabilities: asRecord(record['capabilities']) ?? undefined,
    currentTaskId:
      typeof record['current_task_id'] === 'string' || record['current_task_id'] === null
        ? (record['current_task_id'] as string | null)
        : undefined,
    lastHeartbeatAt:
      typeof record['last_heartbeat_at'] === 'string' ||
      record['last_heartbeat_at'] === null
        ? (record['last_heartbeat_at'] as string | null)
        : undefined,
    metadata: asRecord(record['metadata']) ?? undefined,
  };
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'review' ||
    value === 'blocked' ||
    value === 'done'
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readToolMessage(payload: McpToolPayload): string | null {
  if (!Array.isArray(payload.content)) {
    return null;
  }

  const firstText = payload.content.find(
    (entry) => entry.type === 'text' && typeof entry.text === 'string',
  );

  return firstText?.text ?? null;
}
