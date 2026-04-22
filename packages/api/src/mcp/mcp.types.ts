export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

export type JsonRpcId = string | number | null;

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface McpToolCallParams {
  name: string;
  arguments?: unknown;
}

export interface McpExecutionContext {
  authenticatedAgentName: string | null;
}

export interface McpToolCallResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface CoordDashboardRealtimeEvent {
  channel: 'agents' | 'tasks' | 'messages' | 'plans';
  event: 'invalidate';
  timestamp: string;
  payload: {
    entity: 'agent' | 'task' | 'message' | 'plan';
    id: string;
  };
}

export function isJsonRpcErrorResponse(
  response: JsonRpcResponse,
): response is JsonRpcErrorResponse {
  return 'error' in response;
}
