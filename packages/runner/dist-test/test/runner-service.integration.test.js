"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const driver_registry_1 = require("../src/driver-registry");
const claude_1 = require("../src/drivers/claude");
const runner_service_1 = require("../src/runner-service");
(0, node_test_1.default)('RunnerService moves a pending runner task into review with PR metadata', async () => {
    const pendingTask = {
        id: 'ar-013-task',
        title: 'Add runner lifecycle integration coverage',
        description: 'Exercise the mocked runner lifecycle end-to-end.',
        status: 'pending',
        owner: 'runner',
        planId: 'plan-agent-runner-build',
    };
    const runnerAgent = {
        name: 'runner',
        enabled: true,
        driver: 'claude',
    };
    const config = {
        mcordUrl: 'https://coord.example.test/mcp',
        mcordKey: 'coord-key',
        githubToken: 'github-token',
        githubRepo: 'axiom/mcp-coord',
        defaultDriver: 'claude',
        pollIntervalMs: 10,
        jobTtlSeconds: 3600,
        namespace: 'coord',
    };
    const updates = [];
    const messages = [];
    const pullRequests = [];
    let submittedJob;
    let resolveReview;
    const reviewReached = new Promise((resolve) => {
        resolveReview = resolve;
    });
    const coord = {
        async listTasks(filters) {
            strict_1.default.deepEqual(filters, { status: 'pending' });
            return [pendingTask];
        },
        async getAgent(name) {
            strict_1.default.equal(name, 'runner');
            return runnerAgent;
        },
        async updateTask(taskId, input) {
            updates.push({ taskId, input });
            if (input.status === 'review') {
                resolveReview?.();
            }
        },
        async sendMessage(input) {
            messages.push(input);
        },
    };
    const git = {
        async createBranch(taskId) {
            strict_1.default.equal(taskId, pendingTask.id);
            return `task/${taskId}`;
        },
        async push(branch) {
            strict_1.default.equal(branch, `task/${pendingTask.id}`);
            return 'abc123def456';
        },
        async openPR(branch, title, body) {
            pullRequests.push({ branch, title, body });
            return {
                branch,
                number: 17,
                url: 'https://github.com/axiom/mcp-coord/pull/17',
            };
        },
    };
    const jobs = {
        async submitJob(job) {
            submittedJob = job;
            return job;
        },
        async watchJob(name, options) {
            strict_1.default.equal(name, 'agent-ar-013-task');
            strict_1.default.equal(options?.logTailLines, 500);
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
    const runner = new runner_service_1.RunnerService(config, {
        coord: coord,
        drivers: (0, driver_registry_1.createDriverRegistry)([claude_1.claudeDriver]),
        git: git,
        jobs: jobs,
    });
    await runner.pollOnce();
    await waitFor(reviewReached);
    strict_1.default.equal(submittedJob?.metadata?.name, 'agent-ar-013-task');
    strict_1.default.equal(submittedJob?.metadata?.annotations?.['mcp-coord/branch'], `task/${pendingTask.id}`);
    strict_1.default.equal(submittedJob?.spec?.template.spec?.containers?.[0]?.name, 'claude');
    strict_1.default.deepEqual(updates.map((entry) => entry.input.status), ['in_progress', 'review']);
    strict_1.default.ok(updates.every((entry) => entry.taskId === pendingTask.id), 'all task updates should target the pending task');
    const inProgressMetadata = asRecord(updates[0]?.input.metadata);
    strict_1.default.deepEqual(inProgressMetadata, {
        branch: `task/${pendingTask.id}`,
        driver: 'claude',
        job_name: 'agent-ar-013-task',
        runner: 'runner',
    });
    const reviewMetadata = asRecord(updates[1]?.input.metadata);
    strict_1.default.equal(reviewMetadata['branch'], `task/${pendingTask.id}`);
    strict_1.default.equal(reviewMetadata['commit_sha'], 'abc123def456');
    strict_1.default.equal(reviewMetadata['driver'], 'claude');
    strict_1.default.equal(reviewMetadata['job_name'], 'agent-ar-013-task');
    strict_1.default.equal(reviewMetadata['job_phase'], 'succeeded');
    strict_1.default.equal(reviewMetadata['pr_number'], 17);
    strict_1.default.equal(reviewMetadata['pr_url'], 'https://github.com/axiom/mcp-coord/pull/17');
    strict_1.default.match(String(reviewMetadata['summary']), /Added focused runner lifecycle coverage/);
    strict_1.default.match(String(reviewMetadata['summary']), /packages\/runner\/package\.json/);
    strict_1.default.deepEqual(messages, []);
    strict_1.default.equal(pullRequests.length, 1);
    strict_1.default.deepEqual(pullRequests[0], {
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
async function waitFor(promise, timeoutMs = 2_000) {
    let timeoutHandle;
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`Timed out waiting after ${timeoutMs}ms`));
                }, timeoutMs);
            }),
        ]);
    }
    finally {
        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }
    }
}
function asRecord(value) {
    strict_1.default.ok(value && typeof value === 'object' && !Array.isArray(value));
    return value;
}
//# sourceMappingURL=runner-service.integration.test.js.map