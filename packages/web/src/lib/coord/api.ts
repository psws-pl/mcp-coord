import { buildAgentDetail } from "@/lib/coord/agents";
import { stubAgents, stubMessages, stubPlans, stubTasks } from "@/lib/coord/stubs";
import type {
  AssignTaskInput,
  CoordAgentCapabilities,
  CoordAgentDetail,
  CoordAgentDriver,
  CoordAgentSummary,
  CoordItemResult,
  CoordMutationTool,
  CoordMessageSummary,
  CoordPlanSummary,
  CoordTaskPriority,
  CoordTaskDetail,
  CoordResourceResult,
  CoordTaskSummary,
  CoordToolItemMutationResult,
  ConfigureAgentInput,
  CreatePlanInput,
  CreateTaskInput,
  SendMessageInput,
  UpdateAgentStatusInput,
  UpdatePlanInput,
  UpdateTaskInput,
} from "@/lib/coord/types";

type CoordParser<T> = (value: unknown) => T;

interface FetchCollectionOptions<T> {
  path: string;
  parser: CoordParser<T>;
  stub: T[];
}

interface CoordMcpToolPayload {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface CoordMcpRequestResult {
  endpoint: string | null;
  payload: CoordMcpToolPayload | null;
  reason: string | null;
  status?: number;
}

const RECOVERABLE_STATUSES = new Set([401, 404, 501, 502, 503, 504]);
const RECOVERABLE_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
]);
const MCP_PROXY_PATH = "/api/coord/mcp";

export class CoordApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly endpoint?: string,
  ) {
    super(message);
    this.name = "CoordApiError";
  }
}

export async function listAgents() {
  return fetchCollectionViaTool({
    tool: "list_agents",
    args: {},
    stub: stubAgents,
    select: (payload) => parseCollectionFromStructuredContent(payload, "agents", parseAgent),
  });
}

export async function listTasks() {
  return fetchCollectionViaTool({
    tool: "list_tasks",
    args: {},
    stub: stubTasks,
    select: (payload) => parseCollectionFromStructuredContent(payload, "tasks", parseTask),
  });
}

export async function listMessages() {
  return fetchCollection({
    path: "/messages",
    parser: parseMessage,
    stub: stubMessages,
  });
}

export async function ackMessage(
  messageId: string,
): Promise<CoordToolItemMutationResult<CoordMessageSummary>> {
  return invokeCoordMutation("ack_message", {
    id: messageId,
  }, {
    parser: parseMessage,
    key: "message",
  });
}

export async function listPlans() {
  return fetchCollectionViaTool({
    tool: "list_plans",
    args: {},
    stub: stubPlans,
    select: (payload) => parseCollectionFromStructuredContent(payload, "plans", parsePlan),
  });
}

export async function getTask(taskId: string): Promise<CoordItemResult<CoordTaskDetail>> {
  const fallback = getStubTaskDetail(taskId);

  return fetchItemViaTool({
    tool: "get_task",
    args: { id: taskId },
    fallback,
    select: (payload) => parseStructuredItem(payload, "task", parseTaskDetail),
  });
}

export async function getAgent(agentId: string): Promise<CoordItemResult<CoordAgentDetail>> {
  const fallback = getStubAgentDetail(agentId);

  return fetchItemViaTool({
    tool: "get_agent",
    args: { name: agentId },
    fallback,
    select: (payload) => parseAgentDetailFromStructuredContent(payload),
  });
}

export async function configureAgent(
  agentId: string,
  input: ConfigureAgentInput,
): Promise<CoordToolItemMutationResult<CoordAgentSummary>> {
  return invokeCoordMutation("configure_agent", {
    name: agentId,
    enabled: input.enabled,
    driver: normalizeDriverValue(input.driver),
    capabilities: input.capabilities,
    metadata: input.metadata,
  }, {
    parser: parseAgent,
    key: "agent",
  });
}

export async function assignTask(
  input: AssignTaskInput,
): Promise<CoordToolItemMutationResult<CoordTaskSummary>> {
  return invokeCoordMutation("assign_task", {
    id: input.taskId,
    owner: input.agentId,
  }, {
    parser: parseTask,
    key: "task",
  });
}

