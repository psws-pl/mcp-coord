import { McpToolCallResult } from './mcp.types';

export class McpToolInputError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export class McpToolOperationError extends Error {
  constructor(
    public readonly toolName: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const createToolSuccessResult = (
  text: string,
  structuredContent?: Record<string, unknown>,
): McpToolCallResult => ({
  content: [
    {
      type: 'text',
      text,
    },
  ],
  ...(structuredContent === undefined ? {} : { structuredContent }),
});

export const createToolErrorResult = (
  toolName: string,
  message: string,
  details?: Record<string, unknown>,
): McpToolCallResult => ({
  isError: true,
  content: [
    {
      type: 'text',
      text: message,
    },
  ],
  structuredContent: {
    tool: toolName,
    ...(details === undefined ? {} : details),
  },
});

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const hasOwn = (
  value: Record<string, unknown>,
  key: string,
): boolean => Object.prototype.hasOwnProperty.call(value, key);
