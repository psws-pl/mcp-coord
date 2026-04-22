import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import {
  CoordAgentEntity,
  CoordMessageEntity,
  CoordTaskEntity,
} from '../database/entities';
import {
  COORD_AGENT_STATUSES,
  CoordAgentStatus,
  CoordJsonObject,
} from '../database/coord-schema.constants';
import { CoordRealtimeService } from './coord-realtime.service';
import {
  createToolErrorResult,
  createToolSuccessResult,
  hasOwn,
  isRecord,
  McpToolInputError,
  McpToolOperationError,
} from './mcp-tool-result.util';
import { McpToolCallResult } from './mcp.types';

const COORD_AGENTS_NOTIFY_CHANNEL = 'coord_agents';
const ALLOWED_AGENT_DRIVERS = ['claude', 'codex', 'gemini', 'aider', 'generic'] as const;

type AllowedAgentDriver = (typeof ALLOWED_AGENT_DRIVERS)[number];

interface RegisterAgentInput {
  name: string;
  status?: CoordAgentStatus;
  hasDriver: boolean;
  driver: AllowedAgentDriver | null;
  capabilities?: CoordJsonObject;
  metadata?: CoordJsonObject;
}

interface UpdateAgentStatusInput {
  name: string;
  status: CoordAgentStatus;
  hasCurrentTaskId: boolean;
  currentTaskId: string | null;
  lastHeartbeatAt: Date;
}

interface ConfigureAgentInput {
  name: string;
  hasEnabled: boolean;
  enabled: boolean;
  hasDriver: boolean;
  driver: AllowedAgentDriver | null;
  capabilities?: CoordJsonObject;
  metadata?: CoordJsonObject;
}

@Injectable()
export class McpAgentToolsService {
  constructor(
    @InjectRepository(CoordAgentEntity)
    private readonly agentRepository: Repository<CoordAgentEntity>,
    @InjectRepository(CoordTaskEntity)
    private readonly taskRepository: Repository<CoordTaskEntity>,
    @InjectRepository(CoordMessageEntity)
    private readonly messageRepository: Repository<CoordMessageEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: CoordRealtimeService,
  ) {}

