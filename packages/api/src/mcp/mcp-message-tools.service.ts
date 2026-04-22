import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { CoordMessageEntity, CoordPlanEntity, CoordTaskEntity } from '../database/entities';
import {
  COORD_MESSAGE_STATUSES,
  COORD_MESSAGE_TYPES,
  CoordMessageStatus,
  CoordMessageType,
} from '../database/coord-schema.constants';
import { createToolErrorResult, createToolSuccessResult, hasOwn, isRecord, McpToolInputError, McpToolOperationError } from './mcp-tool-result.util';
import { CoordRealtimeService } from './coord-realtime.service';
import { McpExecutionContext, McpToolCallResult } from './mcp.types';

const COORD_MESSAGES_NOTIFY_CHANNEL = 'coord_messages';
const MESSAGE_STATUS_ORDER: readonly CoordMessageStatus[] = [
  'pending',
  'acknowledged',
  'done',
  'blocked',
  'ignored',
];

interface SendMessageInput {
  hasFrom: boolean;
  from: string | null;
  to: string;
  type: CoordMessageType;
  body: string;
  hasTaskId: boolean;
  taskId: string | null;
  hasPlanId: boolean;
  planId: string | null;
}

interface GetMessagesInput {
  hasStatus: boolean;
  status: CoordMessageStatus;
}

@Injectable()
export class McpMessageToolsService {
  constructor(
    @InjectRepository(CoordMessageEntity)
    private readonly messageRepository: Repository<CoordMessageEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: CoordRealtimeService,
  ) {}

