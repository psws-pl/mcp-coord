import { Injectable } from '@nestjs/common';

import { McpAgentToolsService } from './mcp-agent-tools.service';
import { McpMessageToolsService } from './mcp-message-tools.service';
import { McpPlanToolsService } from './mcp-plan-tools.service';
import { McpTaskToolsService } from './mcp-task-tools.service';
import { McpExecutionContext, McpToolCallResult } from './mcp.types';

@Injectable()
export class McpToolHandlersService {
  constructor(
    private readonly agentTools: McpAgentToolsService,
    private readonly messageTools: McpMessageToolsService,
    private readonly planTools: McpPlanToolsService,
    private readonly taskTools: McpTaskToolsService,
  ) {}

  registerAgent(arguments_: unknown): Promise<McpToolCallResult> {
    return this.agentTools.registerAgent(arguments_);
  }

  updateAgentStatus(arguments_: unknown): Promise<McpToolCallResult> {
    return this.agentTools.updateAgentStatus(arguments_);
  }

  configureAgent(arguments_: unknown): Promise<McpToolCallResult> {
    return this.agentTools.configureAgent(arguments_);
  }

  getAgent(arguments_: unknown): Promise<McpToolCallResult> {
    return this.agentTools.getAgent(arguments_);
  }

  listAgents(arguments_: unknown): Promise<McpToolCallResult> {
    return this.agentTools.listAgents(arguments_);
  }

  createTask(arguments_: unknown): Promise<McpToolCallResult> {
    return this.taskTools.createTask(arguments_);
  }

  updateTask(arguments_: unknown): Promise<McpToolCallResult> {
    return this.taskTools.updateTask(arguments_);
  }

  assignTask(arguments_: unknown): Promise<McpToolCallResult> {
    return this.taskTools.assignTask(arguments_);
  }

  listTasks(arguments_: unknown): Promise<McpToolCallResult> {
    return this.taskTools.listTasks(arguments_);
  }

  getTask(arguments_: unknown): Promise<McpToolCallResult> {
    return this.taskTools.getTask(arguments_);
  }

  sendMessage(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    return this.messageTools.sendMessage(arguments_, context);
  }

  getMessages(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    return this.messageTools.getMessages(arguments_, context);
  }

  ackMessage(
    arguments_: unknown,
    context?: McpExecutionContext,
  ): Promise<McpToolCallResult> {
    return this.messageTools.ackMessage(arguments_, context);
  }

  createPlan(arguments_: unknown): Promise<McpToolCallResult> {
    return this.planTools.createPlan(arguments_);
  }

  updatePlan(arguments_: unknown): Promise<McpToolCallResult> {
    return this.planTools.updatePlan(arguments_);
  }

  listPlans(arguments_: unknown): Promise<McpToolCallResult> {
    return this.planTools.listPlans(arguments_);
  }
}