export async function createTask(
  input: CreateTaskInput,
): Promise<CoordToolItemMutationResult<CoordTaskSummary>> {
  return invokeCoordMutation("create_task", {
    title: input.title,
    description: input.description?.trim() ?? "",
    owner: normalizeNullableString(input.owner) ?? undefined,
    priority: normalizeTaskPriority(input.priority),
    plan_id: normalizeNullableString(input.planId),
  }, {
    parser: parseTask,
    key: "task",
  });
}

export async function updateAgentStatus(
  agentId: string,
  input: UpdateAgentStatusInput,
): Promise<CoordToolItemMutationResult<CoordAgentSummary>> {
  return invokeCoordMutation("update_agent_status", {
    name: agentId,
    status: input.status,
    current_task_id: input.currentTaskId ?? null,
    last_heartbeat_at: input.lastHeartbeatAt ?? new Date().toISOString(),
  }, {
    parser: parseAgent,
    key: "agent",
  });
}

export async function updateTask(
  taskId: string,
  input: UpdateTaskInput,
): Promise<CoordToolItemMutationResult<CoordTaskSummary>> {
  return invokeCoordMutation("update_task", {
    id: taskId,
    status: input.status,
    owner: normalizeNullableString(input.owner),
    priority: normalizeTaskPriority(input.priority),
    description: input.description,
  }, {
    parser: parseTask,
    key: "task",
  });
}

export async function sendMessage(
  input: SendMessageInput,
): Promise<CoordToolItemMutationResult<CoordMessageSummary>> {
  return invokeCoordMutation("send_message", {
    from: normalizeNullableString(input.from),
    to: input.to,
    type: input.type,
    body: input.body,
    task_id: normalizeNullableString(input.taskId),
    plan_id: normalizeNullableString(input.planId),
  }, {
    parser: parseMessage,
    key: "message",
  });
}

export async function updatePlan(
  planId: string,
  input: UpdatePlanInput,
): Promise<CoordToolItemMutationResult<CoordPlanSummary>> {
  return invokeCoordMutation("update_plan", {
    id: planId,
    status: input.status,
    owner: normalizeNullableString(input.owner),
    description: input.description,
  }, {
    parser: parsePlan,
    key: "plan",
  });
}

export async function createPlan(
  input: CreatePlanInput,
): Promise<CoordToolItemMutationResult<CoordPlanSummary>> {
  return invokeCoordMutation("create_plan", {
    name: input.name,
    description: input.description?.trim() ?? "",
    owner: normalizeNullableString(input.owner),
  }, {
    parser: parsePlan,
    key: "plan",
  });
}

export function getCoordApiBaseUrl() {
  if (typeof window === "undefined") {
    return process.env.COORD_API_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || null;
  }

  return process.env.NEXT_PUBLIC_API_URL?.trim() || null;
}

function buildCoordUrl(path: string) {
  const baseUrl = getCoordApiBaseUrl();

  if (!baseUrl) {
    return null;
  }

  return new URL(path, ensureTrailingSlash(baseUrl)).toString();
}

function getCoordProxyUrl() {
  return typeof window === "undefined" ? null : MCP_PROXY_PATH;
}

