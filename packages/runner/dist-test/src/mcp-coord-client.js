"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpCoordClient = void 0;
const types_1 = require("./types");
class McpCoordClient {
    config;
    fetchImpl;
    constructor(config, options = {}) {
        this.config = config;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    async registerAgent(input) {
        await this.callTool('register_agent', {
            name: input.name,
            status: input.status,
            driver: input.driver,
            capabilities: input.capabilities,
            metadata: input.metadata,
        });
    }
    async listTasks(filters = {}) {
        const payload = await this.callTool('list_tasks', {
            status: filters.status,
            owner: filters.owner,
            plan_id: filters.planId,
        });
        return parseTasks(payload.structuredContent?.['tasks']);
    }
    async getAgent(name) {
        const payload = await this.callTool('get_agent', { name });
        return parseAgent(payload.structuredContent?.['agent']);
    }
    async updateTask(taskId, input) {
        await this.callTool('update_task', {
            id: taskId,
            status: input.status,
            owner: input.owner,
            description: input.description,
            plan_id: input.planId,
            metadata: input.metadata,
        });
    }
    async sendMessage(input) {
        await this.callTool('send_message', {
            from: input.from,
            to: input.to,
            type: input.type,
            body: input.body,
            task_id: input.taskId,
            plan_id: input.planId,
        });
    }
    async callTool(name, args) {
        const response = await this.fetchImpl(this.config.mcordUrl, {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: `${name}:${Date.now()}`,
                method: 'tools/call',
                params: {
                    name,
                    arguments: Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined)),
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
            throw new Error(`[runner] Coord API ${name} call failed with status ${response.status}.`);
        }
        const envelope = (await response.json());
        const errorPayload = asRecord(envelope['error']);
        if (errorPayload) {
            const rpcError = errorPayload;
            throw new Error(`[runner] Coord API ${name} RPC error: ${rpcError.message ?? 'unknown error'}`);
        }
        const result = asRecord(envelope['result']);
        if (!result) {
            throw new Error(`[runner] Coord API ${name} returned an empty result.`);
        }
        const payload = result;
        if (payload.isError) {
            throw new Error(`[runner] Coord API ${name} tool error: ${readToolMessage(payload) ?? 'unknown tool error'}`);
        }
        return payload;
    }
}
exports.McpCoordClient = McpCoordClient;
function parseTasks(value) {
    if (!Array.isArray(value)) {
        throw new Error('[runner] Coord API list_tasks response is missing tasks[].');
    }
    return value.map(parseTask);
}
function parseTask(value) {
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
    if (typeof id !== 'string' ||
        typeof title !== 'string' ||
        typeof description !== 'string' ||
        typeof owner !== 'string') {
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
function parseAgent(value) {
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
    if (typeof driver === 'string' && !(0, types_1.isDriverName)(driver)) {
        throw new Error(`[runner] Coord API returned unsupported driver "${driver}".`);
    }
    return {
        id: typeof record['id'] === 'string' ? record['id'] : undefined,
        name,
        status: typeof record['status'] === 'string' ? record['status'] : undefined,
        enabled,
        driver: driver ?? null,
        capabilities: asRecord(record['capabilities']) ?? undefined,
        currentTaskId: typeof record['current_task_id'] === 'string' || record['current_task_id'] === null
            ? record['current_task_id']
            : undefined,
        lastHeartbeatAt: typeof record['last_heartbeat_at'] === 'string' ||
            record['last_heartbeat_at'] === null
            ? record['last_heartbeat_at']
            : undefined,
        metadata: asRecord(record['metadata']) ?? undefined,
    };
}
function isTaskStatus(value) {
    return (value === 'pending' ||
        value === 'in_progress' ||
        value === 'review' ||
        value === 'blocked' ||
        value === 'done');
}
function asRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value;
}
function readToolMessage(payload) {
    if (!Array.isArray(payload.content)) {
        return null;
    }
    const firstText = payload.content.find((entry) => entry.type === 'text' && typeof entry.text === 'string');
    return firstText?.text ?? null;
}
//# sourceMappingURL=mcp-coord-client.js.map