import request from 'supertest';

import {
  CoordApiTestHarness,
  TEST_API_KEYS,
  createCoordApiTestHarness,
} from './support/coord-test-harness';

interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface JsonRpcSuccessEnvelope {
  jsonrpc: '2.0';
  id: string;
  result: ToolResult | Record<string, unknown>;
}

interface DashboardSseStream {
  close: () => void;
  readNextEvent: () => Promise<Record<string, unknown>>;
}

describe('MCP API integration', () => {
  let harness: CoordApiTestHarness;

  beforeAll(async () => {
    harness = await createCoordApiTestHarness();
  });

  afterEach(async () => {
    await harness.resetDatabase();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('auth guard', () => {
    const pingRequest = {
      jsonrpc: '2.0',
      id: 'ping-auth',
      method: 'ping',
    };

    it('rejects requests without X-Coord-Key', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/mcp')
        .send(pingRequest);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Missing or invalid X-Coord-Key header',
        statusCode: 401,
      });
    });

    it('rejects requests with an invalid X-Coord-Key', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/mcp')
        .set('X-Coord-Key', 'invalid-key')
        .send(pingRequest);

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Missing or invalid X-Coord-Key header',
        statusCode: 401,
      });
    });

    it('accepts requests with a valid X-Coord-Key', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/mcp')
        .set('X-Coord-Key', TEST_API_KEYS.raw)
        .send(pingRequest);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        jsonrpc: '2.0',
        id: 'ping-auth',
        result: {},
      });
    });
  });

  it('executes all MCP tools over the JSON-RPC transport happy path', async () => {
    const registerAgentResult = await callTool('register_agent', {
      name: 'be',
      status: 'starting',
      driver: 'codex',
      capabilities: {
        domains: ['backend', 'coord'],
      },
      metadata: {
        version: '1.0.0-test',
      },
    });
    const registeredAgent = getObjectField(registerAgentResult, 'agent');
    expectToolSuccess(registerAgentResult, 'Registered agent "be".');
    expect(registeredAgent).toMatchObject({
      name: 'be',
      status: 'starting',
      driver: 'codex',
      enabled: true,
    });

    const createPlanResult = await callTool('create_plan', {
      id: 'plan-mcp-011',
      name: 'MCP API tests',
      description: 'Exercise all coordination tools.',
      owner: 'be',
    });
    const createdPlan = getObjectField(createPlanResult, 'plan');
    expectToolSuccess(createPlanResult, 'Created plan "plan-mcp-011".');
    expect(createdPlan).toMatchObject({
      id: 'plan-mcp-011',
      name: 'MCP API tests',
      status: 'draft',
      owner: 'be',
      task_count: 0,
    });

    const createTaskResult = await callTool('create_task', {
      id: 'task-mcp-011',
      title: 'Ship backend tests',
      description: 'Add real Postgres-backed tests.',
      owner: 'orch',
      priority: 'P1',
      plan_id: 'plan-mcp-011',
      metadata: {
        scope: 'packages/api',
      },
    });
    const createdTask = getObjectField(createTaskResult, 'task');
    expectToolSuccess(createTaskResult, 'Created task "task-mcp-011".');
    expect(createdTask).toMatchObject({
      id: 'task-mcp-011',
      status: 'pending',
      owner: 'orch',
      plan_id: 'plan-mcp-011',
    });

    const assignTaskResult = await callTool('assign_task', {
      id: 'task-mcp-011',
      owner: 'be',
    });
    const assignedTask = getObjectField(assignTaskResult, 'task');
    expectToolSuccess(assignTaskResult, 'Assigned task "task-mcp-011" to "be".');
    expect(assignedTask).toMatchObject({
      id: 'task-mcp-011',
      owner: 'be',
      metadata: expect.objectContaining({
        previous_owner: 'orch',
      }),
    });

    const updateAgentStatusResult = await callTool('update_agent_status', {
      name: 'be',
      status: 'running',
      current_task_id: 'task-mcp-011',
      last_heartbeat_at: '2026-04-22T10:00:00.000Z',
    });
    expectToolSuccess(updateAgentStatusResult, 'Updated status for agent "be".');
    expect(getObjectField(updateAgentStatusResult, 'agent')).toMatchObject({
      name: 'be',
      status: 'running',
      current_task_id: 'task-mcp-011',
      last_heartbeat_at: '2026-04-22T10:00:00.000Z',
    });

    const configureAgentResult = await callTool('configure_agent', {
      name: 'be',
      enabled: false,
      capabilities: {
        domains: ['backend', 'coord', 'tests'],
      },
      metadata: {
        note: 'focused on mcp-011',
      },
    });
    const configuredAgent = getObjectField(configureAgentResult, 'agent');
    expectToolSuccess(configureAgentResult, 'Configured agent "be".');
    expect(configuredAgent).toMatchObject({
      name: 'be',
      enabled: false,
      capabilities: {
        domains: ['backend', 'coord', 'tests'],
      },
      metadata: {
        note: 'focused on mcp-011',
      },
    });

    const updateTaskResult = await callTool('update_task', {
      id: 'task-mcp-011',
      status: 'in_progress',
      priority: 'P0',
      description: 'Running real Postgres integration coverage.',
      metadata: {
        suite: 'integration',
      },
    });
    const updatedTask = getObjectField(updateTaskResult, 'task');
    expectToolSuccess(updateTaskResult, 'Updated task "task-mcp-011".');
    expect(updatedTask).toMatchObject({
      id: 'task-mcp-011',
      status: 'in_progress',
      priority: 'P0',
      owner: 'be',
      metadata: expect.objectContaining({
        scope: 'packages/api',
        suite: 'integration',
      }),
    });

    const getTaskResult = await callTool('get_task', {
      id: 'task-mcp-011',
    });
    expectToolSuccess(getTaskResult, 'Fetched task "task-mcp-011".');
    expect(getObjectField(getTaskResult, 'task')).toMatchObject({
      id: 'task-mcp-011',
      status: 'in_progress',
      owner: 'be',
    });

    const listTasksResult = await callTool('list_tasks', {
      status: 'in_progress',
      owner: 'be',
      plan_id: 'plan-mcp-011',
    });
    expectToolSuccess(listTasksResult, 'Found 1 task records.');
    expect(getNumberField(listTasksResult, 'total')).toBe(1);
    expect(getArrayField(listTasksResult, 'tasks')).toEqual([
      expect.objectContaining({
        id: 'task-mcp-011',
        status: 'in_progress',
        owner: 'be',
      }),
    ]);

    const sendMessageResult = await callTool(
      'send_message',
      {
        to: 'orch',
        type: 'handoff',
        body: 'Backend API test suite is ready.',
        task_id: 'task-mcp-011',
        plan_id: 'plan-mcp-011',
      },
      TEST_API_KEYS.be,
    );
    const sentMessage = getObjectField(sendMessageResult, 'message');
    expectToolSuccess(sendMessageResult, expect.stringContaining('Sent message'));
    expect(sentMessage).toMatchObject({
      from: 'be',
      to: 'orch',
      type: 'handoff',
      status: 'pending',
      task_id: 'task-mcp-011',
      plan_id: 'plan-mcp-011',
    });

    const getMessagesResult = await callTool(
      'get_messages',
      undefined,
      TEST_API_KEYS.orch,
    );
    expectToolSuccess(getMessagesResult, 'Fetched 1 messages for "orch" in pending-first order.');
    expect(getNumberField(getMessagesResult, 'total')).toBe(1);
    expect(getArrayField(getMessagesResult, 'messages')).toEqual([
      expect.objectContaining({
        id: sentMessage.id,
        to: 'orch',
        status: 'pending',
      }),
    ]);

    const ackMessageResult = await callTool(
      'ack_message',
      {
        id: getStringField(sentMessage, 'id'),
      },
      TEST_API_KEYS.orch,
    );
    expectToolSuccess(
      ackMessageResult,
      `Acknowledged message "${getStringField(sentMessage, 'id')}".`,
    );
    expect(getObjectField(ackMessageResult, 'message')).toMatchObject({
      id: sentMessage.id,
      status: 'acknowledged',
    });

    const updatePlanResult = await callTool('update_plan', {
      id: 'plan-mcp-011',
      status: 'active',
      description: 'Real DB-backed tests are running.',
    });
    expectToolSuccess(updatePlanResult, 'Updated plan "plan-mcp-011".');
    expect(getObjectField(updatePlanResult, 'plan')).toMatchObject({
      id: 'plan-mcp-011',
      status: 'active',
    });

    const listPlansResult = await callTool('list_plans', {
      status: 'active',
    });
    expectToolSuccess(listPlansResult, 'Found 1 plan records.');
    expect(getArrayField(listPlansResult, 'plans')).toEqual([
      expect.objectContaining({
        id: 'plan-mcp-011',
        status: 'active',
        task_count: 1,
        task_counts: expect.objectContaining({
          in_progress: 1,
          active: 1,
        }),
      }),
    ]);

    const getAgentResult = await callTool('get_agent', {
      name: 'be',
    });
    expectToolSuccess(
      getAgentResult,
      'Fetched agent "be" with 1 recent tasks and 1 recent messages.',
    );
    expect(getObjectField(getAgentResult, 'agent')).toMatchObject({
      name: 'be',
      status: 'running',
      enabled: false,
    });
    expect(getArrayField(getAgentResult, 'recent_tasks')).toEqual([
      expect.objectContaining({
        id: 'task-mcp-011',
        owner: 'be',
      }),
    ]);
    expect(getArrayField(getAgentResult, 'recent_messages')).toEqual([
      expect.objectContaining({
        id: sentMessage.id,
        from: 'be',
      }),
    ]);

    const listAgentsResult = await callTool('list_agents', {
      enabled: false,
    });
    expectToolSuccess(listAgentsResult, 'Found 1 registered agents.');
    expect(getArrayField(listAgentsResult, 'agents')).toEqual([
      expect.objectContaining({
        name: 'be',
        enabled: false,
      }),
    ]);
  });

  it.each([
    [
      'register_agent',
      TEST_API_KEYS.be,
      { name: 'be', unexpected: true },
      'register_agent received unsupported argument(s): unexpected.',
    ],
    [
      'update_agent_status',
      TEST_API_KEYS.be,
      { name: 'be', status: 'invalid-status' },
      'status must be one of: starting, running, waiting, completed, stale, terminated.',
    ],
    [
      'configure_agent',
      TEST_API_KEYS.be,
      { name: 'be' },
      'configure_agent requires at least one field to update.',
    ],
    [
      'get_agent',
      TEST_API_KEYS.be,
      { name: ' ' },
      'name must be a non-empty string.',
    ],
    [
      'list_agents',
      TEST_API_KEYS.be,
      { enabled: 'true' },
      'enabled must be a boolean.',
    ],
    [
      'create_task',
      TEST_API_KEYS.be,
      { title: 'Bad task', priority: 'PX' },
      'priority must be one of: P0, P1, P2, P3.',
    ],
    [
      'update_task',
      TEST_API_KEYS.be,
      { id: 'task-1' },
      'update_task requires at least one mutable field to update.',
    ],
    [
      'assign_task',
      TEST_API_KEYS.be,
      { id: 'task-1', owner: ' ' },
      'owner must be a non-empty string.',
    ],
    [
      'list_tasks',
      TEST_API_KEYS.be,
      { status: 'queued' },
      'status must be one of: pending, in_progress, review, done, blocked, cancelled.',
    ],
    [
      'get_task',
      TEST_API_KEYS.be,
      { id: ' ' },
      'id must be a non-empty string.',
    ],
    [
      'send_message',
      TEST_API_KEYS.be,
      { to: 'orch', body: 'Hello', type: 'unknown' },
      'type must be one of: task, handoff, question, blocker, review-request, schema-change, env-change, broadcast, incident.',
    ],
    [
      'get_messages',
      TEST_API_KEYS.orch,
      { status: 'unknown' },
      'status must be one of: pending, acknowledged, done, blocked, ignored.',
    ],
    [
      'ack_message',
      TEST_API_KEYS.orch,
      { id: ' ' },
      'id must be a non-empty string.',
    ],
    [
      'create_plan',
      TEST_API_KEYS.be,
      { name: 'Plan', status: 'queued' },
      'status must be one of: draft, active, paused, completed, cancelled.',
    ],
    [
      'update_plan',
      TEST_API_KEYS.be,
      { id: 'plan-1' },
      'update_plan requires at least one mutable field to update.',
    ],
    [
      'list_plans',
      TEST_API_KEYS.be,
      { status: 'queued' },
      'status must be one of: draft, active, paused, completed, cancelled.',
    ],
  ])(
    'returns a tool error for invalid %s input',
    async (toolName, apiKey, arguments_, expectedMessage) => {
      const toolResult = await callTool(toolName, arguments_, apiKey);

      expectToolError(toolResult, expectedMessage as string);
      expect(toolResult.structuredContent).toMatchObject({
        tool: toolName,
      });
    },
  );

  it('emits dashboard SSE invalidation events for writes', async () => {
    const stream = await openDashboardStream();

    try {
      const createPlanResult = await callTool('create_plan', {
        id: 'plan-sse',
        name: 'Realtime plan',
      });
      await expectDashboardEvent(
        stream,
        'plans',
        'plan',
        'plan-sse',
      );
      expectToolSuccess(createPlanResult, 'Created plan "plan-sse".');

      const createTaskResult = await callTool('create_task', {
        id: 'task-sse',
        title: 'Realtime task',
        plan_id: 'plan-sse',
      });
      await expectDashboardEvent(
        stream,
        'tasks',
        'task',
        'task-sse',
      );
      expectToolSuccess(createTaskResult, 'Created task "task-sse".');

      const registerAgentResult = await callTool('register_agent', {
        name: 'sse-agent',
      });
      const sseAgent = getObjectField(registerAgentResult, 'agent');
      await expectDashboardEvent(
        stream,
        'agents',
        'agent',
        getStringField(sseAgent, 'id'),
      );
      expectToolSuccess(registerAgentResult, 'Registered agent "sse-agent".');

      const sendMessageResult = await callTool(
        'send_message',
        {
          to: 'orch',
          body: 'Realtime message',
        },
        TEST_API_KEYS.be,
      );
      const sseMessage = getObjectField(sendMessageResult, 'message');
      await expectDashboardEvent(
        stream,
        'messages',
        'message',
        getStringField(sseMessage, 'id'),
      );
      expectToolSuccess(sendMessageResult, expect.stringContaining('Sent message'));
    } finally {
      stream.close();
    }
  });

  async function callTool(
    toolName: string,
    arguments_: Record<string, unknown> | undefined,
    apiKey = TEST_API_KEYS.be,
  ): Promise<ToolResult> {
    const response = await request(harness.app.getHttpServer())
      .post('/mcp')
      .set('X-Coord-Key', apiKey)
      .send({
        jsonrpc: '2.0',
        id: `${toolName}-${Math.random().toString(16).slice(2)}`,
        method: 'tools/call',
        params:
          arguments_ === undefined
            ? {
                name: toolName,
              }
            : {
                name: toolName,
                arguments: arguments_,
              },
      });

    expect(response.status).toBe(200);
    const body = response.body as JsonRpcSuccessEnvelope;
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toEqual(expect.any(String));
    expect(body.result).toBeDefined();

    return body.result as ToolResult;
  }

  async function openDashboardStream(): Promise<DashboardSseStream> {
    const controller = new AbortController();
    const response = await fetch(`${harness.baseUrl}/sse?stream=dashboard`, {
      headers: {
        'X-Coord-Key': TEST_API_KEYS.raw,
      },
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const body = response.body;

    if (!body) {
      throw new Error('Expected an SSE response body.');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return {
      close: () => {
        controller.abort();
        void reader.cancel().catch(() => undefined);
      },
      readNextEvent: async () => {
        const startedAt = Date.now();

        while (Date.now() - startedAt < 5_000) {
          const frame = extractFrame(buffer);

          if (frame !== null) {
            buffer = frame.remaining;

            const parsed = parseSseFrame(frame.payload);

            if (parsed !== null) {
              return parsed;
            }

            continue;
          }

          const readResult = await Promise.race([
            reader.read(),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error('Timed out waiting for an SSE event.')), 5_000);
            }),
          ]);

          if (readResult.done) {
            throw new Error('Dashboard SSE stream closed before the next event arrived.');
          }

          buffer += decoder.decode(readResult.value, {
            stream: true,
          });
        }

        throw new Error('Timed out waiting for an SSE frame.');
      },
    };
  }

  async function expectDashboardEvent(
    stream: DashboardSseStream,
    channel: string,
    entity: string,
    id: string,
  ): Promise<void> {
    const event = await stream.readNextEvent();

    expect(event).toMatchObject({
      channel,
      event: 'invalidate',
      payload: {
        entity,
        id,
      },
    });
  }
});