async function fetchCollection<T>({
  path,
  parser,
  stub,
}: FetchCollectionOptions<T>): Promise<CoordResourceResult<T>> {
  const endpoint = buildCoordUrl(path);

  if (!endpoint) {
    return createStubResult(stub, null, "NEXT_PUBLIC_API_URL is not set.");
  }

  let response: Response;

  try {
    response = await fetch(endpoint, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    if (isRecoverableNetworkError(error)) {
      return createStubResult(stub, endpoint, "Coord API is not reachable yet.");
    }

    throw new CoordApiError("Failed to contact coord API.", undefined, endpoint);
  }

  if (RECOVERABLE_STATUSES.has(response.status)) {
    return createStubResult(
      stub,
      endpoint,
      `Coord API endpoint returned ${response.status}.`,
    );
  }

  if (!response.ok) {
    throw new CoordApiError(
      `Coord API request failed with status ${response.status}.`,
      response.status,
      endpoint,
    );
  }

  const payload: unknown = await response.json();
  const items = parseCollection(payload, parser);

  return {
    items,
    meta: {
      source: "api",
      endpoint,
      reason: null,
    },
  };
}

async function fetchCollectionViaTool<T>({
  tool,
  args,
  stub,
  select,
}: {
  tool: "list_agents" | "list_tasks" | "list_plans";
  args: Record<string, unknown>;
  stub: T[];
  select: (payload: CoordMcpToolPayload) => T[];
}): Promise<CoordResourceResult<T>> {
  const result = await invokeCoordToolRequest(tool, args);

  if (result.payload === null) {
    return createStubResult(stub, result.endpoint, result.reason ?? "Coord tool request failed.");
  }

  if (result.payload.isError) {
    return createStubResult(
      stub,
      result.endpoint,
      readToolMessage(result.payload) ?? result.reason ?? `Tool "${tool}" is not ready yet.`,
    );
  }

  return {
    items: select(result.payload),
    meta: {
      source: "api",
      endpoint: result.endpoint,
      reason: null,
    },
  };
}

async function fetchItemViaTool<T>({
  tool,
  args,
  fallback,
  select,
}: {
  tool: "get_agent" | "get_task";
  args: Record<string, unknown>;
  fallback: T;
  select: (payload: CoordMcpToolPayload) => T;
}): Promise<CoordItemResult<T>> {
  const result = await invokeCoordToolRequest(tool, args);

  if (result.payload === null) {
    return createStubItemResult(fallback, result.endpoint, result.reason ?? "Coord tool request failed.");
  }

  if (result.payload.isError) {
    return createStubItemResult(
      fallback,
      result.endpoint,
      readToolMessage(result.payload) ?? result.reason ?? `Tool "${tool}" is not ready yet.`,
    );
  }

  return {
    item: select(result.payload),
    meta: {
      source: "api",
      endpoint: result.endpoint,
      reason: null,
    },
  };
}

async function invokeCoordMutation<T>(
  tool: CoordMutationTool,
  args: Record<string, unknown>,
  selection: {
    parser: CoordParser<T>;
    key: string;
  },
): Promise<CoordToolItemMutationResult<T>> {
  const result = await invokeCoordToolRequest(tool, args);

  if (result.payload === null) {
    return createOptimisticMutationResult<T>(tool, result.endpoint, result.reason, null);
  }

  if (result.payload.isError) {
    if (isToolPreviewable(result.payload)) {
      return createOptimisticMutationResult<T>(
        tool,
        result.endpoint,
        readToolMessage(result.payload) ?? result.reason,
        null,
      );
    }

    throw new CoordApiError(
      readToolMessage(result.payload) ?? "Coord tool mutation failed.",
      result.status,
      result.endpoint ?? undefined,
    );
  }

  return {
    ok: true,
    item: parseOptionalStructuredItem(
      result.payload,
      selection.key,
      selection.parser,
    ),
    meta: {
      source: "api",
      endpoint: result.endpoint,
      reason: readToolMessage(result.payload),
      tool,
      optimistic: false,
    },
  };
}

async function invokeCoordToolRequest(
  tool: string,
  args: Record<string, unknown>,
): Promise<CoordMcpRequestResult> {
  if (typeof window !== "undefined") {
    return invokeCoordToolThroughProxy(tool, args);
  }

  return invokeCoordToolDirect(tool, args);
}

async function invokeCoordToolDirect(
  tool: string,
  args: Record<string, unknown>,
): Promise<CoordMcpRequestResult> {
  const endpoint = buildCoordUrl("/mcp");

  if (!endpoint) {
    return {
      endpoint: null,
      payload: null,
      reason: "Coord API URL is not configured.",
    };
  }

  const apiKey = process.env.COORD_API_KEY?.trim();

  if (!apiKey) {
    return {
      endpoint,
      payload: null,
      reason: "COORD_API_KEY is not set for server-side coord calls.",
    };
  }

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Coord-Key": apiKey,
      },
      body: JSON.stringify(createToolRequest(tool, args)),
    });
  } catch (error) {
    if (isRecoverableNetworkError(error)) {
      return {
        endpoint,
        payload: null,
        reason: "Coord API is not reachable yet.",
      };
    }

    throw new CoordApiError("Failed to contact coord API.", undefined, endpoint);
  }

  return parseMcpHttpResponse(response, endpoint);
}

