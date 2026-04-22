import assert from 'node:assert/strict';
import test from 'node:test';

import type { V1Job } from '@kubernetes/client-node';

import type { RunnerConfig } from '../src/config';
import { createDriverRegistry } from '../src/driver-registry';
import type { PullRequestResult } from '../src/git-manager';
import { claudeDriver } from '../src/drivers/claude';
import type { SendMessageInput, UpdateTaskInput } from '../src/mcp-coord-client';
import { RunnerService } from '../src/runner-service';
import type { CoordAgent, JobWatchResult, Task } from '../src/types';

test('RunnerService moves a pending runner task into review with PR metadata', async () => {
  const pendingTask: Task = {
    id: 'ar-013-task',
    title: 'Add runner lifecycle integration coverage',
    description: 'Exercise the mocked runner lifecycle end-to-end.',
    status: 'pending',
    owner: 'runner',
    planId: 'plan-agent-runner-build',
  };
  const runnerAgent: CoordAgent = {
    name: 'runner',
    enabled: true,
    driver: 'claude',
  };
  const config: RunnerConfig = {
    mcordUrl: 'https://coord.example.test/mcp',
    mcordKey: 'coord-key',
    githubToken: 'github-token',
    githubRepo: 'axiom/mcp-coord',
    defaultDriver: 'claude',
    pollIntervalMs: 10,
    jobTtlSeconds: 3600,
    namespace: 'coord',
  };
  const updates: Array<{ taskId: string; input: UpdateTaskInput }> = [];
  const messages: SendMessageInput[] = [];
  const pullRequests: Array<{ branch: string; title: string; body: string }> = [];
  let submittedJob: V1Job | undefined;
  let resolveReview: (() => void) | undefined;
  const reviewReached = new Promise<void>((resolve) => {
    resolveReview = resolve;
  });

  const coord = {
    async listTasks(filters: { status?: string }) {
      assert.deepEqual(filters, { status: 'pending' });
      return [pendingTask];
    },
    async getAgent(name: string) {
      assert.equal(name, 'runner');
      return runnerAgent;
    },
    async updateTask(taskId: string, input: UpdateTaskInput) {
      updates.push({ taskId, input });
      if (input.status === 'review') {
        resolveReview?.();
      }
    },
    async sendMessage(input: SendMessageInput) {
      messages.push(input);
    },
  };
  const git = {
    async createBranch(taskId: string) {
      assert.equal(taskId, pendingTask.id);
      return `task/${taskId}`;
    },
    async push(branch: string) {
      assert.equal(branch, `task/${pendingTask.id}`);
      return 'abc123def456';
    },
    async openPR(branch: string, title: string, body: string): Promise<PullRequestResult> {
      pullRequests.push({ branch, title, body });
      return {
        branch,
        number: 17,
        url: 'https://github.com/axiom/mcp-coord/pull/17',
      };
    },
  };
  const jobs = {
    async submitJob(job: V1Job) {
      submittedJob = job;
      return job;
    },
    async watchJob(name: string, options?: { logTailLines?: number }): Promise<JobWatchResult> {
      assert.equal(name, 'agent-ar-013-task');
      assert.equal(options?.logTailLines, 500);

      return {
        jobName: name,
        namespace: 'coord',
        final: {
          jobName: name,
          namespace: 'coord',
          phase: 'succeeded',
          terminal: true,
          observedAt: '2025-01-01T00:00:00.000Z',
          status: {
            active: 0,
            failed: 0,
            ready: 0,
            succeeded: 1,
            completionTime: '2025-01-01T00:00:00.000Z',
            conditions: [],
          },
          pods: [],
        },
        logs: [
          {
            podName: 'agent-ar-013-task-pod',
            containerName: 'claude',
            containerType: 'main',
            previous: false,
            content: [
              'Summary: Added focused runner lifecycle coverage',
              'Changed files:',
              '- packages/runner/package.json',
              '- packages/runner/test/runner-service.integration.test.ts',
              '- packages/runner/tsconfig.test.json',
            ].join('\n'),
          },
        ],
      };
    },
  };
  const runner = new RunnerService(config, {
    coord: coord as never,
    drivers: createDriverRegistry([claudeDriver]),
    git: git as never,
    jobs: jobs as never,
  });

  await runner.pollOnce();
  await waitFor(reviewReached);

  assert.equal(submittedJob?.metadata?.name, 'agent-ar-013-task');
  assert.equal(
    submittedJob?.metadata?.annotations?.['mcp-coord/branch'],
    `task/${pendingTask.id}`,
  );
  assert.equal(submittedJob?.spec?.template.spec?.containers?.[0]?.name, 'claude');

  assert.deepEqual(
    updates.map((entry) => entry.input.status),
    ['in_progress', 'review'],
  );
  assert.ok(
    updates.every((entry) => entry.taskId === pendingTask.id),
    'all task updates should target the pending task',
  );

  const inProgressMetadata = asRecord(updates[0]?.input.metadata);
  assert.deepEqual(inProgressMetadata, {
    branch: `task/${pendingTask.id}`,
    driver: 'claude',
    job_name: 'agent-ar-013-task',
    runner: 'runner',
  });

  const reviewMetadata = asRecord(updates[1]?.input.metadata);
  assert.equal(reviewMetadata['branch'], `task/${pendingTask.id}`);
  assert.equal(reviewMetadata['commit_sha'], 'abc123def456');
  assert.equal(reviewMetadata['driver'], 'claude');
  assert.equal(reviewMetadata['job_name'], 'agent-ar-013-task');
  assert.equal(reviewMetadata['job_phase'], 'succeeded');
  assert.equal(reviewMetadata['pr_number'], 17);
  assert.equal(reviewMetadata['pr_url'], 'https://github.com/axiom/mcp-coord/pull/17');
  assert.match(
    String(reviewMetadata['summary']),
    /Added focused runner lifecycle coverage/,
  );
  assert.match(
    String(reviewMetadata['summary']),
    /packages\/runner\/package\.json/,
  );

  assert.deepEqual(messages, []);
  assert.equal(pullRequests.length, 1);
  assert.deepEqual(pullRequests[0], {
    branch: `task/${pendingTask.id}`,
    title: `[${pendingTask.id}] ${pendingTask.title}`,
    body: [
      `Task: ${pendingTask.id}`,
      'Owner: runner',
      'Driver: claude',
      `Branch: task/${pendingTask.id}`,
      'Job: agent-ar-013-task',
      'Commit: abc123def456',
      '',
      pendingTask.description,
      '',
      'Summary: Added focused runner lifecycle coverage Changed files: packages/runner/package.json.',
    ].join('\n'),
  });
});

async function waitFor<T>(promise: Promise<T>, timeoutMs: number = 2_000): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Timed out waiting after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}