function expectToolSuccess(result: ToolResult, expectedText: string | ReturnType<typeof expect.stringContaining>): void {
  expect(result.isError).not.toBe(true);
  expect(result.content[0]).toMatchObject({
    type: 'text',
    text: expectedText,
  });
}

function expectToolError(result: ToolResult, expectedText: string): void {
  expect(result.isError).toBe(true);
  expect(result.content[0]).toMatchObject({
    type: 'text',
    text: expectedText,
  });
}

function getObjectField(
  result: ToolResult | Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> {
  const source =
    'structuredContent' in result
      ? result.structuredContent
      : result;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error(`Expected ${fieldName} to be available in structuredContent.`);
  }

  const value = source[fieldName];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected ${fieldName} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function getArrayField(result: ToolResult, fieldName: string): Array<Record<string, unknown>> {
  const structuredContent = result.structuredContent;

  if (!structuredContent) {
    throw new Error(`Expected ${fieldName} to be available in structuredContent.`);
  }

  const value = structuredContent[fieldName];

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${fieldName} to be an array.`);
  }

  return value as Array<Record<string, unknown>>;
}

function getNumberField(result: ToolResult, fieldName: string): number {
  const structuredContent = result.structuredContent;

  if (!structuredContent) {
    throw new Error(`Expected ${fieldName} to be available in structuredContent.`);
  }

  const value = structuredContent[fieldName];

  if (typeof value !== 'number') {
    throw new Error(`Expected ${fieldName} to be a number.`);
  }

  return value;
}

function getStringField(
  value: Record<string, unknown>,
  fieldName: string,
): string {
  const fieldValue = value[fieldName];

  if (typeof fieldValue !== 'string') {
    throw new Error(`Expected ${fieldName} to be a string.`);
  }

  return fieldValue;
}

function extractFrame(
  buffer: string,
): { payload: string; remaining: string } | null {
  const delimiterIndex = buffer.indexOf('\n\n');

  if (delimiterIndex === -1) {
    return null;
  }

  return {
    payload: buffer.slice(0, delimiterIndex),
    remaining: buffer.slice(delimiterIndex + 2),
  };
}

function parseSseFrame(frame: string): Record<string, unknown> | null {
  const dataLines = frame
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());

  if (dataLines.length === 0) {
    return null;
  }

  return JSON.parse(dataLines.join('\n')) as Record<string, unknown>;
}