async function invokeCoordToolThroughProxy(
  tool: string,
  args: Record<string, unknown>,
): Promise<CoordMcpRequestResult> {
  const proxyUrl = getCoordProxyUrl();

  if (!proxyUrl) {
    return {
      endpoint: null,
      payload: null,
      reason: "Coord proxy route is not available.",
    };
  }

  let response: Response;

  try {
    response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: tool,
        arguments: args,
      }),
    });
  } catch (error) {
    if (isRecoverableNetworkError(error)) {
      return {
        endpoint: buildCoordUrl("/mcp"),
        payload: null,
        reason: "Coord API is not reachable yet.",
      };
    }

    throw new CoordApiError("Failed to contact the coord proxy route.");
  }

  const payload = (await response.json()) as unknown;

  if (!isRecord(payload)) {
    throw new CoordApiError("Coord proxy returned an unexpected response.");
  }

  const endpoint = getNullableString(payload.endpoint) ?? buildCoordUrl("/mcp");

  if (!response.ok || payload.ok !== true) {
    return {
      endpoint,
      payload: null,
      reason:
        getNullableString(payload.reason) ??
        `Coord proxy request failed with status ${response.status}.`,
      status: response.status,
    };
  }

  return {
    endpoint,
    payload: getOptionalRecord(payload.payload) as CoordMcpToolPayload | null,
    reason: null,
  };
}

async function parseMcpHttpResponse(
  response: Response,
  endpoint: string,
): Promise<CoordMcpRequestResult> {
  if (RECOVERABLE_STATUSES.has(response.status)) {
    return {
      endpoint,
      payload: null,
      reason: `Coord API returned ${response.status}.`,
      status: response.status,
    };
  }

  if (!response.ok) {
    throw new CoordApiError(
      `Coord API request failed with status ${response.status}.`,
      response.status,
      endpoint,
    );
  }

  const payload = (await response.json()) as unknown;

  if (!isRecord(payload)) {
    throw new CoordApiError("Coord API returned an invalid MCP payload.", response.status, endpoint);
  }

  if (isRecord(payload.error)) {
    throw new CoordApiError(
      getNullableString(payload.error.message) ?? "Coord MCP call failed.",
      response.status,
      endpoint,
    );
  }

  const result = getOptionalRecord(payload.result);

  if (!result) {
    throw new CoordApiError("Coord API returned an empty MCP result.", response.status, endpoint);
  }

  return {
    endpoint,
    payload: result as CoordMcpToolPayload,
    reason: null,
  };
}

function createToolRequest(tool: string, args: Record<string, unknown>) {
  return {
    jsonrpc: "2.0" as const,
    id: `${tool}:${Date.now()}`,
    method: "tools/call",
    params: {
      name: tool,
      arguments: Object.fromEntries(
        Object.entries(args).filter(([, value]) => value !== undefined),
      ),
    },
  };
}

function parseCollectionFromStructuredContent<T>(
  payload: CoordMcpToolPayload,
  key: string,
  parser: CoordParser<T>,
) {
  const structuredContent = getStructuredContent(payload);
  return parseCollection(structuredContent[key], parser);
}

function parseStructuredItem<T>(
  payload: CoordMcpToolPayload,
  key: string,
  parser: CoordParser<T>,
) {
  const structuredContent = getStructuredContent(payload);
  return parseItem(structuredContent[key], parser);
}

function parseOptionalStructuredItem<T>(
  payload: CoordMcpToolPayload,
  key: string,
  parser: CoordParser<T>,
) {
  const structuredContent = getStructuredContent(payload);
  const value = structuredContent[key];

  if (value === undefined) {
    return null;
  }

  return parser(value);
}

function parseAgentDetailFromStructuredContent(payload: CoordMcpToolPayload) {
  const structuredContent = getStructuredContent(payload);
  const summary = parseAgent(structuredContent.agent);
  const taskHistory = parseCollection(structuredContent.recent_tasks ?? [], parseTask);
  const recentMessages = parseCollection(
    structuredContent.recent_messages ?? [],
    parseMessage,
  );
  const currentTask =
    summary.currentTaskId === null
      ? null
      : taskHistory.find((task) => task.id === summary.currentTaskId) ?? null;

  return {
    ...summary,
    currentTask,
    taskHistory,
    recentMessages,
  } satisfies CoordAgentDetail;
}

function getStructuredContent(payload: CoordMcpToolPayload) {
  if (!isRecord(payload.structuredContent)) {
    throw new CoordApiError("Coord API returned a tool response without structured content.");
  }

  return payload.structuredContent;
}

function readToolMessage(payload: CoordMcpToolPayload) {
  if (!Array.isArray(payload.content)) {
    return null;
  }

  const firstText = payload.content.find(
    (item) => isRecord(item) && item.type === "text" && typeof item.text === "string",
  );

  return firstText?.text ?? null;
}

