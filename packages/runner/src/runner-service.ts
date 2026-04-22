import type { RunnerConfig } from './config';
import type { DriverRegistry } from './driver-registry';
import { GitManager } from './git-manager';
import { JobSpawner } from './job-spawner';
import { McpCoordClient } from './mcp-coord-client';
import type { Task } from './types';

export class RunnerService {
  private readonly activeTaskIds = new Set<string>();

  constructor(
    private readonly config: RunnerConfig,
    private readonly deps: {
      coord: McpCoordClient;
      drivers: DriverRegistry;
      git: GitManager;
      jobs: JobSpawner;
    },
  ) {}

  async register(): Promise<void> {
    await this.deps.coord.registerAgent({
      name: 'runner',
      status: 'running',
      capabilities: {
        drivers: this.deps.drivers.listNames(),
        task_types: ['task-execution', 'job-orchestration'],
      },
      metadata: {
        component: '@mcp-coord/runner',
        namespace: this.config.namespace,
      },
    });
  }

  async pollOnce(): Promise<void> {
    const pendingTasks = await this.deps.coord.listTasks({ status: 'pending' });

    for (const task of pendingTasks) {
      if (this.activeTaskIds.has(task.id)) {
        continue;
      }

      this.activeTaskIds.add(task.id);
      void this.processTask(task).finally(() => {
        this.activeTaskIds.delete(task.id);
      });
    }
  }

  async runForever(): Promise<never> {
    console.log(
      `[runner] polling loop started — interval=${this.config.pollIntervalMs}ms ` +
        `namespace=${this.config.namespace} defaultDriver=${this.config.defaultDriver} ` +
        `registeredDrivers=${this.deps.drivers.listNames().join(',') || 'none'}`,
    );

    while (true) {
      try {
        await this.pollOnce();
      } catch (error) {
        console.error('[runner] polling tick failed', error);
      }

      await sleep(this.config.pollIntervalMs);
    }
  }

  private async processTask(task: Task): Promise<void> {
    const taskContext = `[runner] task=${task.id} owner=${task.owner}`;

    try {
      const agent = await this.deps.coord.getAgent(task.owner);
      if (!agent.enabled) {
        console.log(`${taskContext} skipped because agent is disabled.`);
        return;
      }

      const selectedDriverName = agent.driver ?? this.config.defaultDriver;
      const driver = this.deps.drivers.get(selectedDriverName);
      const branch = await this.deps.git.createBranch(task.id);
      const job = driver.buildJobSpec(task, branch, {
        namespace: this.config.namespace,
        ttlSeconds: this.config.jobTtlSeconds,
      });
      const submittedJob = await this.deps.jobs.submitJob(job);
      const jobName = submittedJob.metadata?.name ?? job.metadata?.name;

      if (!jobName) {
        throw new Error('[runner] Submitted Job is missing metadata.name.');
      }

      await this.deps.coord.updateTask(task.id, {
        status: 'in_progress',
        metadata: {
          branch,
          driver: driver.name,
          job_name: jobName,
          runner: 'runner',
        },
      });

      const watchResult = await this.deps.jobs.watchJob(jobName, {
        logTailLines: 500,
      });
      const combinedLogs = combineLogs(watchResult.logs);
      const parsedResult = driver.parseOutput(combinedLogs);

      if (watchResult.final.phase !== 'succeeded' || !parsedResult.success) {
        const failureSummary = buildFailureSummary(
          task,
          driver.name,
          branch,
          jobName,
          watchResult.final.phase,
          parsedResult.error,
          combinedLogs,
        );
        await this.blockTask(task, failureSummary, {
          branch,
          driver: driver.name,
          error: failureSummary,
          job_name: jobName,
          job_phase: watchResult.final.phase,
          summary: parsedResult.summary,
        });
        return;
      }

      const commitSha = await this.deps.git.push(branch);
      const pullRequest = await this.deps.git.openPR(
        branch,
        `[${task.id}] ${task.title}`,
        buildPullRequestBody(task, driver.name, branch, jobName, commitSha, parsedResult.summary),
      );

      await this.deps.coord.updateTask(task.id, {
        status: 'review',
        metadata: {
          branch,
          commit_sha: commitSha,
          driver: driver.name,
          job_name: jobName,
          job_phase: watchResult.final.phase,
          pr_number: pullRequest.number,
          pr_url: pullRequest.url,
          summary: parsedResult.summary,
        },
      });

      console.log(
        `${taskContext} moved to review via ${pullRequest.url} using ${driver.name}.`,
      );
    } catch (error) {
      const failureSummary = `[runner] Failed to orchestrate task ${task.id}: ${formatError(error)}`;
      console.error(failureSummary, error);
      await this.blockTask(task, failureSummary, {
        error: failureSummary,
      });
    }
  }

  private async blockTask(
    task: Task,
    errorBody: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.deps.coord.updateTask(task.id, {
        status: 'blocked',
        metadata,
      });
    } catch (updateError) {
      console.error(
        `[runner] Failed to mark task ${task.id} blocked: ${formatError(updateError)}`,
        updateError,
      );
    }

    try {
      await this.deps.coord.sendMessage({
        to: 'orch',
        type: 'blocker',
        body: errorBody,
        taskId: task.id,
        planId: task.planId,
      });
    } catch (messageError) {
      console.error(
        `[runner] Failed to send orch blocker for task ${task.id}: ${formatError(messageError)}`,
        messageError,
      );
    }
  }
}

function buildPullRequestBody(
  task: Task,
  driverName: string,
  branch: string,
  jobName: string,
  commitSha: string,
  summary?: string,
): string {
  return [
    `Task: ${task.id}`,
    `Owner: ${task.owner}`,
    `Driver: ${driverName}`,
    `Branch: ${branch}`,
    `Job: ${jobName}`,
    `Commit: ${commitSha}`,
    '',
    task.description.trim(),
    ...(summary ? ['', `Summary: ${summary}`] : []),
  ].join('\n');
}

function buildFailureSummary(
  task: Task,
  driverName: string,
  branch: string,
  jobName: string,
  phase: string,
  parsedError: string | undefined,
  logs: string,
): string {
  const excerpt = logs.trim().slice(-4_000);

  return [
    `Task ${task.id} failed.`,
    `Owner: ${task.owner}`,
    `Driver: ${driverName}`,
    `Branch: ${branch}`,
    `Job: ${jobName}`,
    `Phase: ${phase}`,
    ...(parsedError ? [`Error: ${parsedError}`] : []),
    '',
    'Job logs:',
    excerpt || '(no logs captured)',
  ].join('\n');
}

function combineLogs(
  logs: Array<{
    podName: string;
    containerName: string;
    containerType: 'init' | 'main';
    previous: boolean;
    content: string;
    error?: string;
  }>,
): string {
  return logs
    .map((entry) =>
      [
        `--- pod=${entry.podName} container=${entry.containerName} type=${entry.containerType} previous=${entry.previous} ---`,
        entry.error ? `[runner] log read error: ${entry.error}` : entry.content,
      ].join('\n'),
    )
    .join('\n\n');
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
