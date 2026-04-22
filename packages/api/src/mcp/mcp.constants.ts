import { McpToolDefinition } from './mcp.types';

export const MCP_SERVER_NAME = 'mcp-coord-api';
export const MCP_SERVER_VERSION = '0.0.0';
export const MCP_PROTOCOL_VERSION = '2024-11-05';

export const MCP_TOOL_DEFINITIONS: readonly McpToolDefinition[] = [
  {
    name: 'register_agent',
    description: 'Register or upsert an agent record.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        driver: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        capabilities: { type: 'object' },
        metadata: { type: 'object' },
      },
    },
  },
  {
    name: 'update_agent_status',
    description: 'Update an agent heartbeat and status fields.',
    inputSchema: {
      type: 'object',
      required: ['name', 'status'],
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        status: { type: 'string' },
        current_task_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        last_heartbeat_at: { type: 'string', format: 'date-time' },
      },
    },
  },
  {
    name: 'configure_agent',
    description: 'Update agent driver, enabled state, capabilities, or metadata.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        driver: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        capabilities: { type: 'object' },
        metadata: { type: 'object' },
      },
    },
  },
  {
    name: 'get_agent',
    description: 'Fetch a single agent with related coordination context.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        name: { type: 'string' },
      },
    },
  },
  {
    name: 'list_agents',
    description: 'List registered agents.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: { type: 'boolean' },
      },
    },
  },
  {
    name: 'create_task',
    description: 'Create a coordination task.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        owner: { type: 'string' },
        priority: { type: 'string' },
        plan_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        metadata: { type: 'object' },
      },
    },
  },
  {
    name: 'update_task',
    description: 'Update mutable task fields.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
        owner: { type: 'string' },
        priority: { type: 'string' },
        description: { type: 'string' },
        plan_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        metadata: { type: 'object' },
      },
    },
  },
  {
    name: 'assign_task',
    description: 'Assign a task to a specific owner.',
    inputSchema: {
      type: 'object',
      required: ['id', 'owner'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        owner: { type: 'string' },
      },
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks with optional filters.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string' },
        owner: { type: 'string' },
        plan_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_task',
    description: 'Fetch a single task by id.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
      },
    },
  },
  {
    name: 'send_message',
    description: 'Send a message from the calling agent to another agent or operator.',
    inputSchema: {
      type: 'object',
      required: ['to', 'body'],
      additionalProperties: false,
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        type: { type: 'string' },
        body: { type: 'string' },
        task_id: { type: ['string', 'null'] },
        plan_id: { type: ['string', 'null'] },
      },
    },
  },
  {
    name: 'get_messages',
    description: 'Fetch messages for the calling agent. Defaults to pending-first delivery order.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string' },
      },
    },
  },
  {
    name: 'ack_message',
    description: 'Acknowledge a pending message addressed to the calling agent.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
      },
    },
  },
  {
    name: 'create_plan',
    description: 'Create a coordination plan.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        owner: { type: 'string' },
      },
    },
  },
  {
    name: 'update_plan',
    description: 'Update mutable plan fields.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        planId: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        description: { type: 'string' },
        owner: { type: 'string' },
      },
    },
  },
  {
    name: 'list_plans',
    description: 'List coordination plans.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        owner: { type: 'string' },
        status: { type: 'string' },
      },
    },
  },
];