function isToolPreviewable(payload: CoordMcpToolPayload) {
  const structuredContent = getOptionalRecord(payload.structuredContent);
  return structuredContent?.status === "not_implemented";
}

function createOptimisticMutationResult<T>(
  tool: CoordMutationTool,
  endpoint: string | null,
  reason: string | null,
  item: T | null,
): CoordToolItemMutationResult<T> {
  return {
    ok: true,
    item,
    meta: {
      source: "stub",
      endpoint,
      reason:
        reason ??
        "Coord tool mutation transport is not published yet; preview mode applied locally.",
      tool,
      optimistic: true,
    },
  };
}

function parseItem<T>(value: unknown, parser: CoordParser<T>) {
  if (isRecord(value)) {
    const candidates = ["item", "data", "result"] as const;

    for (const key of candidates) {
      const maybeItem = value[key];

      if (maybeItem !== undefined) {
        return parser(maybeItem);
      }
    }
  }

  return parser(value);
}

function parseCollection<T>(value: unknown, parser: CoordParser<T>) {
  if (Array.isArray(value)) {
    return value.map(parser);
  }

  if (isRecord(value)) {
    const candidates = ["items", "data", "results"] as const;

    for (const key of candidates) {
      const maybeItems = value[key];

      if (Array.isArray(maybeItems)) {
        return maybeItems.map(parser);
      }
    }
  }

  throw new CoordApiError("Coord API returned an unexpected list payload.");
}

function parseAgent(value: unknown): CoordAgentSummary {
  const record = getRecord(value, "agent");
  const capabilities = getOptionalRecord(
    readValue(record, "capabilities"),
  ) as CoordAgentCapabilities | null;

  return {
    id: getString(readValue(record, "id"), "agent.id"),
    name: getString(readValue(record, "name"), "agent.name"),
    status: getString(readValue(record, "status"), "agent.status"),
    enabled: getBoolean(readValue(record, "enabled"), "agent.enabled"),
    driver: getNullableDriver(readValue(record, "driver")),
    currentTaskId: getNullableString(
      readValue(record, "currentTaskId", "current_task_id"),
    ),
    lastHeartbeatAt: getNullableString(
      readValue(record, "lastHeartbeatAt", "last_heartbeat_at"),
    ),
    capabilities: {
      domains: getStringArray(capabilities?.domains ?? []),
      taskTypes: getStringArray(
        capabilities?.taskTypes ?? capabilities?.task_types ?? [],
      ),
      ...(capabilities ?? {}),
    },
    metadata: getOptionalRecord(readValue(record, "metadata")) ?? {},
  };
}

function parseAgentDetail(value: unknown): CoordAgentDetail {
  const summary = parseAgent(value);
  const record = getRecord(value, "agent detail");
  const currentTaskValue = readValue(record, "currentTask", "current_task");
  const taskHistoryValue = readValue(record, "taskHistory", "task_history");
  const recentMessagesValue = readValue(
    record,
    "recentMessages",
    "recent_messages",
  );

  return {
    ...summary,
    currentTask:
      currentTaskValue == null ? null : parseTask(currentTaskValue),
    taskHistory: Array.isArray(taskHistoryValue)
      ? taskHistoryValue.map(parseTask)
      : [],
    recentMessages: Array.isArray(recentMessagesValue)
      ? recentMessagesValue.map(parseMessage)
      : [],
  };
}

function parseTask(value: unknown): CoordTaskSummary {
  const record = getRecord(value, "task");

  return {
    id: getString(readValue(record, "id"), "task.id"),
    title: getString(readValue(record, "title"), "task.title"),
    description: getString(readValue(record, "description") ?? "", "task.description"),
    status: getString(readValue(record, "status"), "task.status"),
    priority: parseTaskPriority(readValue(record, "priority")),
    owner: getNullableString(readValue(record, "owner")),
    planId: getNullableString(readValue(record, "planId", "plan_id")),
    createdAt: getString(readValue(record, "createdAt", "created_at"), "task.createdAt"),
    updatedAt: getString(readValue(record, "updatedAt", "updated_at"), "task.updatedAt"),
  };
}

function parseTaskDetail(value: unknown): CoordTaskDetail {
  return parseTask(value);
}

