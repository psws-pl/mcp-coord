import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { CoordPlanEntity, CoordTaskEntity } from '../database/entities';
import {
  COORD_TASK_PRIORITIES,
  COORD_TASK_STATUSES,
  CoordJsonObject,
  CoordTaskPriority,
  CoordTaskStatus,
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

const COORD_TASKS_NOTIFY_CHANNEL = 'coord_tasks';

const TASK_STATUS_TRANSITIONS: Record<CoordTaskStatus, readonly CoordTaskStatus[]> = {
  pending: ['pending', 'in_progress', 'review', 'done', 'blocked', 'cancelled'],
  in_progress: ['in_progress', 'review', 'done', 'blocked', 'cancelled'],
  review: ['review', 'in_progress', 'done', 'blocked', 'cancelled'],
  done: ['done'],
  blocked: ['blocked', 'pending', 'in_progress', 'cancelled'],
  cancelled: ['cancelled'],
};

interface CreateTaskInput {
  id: string | null;
  title: string;
  description: string;
  status: CoordTaskStatus;
  priority: CoordTaskPriority;
  owner: string;
  hasPlanId: boolean;
  planId: string | null;
  metadata: CoordJsonObject;
}

interface UpdateTaskInput {
  id: string;
  hasStatus: boolean;
  status: CoordTaskStatus;
  hasPriority: boolean;
  priority: CoordTaskPriority;
  hasOwner: boolean;
  owner: string;
  hasDescription: boolean;
  description: string;
  hasPlanId: boolean;
  planId: string | null;
  metadata?: CoordJsonObject;
}

interface AssignTaskInput {
  id: string;
  owner: string;
}

interface ListTasksInput {
  hasStatus: boolean;
  status: CoordTaskStatus;
  hasOwner: boolean;
  owner: string;
  hasPlanId: boolean;
  planId: string;
}

@Injectable()
export class McpTaskToolsService {
  constructor(
    @InjectRepository(CoordTaskEntity)
    private readonly taskRepository: Repository<CoordTaskEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: CoordRealtimeService,
  ) {}

  async createTask(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'create_task';

    try {
      const input = this.parseCreateTaskInput(arguments_);
      const task = await this.dataSource.transaction(async (manager) => {
        if (input.hasPlanId && input.planId !== null) {
          await this.assertPlanExists(manager, toolName, input.planId);
        }

        const id = input.id ?? this.createTaskId();
        const taskRepository = manager.getRepository(CoordTaskEntity);
        const existingTask = await taskRepository.findOneBy({ id });

        if (existingTask) {
          throw new McpToolOperationError(toolName, `Task "${id}" already exists.`, {
            id,
          });
        }

        const task = taskRepository.create({
          id,
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          owner: input.owner,
          planId: input.planId,
          metadata: input.metadata,
        });
        const savedTask = await taskRepository.save(task);

        await this.notifyTaskWrite(manager, 'created', savedTask);

        return savedTask;
      });

      return createToolSuccessResult(`Created task "${task.id}".`, {
        task: this.serializeTask(task),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async updateTask(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'update_task';

    try {
      const input = this.parseUpdateTaskInput(arguments_);
      const task = await this.dataSource.transaction(async (manager) => {
        const taskRepository = manager.getRepository(CoordTaskEntity);
        const existingTask = await this.getExistingTask(taskRepository, toolName, input.id);
        const updatePayload: QueryDeepPartialEntity<CoordTaskEntity> = {};

        if (input.hasStatus) {
          this.assertTaskStatusTransition(toolName, existingTask.status, input.status);
          updatePayload.status = input.status;
        }

        if (input.hasPriority) {
          updatePayload.priority = input.priority;
        }

        if (input.hasDescription) {
          updatePayload.description = input.description;
        }

        if (input.hasPlanId) {
          if (input.planId !== null) {
            await this.assertPlanExists(manager, toolName, input.planId);
          }

          updatePayload.planId = input.planId;
        }

        let previousOwner: string | null = null;

        if (input.hasOwner) {
          updatePayload.owner = input.owner;

          if (existingTask.owner !== input.owner) {
            previousOwner = existingTask.owner;
          }
        }

        if (input.metadata !== undefined || previousOwner !== null) {
          updatePayload.metadata = this.toJsonColumnValue(
            this.mergeTaskMetadata(existingTask.metadata, input.metadata, previousOwner, input.hasOwner ? input.owner : existingTask.owner),
          );
        }

        await taskRepository.update({ id: existingTask.id }, updatePayload);

        const updatedTask = await this.getExistingTask(taskRepository, toolName, existingTask.id);

        await this.notifyTaskWrite(
          manager,
          previousOwner === null ? 'updated' : 'assigned',
          updatedTask,
          previousOwner,
        );

        return updatedTask;
      });

      return createToolSuccessResult(`Updated task "${task.id}".`, {
        task: this.serializeTask(task),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async assignTask(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'assign_task';

    try {
      const input = this.parseAssignTaskInput(arguments_);
      const task = await this.dataSource.transaction(async (manager) => {
        const taskRepository = manager.getRepository(CoordTaskEntity);
        const existingTask = await this.getExistingTask(taskRepository, toolName, input.id);

        if (existingTask.owner === input.owner) {
          return existingTask;
        }

        const metadata = this.mergeTaskMetadata(
          existingTask.metadata,
          undefined,
          existingTask.owner,
          input.owner,
        );

        await taskRepository.update(
          { id: existingTask.id },
          {
            owner: input.owner,
            metadata: this.toJsonColumnValue(metadata),
          },
        );

        const updatedTask = await this.getExistingTask(taskRepository, toolName, existingTask.id);

        await this.notifyTaskWrite(manager, 'assigned', updatedTask, existingTask.owner);

        return updatedTask;
      });

      return createToolSuccessResult(`Assigned task "${task.id}" to "${task.owner}".`, {
        task: this.serializeTask(task),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async listTasks(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'list_tasks';

    try {
      const filter = this.parseListTasksInput(arguments_);
      const where: FindOptionsWhere<CoordTaskEntity> = {};

      if (filter.hasStatus) {
        where.status = filter.status;
      }

      if (filter.hasOwner) {
        where.owner = filter.owner;
      }

      if (filter.hasPlanId) {
        where.planId = filter.planId;
      }

      const tasks = await this.taskRepository.find({
        ...(Object.keys(where).length === 0 ? {} : { where }),
        order: {
          createdAt: 'ASC',
          id: 'ASC',
        },
      });

      return createToolSuccessResult(`Found ${tasks.length} task records.`, {
        tasks: tasks.map((task) => this.serializeTask(task)),
        total: tasks.length,
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async getTask(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'get_task';

    try {
      const { id } = this.parseGetTaskInput(arguments_);
      const task = await this.taskRepository.findOneBy({ id });

      if (!task) {
        throw new McpToolOperationError(toolName, `Task "${id}" does not exist.`, {
          id,
        });
      }

      return createToolSuccessResult(`Fetched task "${task.id}".`, {
        task: this.serializeTask(task),
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  private parseCreateTaskInput(arguments_: unknown): CreateTaskInput {
    const argumentsRecord = this.parseArgumentsObject(
      'create_task',
      arguments_,
      ['id', 'title', 'description', 'status', 'priority', 'owner', 'plan_id', 'metadata'],
    );

    const hasPlanId = hasOwn(argumentsRecord, 'plan_id');
    const metadata = hasOwn(argumentsRecord, 'metadata')
      ? this.parseJsonObject('create_task', 'metadata', argumentsRecord.metadata)
      : {};

    return {
      id: hasOwn(argumentsRecord, 'id')
        ? this.parseRequiredString('create_task', 'id', argumentsRecord.id)
        : null,
      title: this.parseRequiredString('create_task', 'title', argumentsRecord.title),
      description: hasOwn(argumentsRecord, 'description')
        ? this.parseString('create_task', 'description', argumentsRecord.description)
        : '',
      status: hasOwn(argumentsRecord, 'status')
        ? this.parseTaskStatus('create_task', argumentsRecord.status)
        : 'pending',
      priority: hasOwn(argumentsRecord, 'priority')
        ? this.parseTaskPriority('create_task', argumentsRecord.priority)
        : 'P2',
      owner: hasOwn(argumentsRecord, 'owner')
        ? this.parseRequiredString('create_task', 'owner', argumentsRecord.owner)
        : 'orch',
      hasPlanId,
      planId: hasPlanId
        ? this.parseNullableString('create_task', 'plan_id', argumentsRecord.plan_id)
        : null,
      metadata,
    };
  }

  private parseUpdateTaskInput(arguments_: unknown): UpdateTaskInput {
    const argumentsRecord = this.parseArgumentsObject(
      'update_task',
      arguments_,
      ['id', 'status', 'priority', 'owner', 'description', 'plan_id', 'metadata'],
    );
    const hasStatus = hasOwn(argumentsRecord, 'status');
    const hasPriority = hasOwn(argumentsRecord, 'priority');
    const hasOwner = hasOwn(argumentsRecord, 'owner');
    const hasDescription = hasOwn(argumentsRecord, 'description');
    const hasPlanId = hasOwn(argumentsRecord, 'plan_id');
    const metadata = hasOwn(argumentsRecord, 'metadata')
      ? this.parseJsonObject('update_task', 'metadata', argumentsRecord.metadata)
      : undefined;

    if (
      !hasStatus &&
      !hasPriority &&
      !hasOwner &&
      !hasDescription &&
      !hasPlanId &&
      metadata === undefined
    ) {
      throw new McpToolInputError(
        'update_task',
        'update_task requires at least one mutable field to update.',
      );
    }

    return {
      id: this.parseRequiredString('update_task', 'id', argumentsRecord.id),
      hasStatus,
      status: hasStatus
        ? this.parseTaskStatus('update_task', argumentsRecord.status)
        : 'pending',
      hasPriority,
      priority: hasPriority
        ? this.parseTaskPriority('update_task', argumentsRecord.priority)
        : 'P2',
      hasOwner,
      owner: hasOwner
        ? this.parseRequiredString('update_task', 'owner', argumentsRecord.owner)
        : '',
      hasDescription,
      description: hasDescription
        ? this.parseString('update_task', 'description', argumentsRecord.description)
        : '',
      hasPlanId,
      planId: hasPlanId
        ? this.parseNullableString('update_task', 'plan_id', argumentsRecord.plan_id)
        : null,
      metadata,
    };
  }

  private parseAssignTaskInput(arguments_: unknown): AssignTaskInput {
    const argumentsRecord = this.parseArgumentsObject('assign_task', arguments_, [
      'id',
      'owner',
    ]);

    return {
      id: this.parseRequiredString('assign_task', 'id', argumentsRecord.id),
      owner: this.parseRequiredString('assign_task', 'owner', argumentsRecord.owner),
    };
  }

  private parseListTasksInput(arguments_: unknown): ListTasksInput {
    const argumentsRecord = this.parseOptionalArgumentsObject('list_tasks', arguments_, [
      'status',
      'owner',
      'plan_id',
    ]);
    const hasStatus = hasOwn(argumentsRecord, 'status');
    const hasOwner = hasOwn(argumentsRecord, 'owner');
    const hasPlanId = hasOwn(argumentsRecord, 'plan_id');

    return {
      hasStatus,
      status: hasStatus
        ? this.parseTaskStatus('list_tasks', argumentsRecord.status)
        : 'pending',
      hasOwner,
      owner: hasOwner
        ? this.parseRequiredString('list_tasks', 'owner', argumentsRecord.owner)
        : '',
      hasPlanId,
      planId: hasPlanId
        ? this.parseRequiredString('list_tasks', 'plan_id', argumentsRecord.plan_id)
        : '',
    };
  }

  private parseGetTaskInput(arguments_: unknown): { id: string } {
    const argumentsRecord = this.parseArgumentsObject('get_task', arguments_, ['id']);

    return {
      id: this.parseRequiredString('get_task', 'id', argumentsRecord.id),
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

  private parseString(toolName: string, fieldName: string, value: unknown): string {
    if (typeof value !== 'string') {
      throw new McpToolInputError(toolName, `${fieldName} must be a string.`);
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

  private parseTaskStatus(toolName: string, value: unknown): CoordTaskStatus {
    const status = this.parseRequiredString(toolName, 'status', value);

    if (!COORD_TASK_STATUSES.includes(status as CoordTaskStatus)) {
      throw new McpToolInputError(
        toolName,
        `status must be one of: ${COORD_TASK_STATUSES.join(', ')}.`,
      );
    }

    return status as CoordTaskStatus;
  }

  private parseTaskPriority(toolName: string, value: unknown): CoordTaskPriority {
    const priority = this.parseRequiredString(toolName, 'priority', value);

    if (!COORD_TASK_PRIORITIES.includes(priority as CoordTaskPriority)) {
      throw new McpToolInputError(
        toolName,
        `priority must be one of: ${COORD_TASK_PRIORITIES.join(', ')}.`,
      );
    }

    return priority as CoordTaskPriority;
  }

  private parseJsonObject(
    toolName: string,
    fieldName: string,
    value: unknown,
  ): CoordJsonObject {
    if (!isRecord(value)) {
      throw new McpToolInputError(toolName, `${fieldName} must be a JSON object.`);
    }

    return value;
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

  private async getExistingTask(
    repository: Repository<CoordTaskEntity>,
    toolName: string,
    id: string,
  ): Promise<CoordTaskEntity> {
    const task = await repository.findOneBy({ id });

    if (!task) {
      throw new McpToolOperationError(toolName, `Task "${id}" does not exist.`, {
        id,
      });
    }

    return task;
  }

  private assertTaskStatusTransition(
    toolName: string,
    currentStatus: CoordTaskStatus,
    nextStatus: CoordTaskStatus,
  ): void {
    const allowedStatuses = TASK_STATUS_TRANSITIONS[currentStatus];

    if (allowedStatuses.includes(nextStatus)) {
      return;
    }

    throw new McpToolOperationError(
      toolName,
      `Task status cannot transition from "${currentStatus}" to "${nextStatus}".`,
      {
        current_status: currentStatus,
        next_status: nextStatus,
        allowed_statuses: [...allowedStatuses],
      },
    );
  }

  private mergeTaskMetadata(
    existingMetadata: CoordJsonObject,
    patchMetadata: CoordJsonObject | undefined,
    previousOwner: string | null,
    nextOwner: string,
  ): CoordJsonObject {
    const mergedMetadata: CoordJsonObject = {
      ...existingMetadata,
      ...(patchMetadata ?? {}),
    };

    if (previousOwner === null || previousOwner === nextOwner) {
      return mergedMetadata;
    }

    const assignmentHistory = Array.isArray(existingMetadata.assignment_history)
      ? [...existingMetadata.assignment_history]
      : [];

    assignmentHistory.push({
      previous_owner: previousOwner,
      owner: nextOwner,
      assigned_at: new Date().toISOString(),
    });

    return {
      ...mergedMetadata,
      previous_owner: previousOwner,
      assignment_history: assignmentHistory,
    };
  }

  private async notifyTaskWrite(
    manager: EntityManager,
    action: 'created' | 'updated' | 'assigned',
    task: CoordTaskEntity,
    previousOwner?: string | null,
  ): Promise<void> {
    await this.realtime.notify(
      COORD_TASKS_NOTIFY_CHANNEL,
      {
        entity: 'task',
        action,
        ...(previousOwner === undefined ? {} : { previous_owner: previousOwner }),
        task: this.serializeTask(task),
        timestamp: new Date().toISOString(),
      },
      manager,
    );
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

  private toJsonColumnValue(
    value: CoordJsonObject,
  ): QueryDeepPartialEntity<CoordJsonObject> {
    return value as QueryDeepPartialEntity<CoordJsonObject>;
  }

  private createTaskId(): string {
    return `task:${randomUUID()}`;
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
