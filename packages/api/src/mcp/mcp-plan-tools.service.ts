import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { CoordPlanEntity, CoordTaskEntity } from '../database/entities';
import {
  COORD_PLAN_STATUSES,
  CoordPlanStatus,
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

const COORD_PLANS_NOTIFY_CHANNEL = 'coord_plans';

const PLAN_STATUS_TRANSITIONS: Record<CoordPlanStatus, readonly CoordPlanStatus[]> = {
  draft: ['draft', 'active', 'paused', 'completed', 'cancelled'],
  active: ['active', 'paused', 'completed', 'cancelled'],
  paused: ['paused', 'active', 'completed', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
};

interface CreatePlanInput {
  id: string | null;
  name: string;
  description: string;
  status: CoordPlanStatus;
  owner: string;
}

interface UpdatePlanInput {
  id: string;
  hasName: boolean;
  name: string;
  hasDescription: boolean;
  description: string;
  hasStatus: boolean;
  status: CoordPlanStatus;
  hasOwner: boolean;
  owner: string;
}

interface ListPlansInput {
  hasStatus: boolean;
  status: CoordPlanStatus;
  hasOwner: boolean;
  owner: string;
}

interface PlanTaskCounts {
  total: number;
  pending: number;
  in_progress: number;
  review: number;
  done: number;
  blocked: number;
  cancelled: number;
  active: number;
}

interface PlanTaskCountRow {
  plan_id: string;
  total: number | string;
  pending: number | string;
  in_progress: number | string;
  review: number | string;
  done: number | string;
  blocked: number | string;
  cancelled: number | string;
  active: number | string;
}

@Injectable()
export class McpPlanToolsService {
  constructor(
    @InjectRepository(CoordPlanEntity)
    private readonly planRepository: Repository<CoordPlanEntity>,
    @InjectRepository(CoordTaskEntity)
    private readonly taskRepository: Repository<CoordTaskEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly realtime: CoordRealtimeService,
  ) {}

  async createPlan(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'create_plan';

    try {
      const input = this.parseCreatePlanInput(arguments_);
      const serializedPlan = await this.dataSource.transaction(async (manager) => {
        const planRepository = manager.getRepository(CoordPlanEntity);
        const id = input.id ?? this.createPlanId();
        const existingPlan = await planRepository.findOneBy({ id });

        if (existingPlan) {
          throw new McpToolOperationError(toolName, `Plan "${id}" already exists.`, {
            id,
          });
        }

        const plan = planRepository.create({
          id,
          name: input.name,
          description: input.description,
          status: input.status,
          owner: input.owner,
        });
        await planRepository.save(plan);

        const savedPlan = await this.getExistingPlan(planRepository, toolName, id);
        const taskCounts = await this.loadPlanTaskCounts([savedPlan.id], manager);
        const serialized = this.serializePlan(
          savedPlan,
          taskCounts.get(savedPlan.id) ?? this.createEmptyTaskCounts(),
        );

        await this.notifyPlanWrite(manager, 'created', serialized);

        return serialized;
      });

      return createToolSuccessResult(`Created plan "${serializedPlan.id}".`, {
        plan: serializedPlan,
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async updatePlan(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'update_plan';

    try {
      const input = this.parseUpdatePlanInput(arguments_);
      const serializedPlan = await this.dataSource.transaction(async (manager) => {
        const planRepository = manager.getRepository(CoordPlanEntity);
        const existingPlan = await this.getExistingPlan(planRepository, toolName, input.id);
        const updatePayload: QueryDeepPartialEntity<CoordPlanEntity> = {};

        if (input.hasName) {
          updatePayload.name = input.name;
        }

        if (input.hasDescription) {
          updatePayload.description = input.description;
        }

        if (input.hasStatus) {
          this.assertPlanStatusTransition(toolName, existingPlan.status, input.status);
          updatePayload.status = input.status;
        }

        if (input.hasOwner) {
          updatePayload.owner = input.owner;
        }

        await planRepository.update({ id: existingPlan.id }, updatePayload);

        const updatedPlan = await this.getExistingPlan(planRepository, toolName, existingPlan.id);
        const taskCounts = await this.loadPlanTaskCounts([updatedPlan.id], manager);
        const serialized = this.serializePlan(
          updatedPlan,
          taskCounts.get(updatedPlan.id) ?? this.createEmptyTaskCounts(),
        );

        await this.notifyPlanWrite(manager, 'updated', serialized);

        return serialized;
      });

      return createToolSuccessResult(`Updated plan "${serializedPlan.id}".`, {
        plan: serializedPlan,
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  async listPlans(arguments_: unknown): Promise<McpToolCallResult> {
    const toolName = 'list_plans';

    try {
      const filter = this.parseListPlansInput(arguments_);
      const where: FindOptionsWhere<CoordPlanEntity> = {};

      if (filter.hasStatus) {
        where.status = filter.status;
      }

      if (filter.hasOwner) {
        where.owner = filter.owner;
      }

      const plans = await this.planRepository.find({
        ...(Object.keys(where).length === 0 ? {} : { where }),
        order: {
          createdAt: 'ASC',
          id: 'ASC',
        },
      });
      const taskCounts = await this.loadPlanTaskCounts(plans.map((plan) => plan.id));
      const serializedPlans = plans.map((plan) =>
        this.serializePlan(plan, taskCounts.get(plan.id) ?? this.createEmptyTaskCounts()),
      );

      return createToolSuccessResult(`Found ${serializedPlans.length} plan records.`, {
        plans: serializedPlans,
        total: serializedPlans.length,
      });
    } catch (error) {
      return this.toToolErrorResult(toolName, error);
    }
  }

  private parseCreatePlanInput(arguments_: unknown): CreatePlanInput {
    const argumentsRecord = this.parseArgumentsObject('create_plan', arguments_, [
      'id',
      'name',
      'description',
      'status',
      'owner',
    ]);

    return {
      id: hasOwn(argumentsRecord, 'id')
        ? this.parseRequiredString('create_plan', 'id', argumentsRecord.id)
        : null,
      name: this.parseRequiredString('create_plan', 'name', argumentsRecord.name),
      description: hasOwn(argumentsRecord, 'description')
        ? this.parseString('create_plan', 'description', argumentsRecord.description)
        : '',
      status: hasOwn(argumentsRecord, 'status')
        ? this.parsePlanStatus('create_plan', argumentsRecord.status)
        : 'draft',
      owner: hasOwn(argumentsRecord, 'owner')
        ? this.parseRequiredString('create_plan', 'owner', argumentsRecord.owner)
        : 'orch',
    };
  }

  private parseUpdatePlanInput(arguments_: unknown): UpdatePlanInput {
    const argumentsRecord = this.parseArgumentsObject('update_plan', arguments_, [
      'id',
      'planId',
      'name',
      'description',
      'status',
      'owner',
    ]);
    const hasName = hasOwn(argumentsRecord, 'name');
    const hasDescription = hasOwn(argumentsRecord, 'description');
    const hasStatus = hasOwn(argumentsRecord, 'status');
    const hasOwner = hasOwn(argumentsRecord, 'owner');

    if (!hasName && !hasDescription && !hasStatus && !hasOwner) {
      throw new McpToolInputError(
        'update_plan',
        'update_plan requires at least one mutable field to update.',
      );
    }

    return {
      id: this.parseUpdatePlanId(argumentsRecord),
      hasName,
      name: hasName
        ? this.parseRequiredString('update_plan', 'name', argumentsRecord.name)
        : '',
      hasDescription,
      description: hasDescription
        ? this.parseString('update_plan', 'description', argumentsRecord.description)
        : '',
      hasStatus,
      status: hasStatus
        ? this.parsePlanStatus('update_plan', argumentsRecord.status)
        : 'draft',
      hasOwner,
      owner: hasOwner
        ? this.parseRequiredString('update_plan', 'owner', argumentsRecord.owner)
        : '',
    };
  }

  private parseUpdatePlanId(argumentsRecord: Record<string, unknown>): string {
    const hasId = hasOwn(argumentsRecord, 'id');
    const hasPlanId = hasOwn(argumentsRecord, 'planId');

    if (!hasId && !hasPlanId) {
      throw new McpToolInputError(
        'update_plan',
        'update_plan requires id (or planId).',
      );
    }

    const id = hasId
      ? this.parseRequiredString('update_plan', 'id', argumentsRecord.id)
      : null;
    const planId = hasPlanId
      ? this.parseRequiredString('update_plan', 'planId', argumentsRecord.planId)
      : null;

    if (id !== null && planId !== null && id !== planId) {
      throw new McpToolInputError(
        'update_plan',
        'update_plan id and planId must match when both are provided.',
      );
    }

    return id ?? planId!;
  }

  private parseListPlansInput(arguments_: unknown): ListPlansInput {
    const argumentsRecord = this.parseOptionalArgumentsObject('list_plans', arguments_, [
      'status',
      'owner',
    ]);
    const hasStatus = hasOwn(argumentsRecord, 'status');
    const hasOwner = hasOwn(argumentsRecord, 'owner');

    return {
      hasStatus,
      status: hasStatus
        ? this.parsePlanStatus('list_plans', argumentsRecord.status)
        : 'draft',
      hasOwner,
      owner: hasOwner
        ? this.parseRequiredString('list_plans', 'owner', argumentsRecord.owner)
        : '',
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

  private parsePlanStatus(toolName: string, value: unknown): CoordPlanStatus {
    const status = this.parseRequiredString(toolName, 'status', value);

    if (!COORD_PLAN_STATUSES.includes(status as CoordPlanStatus)) {
      throw new McpToolInputError(
        toolName,
        `status must be one of: ${COORD_PLAN_STATUSES.join(', ')}.`,
      );
    }

    return status as CoordPlanStatus;
  }

  private async getExistingPlan(
    repository: Repository<CoordPlanEntity>,
    toolName: string,
    id: string,
  ): Promise<CoordPlanEntity> {
    const plan = await repository.findOneBy({ id });

    if (!plan) {
      throw new McpToolOperationError(toolName, `Plan "${id}" does not exist.`, {
        id,
      });
    }

    return plan;
  }

  private assertPlanStatusTransition(
    toolName: string,
    currentStatus: CoordPlanStatus,
    nextStatus: CoordPlanStatus,
  ): void {
    const allowedStatuses = PLAN_STATUS_TRANSITIONS[currentStatus];

    if (allowedStatuses.includes(nextStatus)) {
      return;
    }

    throw new McpToolOperationError(
      toolName,
      `Plan status cannot transition from "${currentStatus}" to "${nextStatus}".`,
      {
        current_status: currentStatus,
        next_status: nextStatus,
        allowed_statuses: [...allowedStatuses],
      },
    );
  }

  private async loadPlanTaskCounts(
    planIds: readonly string[],
    manager?: EntityManager,
  ): Promise<Map<string, PlanTaskCounts>> {
    if (planIds.length === 0) {
      return new Map();
    }

    const repository = manager?.getRepository(CoordTaskEntity) ?? this.taskRepository;
    const rows = await repository
      .createQueryBuilder('task')
      .select('task.plan_id', 'plan_id')
      .addSelect('COUNT(task.id)::int', 'total')
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'pending' THEN 1 ELSE 0 END), 0)::int`,
        'pending',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'in_progress' THEN 1 ELSE 0 END), 0)::int`,
        'in_progress',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'review' THEN 1 ELSE 0 END), 0)::int`,
        'review',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'done' THEN 1 ELSE 0 END), 0)::int`,
        'done',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'blocked' THEN 1 ELSE 0 END), 0)::int`,
        'blocked',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status = 'cancelled' THEN 1 ELSE 0 END), 0)::int`,
        'cancelled',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN task.status IN ('pending', 'in_progress', 'review') THEN 1 ELSE 0 END), 0)::int`,
        'active',
      )
      .where('task.plan_id IN (:...planIds)', { planIds: [...planIds] })
      .groupBy('task.plan_id')
      .getRawMany<PlanTaskCountRow>();

    const countsByPlanId = new Map<string, PlanTaskCounts>();

    for (const row of rows) {
      countsByPlanId.set(row.plan_id, {
        total: this.parseCountValue(row.total),
        pending: this.parseCountValue(row.pending),
        in_progress: this.parseCountValue(row.in_progress),
        review: this.parseCountValue(row.review),
        done: this.parseCountValue(row.done),
        blocked: this.parseCountValue(row.blocked),
        cancelled: this.parseCountValue(row.cancelled),
        active: this.parseCountValue(row.active),
      });
    }

    return countsByPlanId;
  }

  private parseCountValue(value: number | string): number {
    const parsedValue =
      typeof value === 'number' ? value : Number.parseInt(value, 10);

    if (!Number.isFinite(parsedValue)) {
      throw new McpToolOperationError(
        'list_plans',
        'Task count aggregation returned an invalid numeric value.',
      );
    }

    return parsedValue;
  }

  private createEmptyTaskCounts(): PlanTaskCounts {
    return {
      total: 0,
      pending: 0,
      in_progress: 0,
      review: 0,
      done: 0,
      blocked: 0,
      cancelled: 0,
      active: 0,
    };
  }

  private serializePlan(
    plan: CoordPlanEntity,
    taskCounts: PlanTaskCounts,
  ): Record<string, unknown> {
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      status: plan.status,
      owner: plan.owner,
      task_count: taskCounts.total,
      task_counts: {
        total: taskCounts.total,
        pending: taskCounts.pending,
        in_progress: taskCounts.in_progress,
        review: taskCounts.review,
        done: taskCounts.done,
        blocked: taskCounts.blocked,
        cancelled: taskCounts.cancelled,
        active: taskCounts.active,
      },
      created_at: plan.createdAt.toISOString(),
      updated_at: plan.updatedAt.toISOString(),
    };
  }

  private async notifyPlanWrite(
    manager: EntityManager,
    action: 'created' | 'updated',
    plan: Record<string, unknown>,
  ): Promise<void> {
    await this.realtime.notify(
      COORD_PLANS_NOTIFY_CHANNEL,
      {
        entity: 'plan',
        action,
        plan,
        timestamp: new Date().toISOString(),
      },
      manager,
    );
  }

  private createPlanId(): string {
    return `plan:${randomUUID()}`;
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