function parseMessage(value: unknown): CoordMessageSummary {
  const record = getRecord(value, "message");

  return {
    id: getString(readValue(record, "id"), "message.id"),
    from: getString(readValue(record, "from"), "message.from"),
    to: getString(readValue(record, "to"), "message.to"),
    type: getString(readValue(record, "type"), "message.type"),
    body: getString(readValue(record, "body"), "message.body"),
    status: getString(readValue(record, "status"), "message.status"),
    createdAt: getString(
      readValue(record, "createdAt", "created_at"),
      "message.createdAt",
    ),
  };
}

function parsePlan(value: unknown): CoordPlanSummary {
  const record = getRecord(value, "plan");
  const taskCounts = getOptionalRecord(
    readValue(record, "taskCounts", "task_counts"),
  );

  return {
    id: getString(readValue(record, "id"), "plan.id"),
    name: getString(readValue(record, "name"), "plan.name"),
    description: getString(readValue(record, "description") ?? "", "plan.description"),
    status: getString(readValue(record, "status"), "plan.status"),
    owner: getNullableString(readValue(record, "owner")),
    createdAt: getString(readValue(record, "createdAt", "created_at"), "plan.createdAt"),
    updatedAt: getString(readValue(record, "updatedAt", "updated_at"), "plan.updatedAt"),
    taskCounts: {
      total: getNumber(taskCounts?.total ?? 0, "plan.taskCounts.total"),
      done: getNumber(taskCounts?.done ?? 0, "plan.taskCounts.done"),
      active: getNumber(taskCounts?.active ?? 0, "plan.taskCounts.active"),
      blocked: getNumber(taskCounts?.blocked ?? 0, "plan.taskCounts.blocked"),
    },
  };
}

function createStubResult<T>(items: T[], endpoint: string | null, reason: string) {
  return {
    items,
    meta: {
      source: "stub" as const,
      endpoint,
      reason,
    },
  };
}

function createStubItemResult<T>(item: T, endpoint: string | null, reason: string) {
  return {
    item,
    meta: {
      source: "stub" as const,
      endpoint,
      reason,
    },
  };
}

function getStubAgentDetail(agentId: string) {
  const agent = stubAgents.find((candidate) => candidate.id === agentId);

  if (!agent) {
    throw new CoordApiError(`Unknown agent "${agentId}".`);
  }

  return buildAgentDetail(agent, stubTasks, stubMessages);
}

function getStubTaskDetail(taskId: string) {
  const task = stubTasks.find((candidate) => candidate.id === taskId);

  if (!task) {
    throw new CoordApiError(`Unknown task "${taskId}".`);
  }

  return task;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function readValue(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown | undefined {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function getRecord(value: unknown, label: string) {
  if (!isRecord(value)) {
    throw new CoordApiError(`Coord API returned an invalid ${label} object.`);
  }

  return value;
}

function getOptionalRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }

  return isRecord(value) ? value : null;
}

function getString(value: unknown, label: string) {
  if (typeof value === "string") {
    return value;
  }

  throw new CoordApiError(`Coord API field "${label}" must be a string.`);
}

function getNullableString(value: unknown) {
  if (value == null) {
    return null;
  }

  return typeof value === "string" ? value : null;
}

function getNullableDriver(value: unknown): CoordAgentDriver | null {
  return getNullableString(value);
}

function getBoolean(value: unknown, label: string) {
  if (typeof value === "boolean") {
    return value;
  }

  throw new CoordApiError(`Coord API field "${label}" must be a boolean.`);
}

function getNumber(value: unknown, label: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new CoordApiError(`Coord API field "${label}" must be a number.`);
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoverableNetworkError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const cause = "cause" in error ? error.cause : undefined;

  if (
    isRecord(cause) &&
    typeof cause.code === "string" &&
    RECOVERABLE_ERROR_CODES.has(cause.code)
  ) {
    return true;
  }

  return false;
}

function normalizeDriverValue(value: CoordAgentDriver | null | undefined) {
  if (value == null || value === "default" || value === "inherit") {
    return null;
  }

  return value;
}

function normalizeTaskPriority(value: CreateTaskInput["priority"]) {
  if (value == null) {
    return undefined;
  }

  switch (value) {
    case "urgent":
      return "P0";
    case "high":
      return "P1";
    case "low":
      return "P3";
    default:
      return "P2";
  }
}

function normalizeNullableString(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseTaskPriority(value: unknown): CoordTaskPriority {
  switch (value) {
    case "P0":
      return "urgent";
    case "P1":
      return "high";
    case "P3":
      return "low";
    case "low":
    case "normal":
    case "high":
    case "urgent":
      return value;
    default:
      return "normal";
  }
}
