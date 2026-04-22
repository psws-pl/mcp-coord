import { Injectable } from '@nestjs/common';

import {
  MCP_PROTOCOL_VERSION,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_TOOL_DEFINITIONS,
} from './mcp.constants';
import {
  McpExecutionContext,
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolCallParams,
  McpToolCallResult,
} from './mcp.types';
import { McpToolHandlersService } from './mcp-tool-handlers.service';

@Injectable()
export class McpDispatcherService {
  constructor(private readonly toolHandlers: McpToolHandlersService) {}

  async dispatch(
    payload: unknown,
    context?: McpExecutionContext,
  ): Promise<JsonRpcResponse | null> {
    let request: JsonRpcRequest | undefined;

    try {
      request = this.parseRequest(payload);
      const isNotification = request.id === undefined;

      switch (request.method) {
        case 'initialize':
          return isNotification
            ? null
            : this.createSuccessResponse(request.id ?? null, {
                protocolVersion: MCP_PROTOCOL_VERSION,
                capabilities: {
                  tools: {
                    listChanged: false,
                  },
                },
                serverInfo: {
                  name: MCP_SERVER_NAME,
                  version: MCP_SERVER_VERSION,
                },
              });
        case 'notifications/initialized':
          return null;
        case 'ping':
          return isNotification
            ? null
            : this.createSuccessResponse(request.id ?? null, {});
        case 'tools/list':
          return isNotification
            ? null
            : this.createSuccessResponse(request.id ?? null, {
                tools: MCP_TOOL_DEFINITIONS,
              });
        case 'tools/call':
          return isNotification
            ? null
            : this.createSuccessResponse(
                request.id ?? null,
                await this.executeToolCall(request.params, context),
              );
        default:
          return this.createErrorResponse(
            request.id ?? null,
            -32601,
            `Method "${request.method}" is not supported.`,
          );
      }
    } catch (error) {
      return this.createErrorResponseFromUnknown(error, request?.id ?? null);
    }
  }

  createSseErrorPayload(error: unknown): JsonRpcErrorResponse {
    return this.createErrorResponseFromUnknown(error, null);
  }

  private async executeToolCall(
    params: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    const toolCall = this.parseToolCallParams(params);

    switch (toolCall.name) {
      case 'register_agent':
        return this.toolHandlers.registerAgent(toolCall.arguments);
      case 'update_agent_status':
        return this.toolHandlers.updateAgentStatus(toolCall.arguments);
      case 'configure_agent':
        return this.toolHandlers.configureAgent(toolCall.arguments);
      case 'get_agent':
        return this.toolHandlers.getAgent(toolCall.arguments);
      case 'list_agents':
        return this.toolHandlers.listAgents(toolCall.arguments);
      case 'create_task':
        return this.toolHandlers.createTask(toolCall.arguments);
      case 'update_task':
        return this.toolHandlers.updateTask(toolCall.arguments);
      case 'assign_task':
        return this.toolHandlers.assignTask(toolCall.arguments);
      case 'list_tasks':
        return this.toolHandlers.listTasks(toolCall.arguments);
      case 'get_task':
        return this.toolHandlers.getTask(toolCall.arguments);
      case 'send_message':
        return this.toolHandlers.sendMessage(toolCall.arguments, context);
      case 'get_messages':
        return this.toolHandlers.getMessages(toolCall.arguments, context);
      case 'ack_message':
        return this.toolHandlers.ackMessage(toolCall.arguments, context);
      case 'create_plan':
        return this.toolHandlers.createPlan(toolCall.arguments);
      case 'update_plan':
        return this.toolHandlers.updatePlan(toolCall.arguments);
      case 'list_plans':
        return this.toolHandlers.listPlans(toolCall.arguments);
      default:
        throw new JsonRpcProtocolError(
          -32602,
          `Tool "${toolCall.name}" is not registered.`,
        );
    }
  }

  private parseRequest(payload: unknown): JsonRpcRequest {
    if (Array.isArray(payload)) {
      throw new JsonRpcProtocolError(-32600, 'Batch requests are not supported.');
    }

    if (!this.isRecord(payload)) {
      throw new JsonRpcProtocolError(-32600, 'Request body must be a JSON object.');
    }

    if (payload.jsonrpc !== '2.0') {
      throw new JsonRpcProtocolError(
        -32600,
        'Only JSON-RPC 2.0 requests are supported.',
      );
    }

    if (typeof payload.method !== 'string' || payload.method.length === 0) {
      throw new JsonRpcProtocolError(-32600, 'JSON-RPC method must be a string.');
    }

    if (
      'id' in payload &&
      payload.id !== null &&
      typeof payload.id !== 'string' &&
      typeof payload.id !== 'number'
    ) {
      throw new JsonRpcProtocolError(
        -32600,
        'JSON-RPC id must be a string, number, or null.',
      );
    }

    return {
      jsonrpc: '2.0',
      id: payload.id as JsonRpcId | undefined,
      method: payload.method,
      params: payload.params,
    };
  }

  private parseToolCallParams(params: unknown): McpToolCallParams {
    if (!this.isRecord(params)) {
      throw new JsonRpcProtocolError(
        -32602,
        'tools/call params must be an object.',
      );
    }

    if (typeof params.name !== 'string' || params.name.length === 0) {
      throw new JsonRpcProtocolError(
        -32602,
        'tools/call requires a non-empty tool name.',
      );
    }

    return {
      name: params.name,
      arguments: params.arguments,
    };
  }

  private createSuccessResponse(
    id: JsonRpcId,
    result: unknown,
  ): JsonRpcResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  private createErrorResponse(
    id: JsonRpcId,
    code: number,
    message: string,
    data?: unknown,
  ): JsonRpcErrorResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data === undefined ? {} : { data }),
      },
    };
  }

  private createErrorResponseFromUnknown(
    error: unknown,
    fallbackId: JsonRpcId,
  ): JsonRpcErrorResponse {
    if (error instanceof JsonRpcProtocolError) {
      return this.createErrorResponse(
        fallbackId,
        error.code,
        error.message,
        error.data,
      );
    }

    if (error instanceof Error) {
      return this.createErrorResponse(fallbackId, -32603, error.message);
    }

    return this.createErrorResponse(
      fallbackId,
      -32603,
      'Unexpected MCP dispatch failure.',
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

class JsonRpcProtocolError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
  }
}