  async registerAgent(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'register_agent';

    try {
      const input = this.parseRegisterAgentInput(arguments_);
      const agent = await this.dataSource.transaction(async (manager) => {
        const agentRepository = manager.getRepository(CoordAgentEntity);
        const payload: QueryDeepPartialEntity<CoordAgentEntity> = {
          id: this.createAgentId(input.name),
          name: input.name,
        };

        if (input.status !== undefined) {
          payload.status = input.status;
        }

        if (input.hasDriver) {
          payload.driver = input.driver;
        }

        if (input.capabilities !== undefined) {
          payload.capabilities = this.toJsonColumnValue(input.capabilities);
        }

        if (input.metadata !== undefined) {
          payload.metadata = this.toJsonColumnValue(input.metadata);
        }

        await agentRepository.upsert(payload, ['name']);

        const savedAgent = await agentRepository.findOneBy({ name: input.name });

        if (!savedAgent) {
          throw new McpToolOperationError(
            toolName,
            `Agent "${input.name}" could not be loaded after registration.`,
          );
        }

        await this.notifyAgentWrite(manager, 'registered', savedAgent);

        return savedAgent;
      });

      return createToolSuccessResult(`Registered agent "${agent.name}".`, {
        agent: this.serializeAgent(agent),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async updateAgentStatus(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'update_agent_status';

    try {
      const input = this.parseUpdateAgentStatusInput(arguments_);
      const agent = await this.dataSource.transaction(async (manager) => {
        const agentRepository = manager.getRepository(CoordAgentEntity);
        const taskRepository = manager.getRepository(CoordTaskEntity);
        const existingAgent = await agentRepository.findOneBy({ name: input.name });

        if (!existingAgent) {
          throw new McpToolOperationError(
            toolName,
            `Agent "${input.name}" is not registered.`,
          );
        }

        if (input.currentTaskId !== null) {
          const taskExists = await taskRepository.existsBy({ id: input.currentTaskId });

          if (!taskExists) {
            throw new McpToolOperationError(
              toolName,
              `Task "${input.currentTaskId}" does not exist.`,
              {
                current_task_id: input.currentTaskId,
              },
            );
          }
        }

        const updatePayload: QueryDeepPartialEntity<CoordAgentEntity> = {
          status: input.status,
          lastHeartbeatAt: input.lastHeartbeatAt,
        };

        if (input.hasCurrentTaskId) {
          updatePayload.currentTaskId = input.currentTaskId;
        }

        await agentRepository.update({ id: existingAgent.id }, updatePayload);

        const updatedAgent = await agentRepository.findOneBy({ id: existingAgent.id });

        if (!updatedAgent) {
          throw new McpToolOperationError(
            toolName,
            `Agent "${input.name}" could not be loaded after the status update.`,
          );
        }

        await this.notifyAgentWrite(manager, 'status_updated', updatedAgent);

        return updatedAgent;
      });

      return createToolSuccessResult(`Updated status for agent "${agent.name}".`, {
        agent: this.serializeAgent(agent),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async configureAgent(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'configure_agent';

    try {
      const input = this.parseConfigureAgentInput(arguments_);
      const agent = await this.dataSource.transaction(async (manager) => {
        const agentRepository = manager.getRepository(CoordAgentEntity);
        const existingAgent = await agentRepository.findOneBy({ name: input.name });

        if (!existingAgent) {
          throw new McpToolOperationError(
            toolName,
            `Agent "${input.name}" is not registered.`,
          );
        }

        const updatePayload: QueryDeepPartialEntity<CoordAgentEntity> = {};

        if (input.hasEnabled) {
          updatePayload.enabled = input.enabled;
        }

        if (input.hasDriver) {
          updatePayload.driver = input.driver;
        }

        if (input.capabilities !== undefined) {
          updatePayload.capabilities = this.toJsonColumnValue(input.capabilities);
        }

        if (input.metadata !== undefined) {
          updatePayload.metadata = this.toJsonColumnValue(input.metadata);
        }

        await agentRepository.update({ id: existingAgent.id }, updatePayload);

        const updatedAgent = await agentRepository.findOneBy({ id: existingAgent.id });

        if (!updatedAgent) {
          throw new McpToolOperationError(
            toolName,
            `Agent "${input.name}" could not be loaded after configuration.`,
          );
        }

        await this.notifyAgentWrite(manager, 'configured', updatedAgent);

        return updatedAgent;
      });

      return createToolSuccessResult(`Configured agent "${agent.name}".`, {
        agent: this.serializeAgent(agent),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async getAgent(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'get_agent';

    try {
      const { name } = this.parseGetAgentInput(arguments_);
      const agent = await this.agentRepository.findOneBy({ name });

      if (!agent) {
        throw new McpToolOperationError(toolName, `Agent "${name}" is not registered.`);
      }

      const recentTasks = await this.taskRepository.find({
        where: { owner: name },
        order: { updatedAt: 'DESC' },
        take: 20,
      });
      const recentMessages = await this.messageRepository.find({
        where: [{ from: name }, { to: name }],
        order: { createdAt: 'DESC' },
        take: 10,
      });

      return createToolSuccessResult(
        `Fetched agent "${agent.name}" with ${recentTasks.length} recent tasks and ${recentMessages.length} recent messages.`,
        {
          agent: this.serializeAgent(agent),
          recent_tasks: recentTasks.map((task) => this.serializeTask(task)),
          recent_messages: recentMessages.map((message) =>
            this.serializeMessage(message),
          ),
        },
      );
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async listAgents(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'list_agents';

    try {
      const filter = this.parseListAgentsInput(arguments_);
      const where: FindOptionsWhere<CoordAgentEntity> | undefined = filter.hasEnabled
        ? { enabled: filter.enabled }
        : undefined;
      const agents = await this.agentRepository.find({
        ...(where === undefined ? {} : { where }),
        order: { name: 'ASC' },
      });

      return createToolSuccessResult(`Found ${agents.length} registered agents.`, {
        agents: agents.map((agent) => this.serializeAgent(agent)),
        total: agents.length,
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  private async notifyAgentWrite(
    manager: EntityManager,
    action: 'registered' | 'status_updated' | 'configured',
    agent: CoordAgentEntity,
  ): Promise<void> {
    await this.realtime.notify(
      COORD_AGENTS_NOTIFY_CHANNEL,
      {
        entity: 'agent',
        action,
        agent: this.serializeAgent(agent),
        timestamp: new Date().toISOString(),
      },
      manager,
    );
  }

  private parseRegisterAgentInput(arguments_: unknown): RegisterAgentInput {
    const argumentsRecord = this.parseArgumentsObject(
      'register_agent',
      arguments_,
      ['name', 'status', 'driver', 'capabilities', 'metadata'],
    );

    const name = this.parseName('register_agent', argumentsRecord.name);
    const status = hasOwn(argumentsRecord, 'status')
      ? this.parseAgentStatus('register_agent', argumentsRecord.status)
      : undefined;
    const hasDriver = hasOwn(argumentsRecord, 'driver');
    const capabilities = hasOwn(argumentsRecord, 'capabilities')
      ? this.parseJsonObject(
          'register_agent',
          'capabilities',
          argumentsRecord.capabilities,
        )
      : undefined;
    const metadata = hasOwn(argumentsRecord, 'metadata')
      ? this.parseJsonObject('register_agent', 'metadata', argumentsRecord.metadata)
      : undefined;

    return {
      name,
      status,
      hasDriver,
      driver: hasDriver
        ? this.parseAgentDriver('register_agent', argumentsRecord.driver)
        : null,
      capabilities,
      metadata,
    };
  }

  private parseUpdateAgentStatusInput(arguments_: unknown): UpdateAgentStatusInput {
    const argumentsRecord = this.parseArgumentsObject(
      'update_agent_status',
      arguments_,
      ['name', 'status', 'current_task_id', 'last_heartbeat_at'],
    );
    const hasCurrentTaskId = hasOwn(argumentsRecord, 'current_task_id');

    return {
      name: this.parseName('update_agent_status', argumentsRecord.name),
      status: this.parseAgentStatus('update_agent_status', argumentsRecord.status),
      hasCurrentTaskId,
      currentTaskId: hasCurrentTaskId
        ? this.parseNullableString(
            'update_agent_status',
            'current_task_id',
            argumentsRecord.current_task_id,
          )
        : null,
      lastHeartbeatAt: hasOwn(argumentsRecord, 'last_heartbeat_at')
        ? this.parseDate(
            'update_agent_status',
            'last_heartbeat_at',
            argumentsRecord.last_heartbeat_at,
          )
        : new Date(),
    };
  }

  private parseConfigureAgentInput(arguments_: unknown): ConfigureAgentInput {
    const argumentsRecord = this.parseArgumentsObject(
      'configure_agent',
      arguments_,
      ['name', 'enabled', 'driver', 'capabilities', 'metadata'],
    );
    const hasEnabled = hasOwn(argumentsRecord, 'enabled');
    const hasDriver = hasOwn(argumentsRecord, 'driver');
    const capabilities = hasOwn(argumentsRecord, 'capabilities')
      ? this.parseJsonObject(
          'configure_agent',
          'capabilities',
          argumentsRecord.capabilities,
        )
      : undefined;
    const metadata = hasOwn(argumentsRecord, 'metadata')
      ? this.parseJsonObject('configure_agent', 'metadata', argumentsRecord.metadata)
      : undefined;

    if (!hasEnabled && !hasDriver && capabilities === undefined && metadata === undefined) {
      throw new McpToolInputError(
        'configure_agent',
        'configure_agent requires at least one field to update.',
      );
    }

    return {
      name: this.parseName('configure_agent', argumentsRecord.name),
      hasEnabled,
      enabled: hasEnabled
        ? this.parseBoolean('configure_agent', 'enabled', argumentsRecord.enabled)
        : false,
      hasDriver,
      driver: hasDriver
        ? this.parseAgentDriver('configure_agent', argumentsRecord.driver)
        : null,
      capabilities,
      metadata,
    };
  }

  private parseGetAgentInput(arguments_: unknown): { name: string } {
    const argumentsRecord = this.parseArgumentsObject('get_agent', arguments_, ['name']);

    return {
      name: this.parseName('get_agent', argumentsRecord.name),
    };
  }

  private parseListAgentsInput(
    arguments_: unknown,
  ): { hasEnabled: boolean; enabled: boolean } {
    const argumentsRecord = this.parseOptionalArgumentsObject(
      'list_agents',
      arguments_,
      ['enabled'],
    );
    const hasEnabled = hasOwn(argumentsRecord, 'enabled');

    return {
      hasEnabled,
      enabled: hasEnabled
        ? this.parseBoolean('list_agents', 'enabled', argumentsRecord.enabled)
        : false,
    };
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

  private parseName(toolName: string, value: unknown): string {
    return this.parseRequiredString(toolName, 'name', value);
  }

  private parseRequiredString(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): string {
    if (typeof value !== 'string') {
      throw new McpToolInputError(
        toolName,
        `${fieldName} must be a non-empty string.`,
      );
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new McpToolInputError(
        toolName,
        `${fieldName} must be a non-empty string.`,
      );
    }

    return normalized;
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

  private parseBoolean(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): boolean {
    if (typeof value !== 'boolean') {
      throw new McpToolInputError(toolName, `${fieldName} must be a boolean.`);
    }

    return value;
  }

  private parseAgentStatus(toolName: string, value: unknown): CoordAgentStatus {
    const status = this.parseRequiredString(toolName, 'status', value);

    if (!COORD_AGENT_STATUSES.includes(status as CoordAgentStatus)) {
      throw new McpToolInputError(
        toolName,
        `status must be one of: ${COORD_AGENT_STATUSES.join(', ')}.`,
      );
    }

    return status as CoordAgentStatus;
  }

  private parseAgentDriver(
    toolName: string,
    value: unknown,
  ): AllowedAgentDriver | null {
    if (value === null) {
      return null;
    }

    const driver = this.parseRequiredString(toolName, 'driver', value);

    if (!ALLOWED_AGENT_DRIVERS.includes(driver as AllowedAgentDriver)) {
      throw new McpToolInputError(
        toolName,
        `driver must be one of: ${ALLOWED_AGENT_DRIVERS.join(', ')}, or null.`,
      );
    }

    return driver as AllowedAgentDriver;
  }

  private parseJsonObject(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): CoordJsonObject {
    if (!isRecord(value)) {
      throw new McpToolInputError(
        toolName,
        `${fieldName} must be a JSON object.`,
      );
    }

    return value;
  }

  private parseDate(toolName: string, fieldName: string, value: unknown): Date {
    if (typeof value !== 'string') {
      throw new McpToolInputError(
        toolName,
        `${fieldName} must be an ISO 8601 timestamp string.`,
      );
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new McpToolInputError(
        toolName,
        `${fieldName} must be an ISO 8601 timestamp string.`,
      );
    }

    return parsedDate;
  }

  private serializeAgent(agent: CoordAgentEntity): Record<string, unknown> {
    return {
      id: agent.id,
      name: agent.name,
      status: agent.status,
      enabled: agent.enabled,
      driver: agent.driver,
      capabilities: agent.capabilities,
      current_task_id: agent.currentTaskId,
      last_heartbeat_at: this.serializeDate(agent.lastHeartbeatAt),
      metadata: agent.metadata,
      created_at: agent.createdAt.toISOString(),
      updated_at: agent.updatedAt.toISOString(),
    };
  }

  private serializeTask(task: CoordTaskEntity): Record<string, unknown> {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      owner: task.owner,
      plan_id: task.planId,
      metadata: task.metadata,
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    };
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

  private toJsonColumnValue(
    value: CoordJsonObject,
  ): QueryDeepPartialEntity<CoordJsonObject> {
    return value as QueryDeepPartialEntity<CoordJsonObject>;
  }

  private createAgentId(name: string): string {
    return `agent:${Buffer.from(name, 'utf8').toString('base64url')}`;
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