  async sendMessage(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    const toolName = 'send_message';

    try {
      const input = this.parseSendMessageInput(arguments_);
      const sender = this.resolveSender(toolName, input, context);
      const message = await this.dataSource.transaction(async (manager) => {
        if (input.hasTaskId && input.taskId !== null) {
          await this.assertTaskExists(manager, toolName, input.taskId);
        }

        if (input.hasPlanId && input.planId !== null) {
          await this.assertPlanExists(manager, toolName, input.planId);
        }

        const messageRepository = manager.getRepository(CoordMessageEntity);
        const message = messageRepository.create({
          id: this.createMessageId(),
          from: sender,
          to: input.to,
          type: input.type,
          body: input.body,
          status: 'pending',
          taskId: input.taskId,
          planId: input.planId,
          acknowledgedAt: null,
        });
        const savedMessage = await messageRepository.save(message);

        await this.notifyMessageWrite(manager, 'sent', savedMessage);

        return savedMessage;
      });

      return createToolSuccessResult(
        `Sent message "${message.id}" to "${message.to}".`,
        {
          message: this.serializeMessage(message),
        },
      );
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async getMessages(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    const toolName = 'get_messages';

    try {
      const recipient = this.requireAuthenticatedAgent(toolName, context);
      const filter = this.parseGetMessagesInput(arguments_);
      const query = this.messageRepository
        .createQueryBuilder('message')
        .where('message.to = :recipient', { recipient });

      if (filter.hasStatus) {
        query.andWhere('message.status = :status', { status: filter.status });
      }

      query.orderBy(this.createMessageStatusOrderExpression(), 'ASC');
      query.addOrderBy('message.created_at', 'ASC');
      query.addOrderBy('message.id', 'ASC');

      const messages = await query.getMany();

      return createToolSuccessResult(
        filter.hasStatus
          ? `Fetched ${messages.length} "${filter.status}" messages for "${recipient}".`
          : `Fetched ${messages.length} messages for "${recipient}" in pending-first order.`,
        {
          recipient,
          status_filter: filter.hasStatus ? filter.status : null,
          order: 'pending_first_oldest_first',
          messages: messages.map((message) => this.serializeMessage(message)),
          total: messages.length,
        },
      );
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async ackMessage(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    const toolName = 'ack_message';

    try {
      const recipient = this.requireAuthenticatedAgent(toolName, context);
      const { id } = this.parseAckMessageInput(arguments_);

      const { message, changed } = await this.dataSource.transaction(async (manager) => {
        const messageRepository = manager.getRepository(CoordMessageEntity);
        const existingMessage = await messageRepository.findOneBy({ id });

        if (!existingMessage) {
          throw new McpToolOperationError(toolName, `Message "${id}" does not exist.`, {
            id,
          });
        }

        if (existingMessage.to !== recipient) {
          throw new McpToolOperationError(
            toolName,
            `Message "${id}" is not addressed to "${recipient}".`,
            {
              id,
              recipient,
              message_to: existingMessage.to,
            },
          );
        }

        if (existingMessage.status === 'acknowledged') {
          return { message: existingMessage, changed: false };
        }

        if (existingMessage.status !== 'pending') {
          throw new McpToolOperationError(
            toolName,
            `Message "${id}" cannot be acknowledged from status "${existingMessage.status}".`,
            {
              id,
              current_status: existingMessage.status,
              allowed_statuses: ['pending', 'acknowledged'],
            },
          );
        }

        const acknowledgedAt = new Date();
        await messageRepository.update(
          { id: existingMessage.id },
          {
            status: 'acknowledged',
            acknowledgedAt,
          },
        );

        const updatedMessage = await messageRepository.findOneBy({ id: existingMessage.id });

        if (!updatedMessage) {
          throw new McpToolOperationError(
            toolName,
            `Message "${id}" could not be loaded after acknowledgement.`,
            { id },
          );
        }

        await this.notifyMessageWrite(manager, 'acknowledged', updatedMessage);

        return { message: updatedMessage, changed: true };
      });

      return createToolSuccessResult(
        changed
          ? `Acknowledged message "${message.id}".`
          : `Message "${message.id}" was already acknowledged.`,
        {
          message: this.serializeMessage(message),
        },
      );
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  private parseSendMessageInput(arguments_: unknown): SendMessageInput {
    const argumentsRecord = this.parseArgumentsObject('send_message', arguments_, [
      'from',
      'to',
      'type',
      'body',
      'task_id',
      'plan_id',
    ]);
    const hasFrom = hasOwn(argumentsRecord, 'from');
    const hasTaskId = hasOwn(argumentsRecord, 'task_id');
    const hasPlanId = hasOwn(argumentsRecord, 'plan_id');

    return {
      hasFrom,
      from: hasFrom
        ? this.parseRequiredString('send_message', 'from', argumentsRecord.from)
        : null,
      to: this.parseRequiredString('send_message', 'to', argumentsRecord.to),
      type: hasOwn(argumentsRecord, 'type')
        ? this.parseMessageType('send_message', argumentsRecord.type)
        : 'question',
      body: this.parseRequiredBody('send_message', argumentsRecord.body),
      hasTaskId,
      taskId: hasTaskId
        ? this.parseNullableString('send_message', 'task_id', argumentsRecord.task_id)
        : null,
      hasPlanId,
      planId: hasPlanId
        ? this.parseNullableString('send_message', 'plan_id', argumentsRecord.plan_id)
        : null,
    };
  }

  private parseGetMessagesInput(arguments_: unknown): GetMessagesInput {
    const argumentsRecord = this.parseOptionalArgumentsObject('get_messages', arguments_, [
      'status',
    ]);
    const hasStatus = hasOwn(argumentsRecord, 'status');

    return {
      hasStatus,
      status: hasStatus
        ? this.parseMessageStatus('get_messages', argumentsRecord.status)
        : 'pending',
    };
  }

  private parseAckMessageInput(arguments_: unknown): { id: string } {
    const argumentsRecord = this.parseArgumentsObject('ack_message', arguments_, ['id']);

    return {
      id: this.parseRequiredString('ack_message', 'id', argumentsRecord.id),
    };
  }

  private resolveSender(
    toolName: string,
    input: SendMessageInput,
    context?: McpExecutionContext,
  ): string {
    const authenticatedAgentName = context?.authenticatedAgentName ?? null;
    const sender = input.from ?? authenticatedAgentName;

    if (sender === null) {
      throw new McpToolInputError(
        toolName,
        'from is required when the authenticated API key is not bound to an agent name.',
      );
    }

    if (authenticatedAgentName !== null && sender !== authenticatedAgentName) {
      throw new McpToolOperationError(
        toolName,
        `Authenticated agent "${authenticatedAgentName}" cannot send as "${sender}".`,
        {
          authenticated_agent: authenticatedAgentName,
          from: sender,
        },
      );
    }

    return sender;
  }

  private requireAuthenticatedAgent(
    toolName: string,
    context?: McpExecutionContext,
  ): string {
    const authenticatedAgentName = context?.authenticatedAgentName ?? null;

    if (authenticatedAgentName === null) {
      throw new McpToolOperationError(
        toolName,
        `${toolName} requires an API key bound to an agent name.`,
      );
    }

    return authenticatedAgentName;
  }

  private parseArgumentsObject(
    toolName: string,
    arguments_: unknown,
    allowedKeys: readonly string[],
  ): Record<string, unknown> {
    if (!isRecord(arguments_)) {
      throw new McpToolInputError(
        toolName,
        `${toolName} arguments must be a JSON object.`,
      );
    }

    this.assertAllowedKeys(toolName, arguments_, allowedKeys);

    return arguments_;
  }

  private parseOptionalArgumentsObject(
    toolName: string,
    arguments_: unknown,
    allowedKeys: readonly string[],
  ): Record<string, unknown> {
    if (arguments_ === undefined) {
      return {};
    }

    return this.parseArgumentsObject(toolName, arguments_, allowedKeys);
  }

  private assertAllowedKeys(
    toolName: string,
    argumentsRecord: Record<string, unknown>,
    allowedKeys: readonly string[],
  ): void {
    const unexpectedKeys = Object.keys(argumentsRecord).filter(
      (key) => !allowedKeys.includes(key),
    );

    if (unexpectedKeys.length > 0) {
      throw new McpToolInputError(
        toolName,
        `${toolName} received unsupported argument(s): ${unexpectedKeys.join(', ')}.`,
      );
    }
  }

  private parseRequiredString(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): string {
    if (typeof value !== 'string') {
      throw new McpToolInputError(toolName, `${fieldName} must be a non-empty string.`);
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new McpToolInputError(toolName, `${fieldName} must be a non-empty string.`);
    }

    return normalized;
  }

  private parseRequiredBody(toolName: string, value: unknown): string {
    if (typeof value !== 'string') {
      throw new McpToolInputError(toolName, 'body must be a non-empty string.');
    }

    if (value.trim().length === 0) {
      throw new McpToolInputError(toolName, 'body must be a non-empty string.');
    }

    return value;
  }

  private parseNullableString(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): string | null {
    if (value === null) {
      return null;
    }

    return this.parseRequiredString(toolName, fieldName, value);
  }

  private parseMessageStatus(toolName: string, value: unknown): CoordMessageStatus {
    const status = this.parseRequiredString(toolName, 'status', value);

    if (!COORD_MESSAGE_STATUSES.includes(status as CoordMessageStatus)) {
      throw new McpToolInputError(
        toolName,
        `status must be one of: ${COORD_MESSAGE_STATUSES.join(', ')}.`,
      );
    }

    return status as CoordMessageStatus;
  }

  private parseMessageType(toolName: string, value: unknown): CoordMessageType {
    const type = this.parseRequiredString(toolName, 'type', value);

    if (!COORD_MESSAGE_TYPES.includes(type as CoordMessageType)) {
      throw new McpToolInputError(
        toolName,
        `type must be one of: ${COORD_MESSAGE_TYPES.join(', ')}.`,
      );
    }

    return type as CoordMessageType;
  }

  private async assertTaskExists(
    manager: EntityManager,
    toolName: string,
    taskId: string,
  ): Promise<void> {
    const taskExists = await manager.getRepository(CoordTaskEntity).existsBy({ id: taskId });

    if (!taskExists) {
      throw new McpToolOperationError(toolName, `Task "${taskId}" does not exist.`, {
        task_id: taskId,
      });
    }
  }

  private async assertPlanExists(
    manager: EntityManager,
    toolName: string,
    planId: string,
  ): Promise<void> {
    const planExists = await manager.getRepository(CoordPlanEntity).existsBy({ id: planId });

    if (!planExists) {
      throw new McpToolOperationError(toolName, `Plan "${planId}" does not exist.`, {
        plan_id: planId,
      });
    }
  }

  private async notifyMessageWrite(
    manager: EntityManager,
    action: 'sent' | 'acknowledged',
    message: CoordMessageEntity,
  ): Promise<void> {
    await this.realtime.notify(
      COORD_MESSAGES_NOTIFY_CHANNEL,
      {
        entity: 'message',
        action,
        message: this.serializeMessage(message),
        timestamp: new Date().toISOString(),
      },
      manager,
    );
  }

  private serializeMessage(message: CoordMessageEntity): Record<string, unknown> {
    return {
      id: message.id,
      from: message.from,
      to: message.to,
      type: message.type,
      body: message.body,
      status: message.status,
      task_id: message.taskId,
      plan_id: message.planId,
      created_at: message.createdAt.toISOString(),
      updated_at: message.updatedAt.toISOString(),
      acknowledged_at: this.serializeDate(message.acknowledgedAt),
    };
  }

  private serializeDate(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
  }

  private createMessageId(): string {
    return `msg:${randomUUID()}`;
  }

  private createMessageStatusOrderExpression(): string {
    const cases = MESSAGE_STATUS_ORDER.map(
      (status, index) => `WHEN '${status}' THEN ${index}`,
    ).join(' ');

    return `CASE message.status ${cases} ELSE ${MESSAGE_STATUS_ORDER.length} END`;
  }

  private toToolErrorResult(
    toolName: string,
    error: unknown,
  ): McpToolCallResult {
    if (error instanceof McpToolInputError || error instanceof McpToolOperationError) {
      return createToolErrorResult(toolName, error.message, error.details);
    }

    if (error instanceof Error) {
      return createToolErrorResult(toolName, error.message);
    }

    return createToolErrorResult(toolName, 'Unexpected tool execution failure.');
  }
}
