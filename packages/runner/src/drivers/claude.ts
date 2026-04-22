import type { V1Container, V1EnvVar, V1Job, V1Volume, V1VolumeMount } from '@kubernetes/client-node';

import type { AgentDriver, AgentResult, DriverOptions, Task } from '../types';

const CLAUDE_IMAGE = 'node:20-alpine';
const CLAUDE_NPM_PACKAGE = '@anthropic-ai/claude-code';
const DEFAULT_IMAGE_PULL_POLICY = 'IfNotPresent';
const DEFAULT_SECRET_NAME_SUFFIX = '-secret';
const PROJECT_VOLUME_NAME = 'agent-workdir';
const PROJECT_VOLUME_MOUNT_PATH = '/workspace/project';
const BASE_BRANCH = 'main';

export class ClaudeDriver implements AgentDriver {
  readonly name = 'claude' as const;

  buildJobSpec(task: Task, branch: string, options: DriverOptions): V1Job {
    const imagePullPolicy = options.imagePullPolicy ?? DEFAULT_IMAGE_PULL_POLICY;
    const secretName = `${options.namespace}${DEFAULT_SECRET_NAME_SUFFIX}`;
    const jobName = buildJobName(task.id);

    return {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        labels: {
          'app.kubernetes.io/component': 'runner-job',
          'app.kubernetes.io/name': 'mcp-coord-runner',
          'mcp-coord/driver': this.name,
          'mcp-coord/task-id': sanitizeLabelValue(task.id),
        },
        annotations: {
          'mcp-coord/branch': branch,
          'mcp-coord/owner': task.owner,
        },
      },
      spec: {
        backoffLimit: 0,
        ttlSecondsAfterFinished: options.ttlSeconds,
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/component': 'runner-job',
              'app.kubernetes.io/name': 'mcp-coord-runner',
              'mcp-coord/driver': this.name,
              'mcp-coord/task-id': sanitizeLabelValue(task.id),
            },
          },
          spec: {
            restartPolicy: 'Never',
            volumes: [buildProjectVolume()],
            initContainers: [
              buildInitContainer(task, branch, imagePullPolicy),
            ],
            containers: [
              buildMainContainer(task, branch, imagePullPolicy, secretName),
            ],
          },
        },
      },
    };
  }

  parseOutput(logs: string): AgentResult {
    const output = stripAnsi(logs).trim();
    if (!output) {
      return {
        success: false,
        error: 'Claude job produced no output.',
      };
    }

    const explicitError = matchSingleLine(output, /^ERROR:\s*(.+)$/m);
    if (explicitError) {
      return {
        success: false,
        error: explicitError,
      };
    }

    const summary = extractSummary(output);
    const changedFiles = extractChangedFiles(output);

    if (!summary && changedFiles.length === 0 && looksLikeRuntimeFailure(output)) {
      return {
        success: false,
        error: extractFailureReason(output),
      };
    }

    return {
      success: true,
      summary: buildSummary(summary, changedFiles),
    };
  }
}

export const claudeDriver = new ClaudeDriver();

function buildProjectVolume(): V1Volume {
  return {
    name: PROJECT_VOLUME_NAME,
    persistentVolumeClaim: {
      claimName: PROJECT_VOLUME_NAME,
    },
  };
}

function buildInitContainer(
  task: Task,
  branch: string,
  imagePullPolicy: NonNullable<V1Container['imagePullPolicy']>,
): V1Container {
  return {
    name: 'prepare-worktree',
    image: CLAUDE_IMAGE,
    imagePullPolicy,
    command: [
      'sh',
      '-lc',
      [
        'set -eu',
        'apk add --no-cache git >/dev/null',
        `cd ${shellQuote(PROJECT_VOLUME_MOUNT_PATH)}`,
        'if [ ! -d .git ]; then',
        `  echo ${shellQuote(`Expected shared git repository at ${PROJECT_VOLUME_MOUNT_PATH}`)}`,
        '  exit 1',
        'fi',
        `git fetch origin ${shellQuote(BASE_BRANCH)} ${shellQuote(branch)}`,
        `git checkout -B ${shellQuote(branch)} ${shellQuote(`origin/${branch}`)}`,
        `git reset --hard ${shellQuote(`origin/${branch}`)}`,
        'git clean -fd',
      ].join('\n'),
    ],
    env: buildGitIdentityEnv(task, branch),
    volumeMounts: [buildProjectVolumeMount()],
  };
}

function buildMainContainer(
  task: Task,
  branch: string,
  imagePullPolicy: NonNullable<V1Container['imagePullPolicy']>,
  secretName: string,
): V1Container {
  return {
    name: 'claude',
    image: CLAUDE_IMAGE,
    imagePullPolicy,
    workingDir: PROJECT_VOLUME_MOUNT_PATH,
    command: [
      'sh',
      '-lc',
      [
        'set -eu',
        'apk add --no-cache git >/dev/null',
        `npm install -g ${shellQuote(CLAUDE_NPM_PACKAGE)} >/dev/null`,
        `cd ${shellQuote(PROJECT_VOLUME_MOUNT_PATH)}`,
        'git config user.name "$GIT_AUTHOR_NAME"',
        'git config user.email "$GIT_AUTHOR_EMAIL"',
        'claude --print "$TASK_PROMPT"',
        'if [ -n "$(git status --porcelain)" ]; then',
        '  git add -A',
        '  git commit -m "$TASK_COMMIT_MESSAGE"',
        'fi',
      ].join('\n'),
    ],
    env: [
      ...buildGitIdentityEnv(task, branch),
      {
        name: 'ANTHROPIC_API_KEY',
        valueFrom: {
          secretKeyRef: {
            name: secretName,
            key: 'ANTHROPIC_API_KEY',
          },
        },
      },
      {
        name: 'TASK_PROMPT',
        value: buildTaskPrompt(task, branch),
      },
      {
        name: 'TASK_COMMIT_MESSAGE',
        value: buildCommitMessage(task),
      },
      {
        name: 'CI',
        value: '1',
      },
    ],
    volumeMounts: [buildProjectVolumeMount()],
  };
}

function buildProjectVolumeMount(): V1VolumeMount {
  return {
    name: PROJECT_VOLUME_NAME,
    mountPath: PROJECT_VOLUME_MOUNT_PATH,
  };
}

function buildGitIdentityEnv(task: Task, branch: string): V1EnvVar[] {
  return [
    {
      name: 'TASK_ID',
      value: task.id,
    },
    {
      name: 'TASK_BRANCH',
      value: branch,
    },
    {
      name: 'GIT_AUTHOR_NAME',
      value: 'mcp-coord-runner',
    },
    {
      name: 'GIT_AUTHOR_EMAIL',
      value: 'runner@mcp-coord.local',
    },
  ];
}

function buildTaskPrompt(task: Task, branch: string): string {
  return [
    `Task ID: ${task.id}`,
    `Title: ${task.title}`,
    `Owner: ${task.owner}`,
    `Branch: ${branch}`,
    '',
    'Task description:',
    task.description.trim(),
    '',
    'You are running non-interactively inside the project workdir on the task branch above.',
    'Make only the changes required for this task.',
    'Do not ask follow-up questions.',
    'When you finish, print exactly:',
    '- one line starting with "Summary: "',
    '- a "Changed files:" section with one bullet path per changed file',
    'If you cannot complete the task, print one line starting with "ERROR: " and exit non-zero.',
  ].join('\n');
}

function buildCommitMessage(task: Task): string {
  return `${task.id}: ${task.title}`.slice(0, 72);
}

function buildJobName(taskId: string): string {
  const sanitizedTaskId = taskId
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `agent-${sanitizedTaskId || 'task'}`;
}

function sanitizeLabelValue(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized.slice(0, 63) || 'unknown';
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripAnsi(value: string): string {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    '',
  );
}

function matchSingleLine(value: string, pattern: RegExp): string | undefined {
  const match = value.match(pattern);
  const line = match?.[1]?.trim();
  return line || undefined;
}

function extractSummary(output: string): string | undefined {
  const explicitSummary = matchSingleLine(output, /^Summary:\s*(.+)$/m);
  if (explicitSummary) {
    return explicitSummary;
  }

  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (
      !line ||
      /^changed files:/i.test(line) ||
      /^[-*]\s/.test(line) ||
      /^(npm|added|up to date|audited)\b/i.test(line)
    ) {
      continue;
    }

    return line;
  }

  return undefined;
}

function extractChangedFiles(output: string): string[] {
  const sectionMatch = output.match(
    /^Changed files:\s*([\s\S]*?)(?:\n[A-Z][A-Za-z ]+:\s|\n\n|$)/m,
  );
  const section = sectionMatch?.[1];
  const files =
    section
      ?.split('\n')
      .map((line) => line.trim())
      .map((line) => line.replace(/^[-*]\s*/, ''))
      .filter((line) => Boolean(line) && looksLikeFilePath(line)) ?? [];

  if (files.length > 0) {
    return unique(files);
  }

  const fallbackMatches = output.match(/[A-Za-z0-9._/-]+\.[A-Za-z0-9]+/g) ?? [];
  return unique(fallbackMatches.filter(looksLikeFilePath));
}

function looksLikeRuntimeFailure(output: string): boolean {
  return [
    /npm ERR!/i,
    /sh:\s+claude:\s+not found/i,
    /anthropic_api_key/i,
    /invalid api key/i,
    /^fatal:/im,
    /^error:/im,
  ].some((pattern) => pattern.test(output));
}

function extractFailureReason(output: string): string {
  const matchedLine = output
    .split('\n')
    .map((line) => line.trim())
    .find((line) =>
      [/npm ERR!/i, /^fatal:/i, /^error:/i, /invalid api key/i, /anthropic_api_key/i].some(
        (pattern) => pattern.test(line),
      ),
    );

  return matchedLine || 'Claude job failed without a structured error message.';
}

function buildSummary(summary: string | undefined, changedFiles: string[]): string | undefined {
  const normalizedSummary = summary?.trim();
  if (changedFiles.length === 0) {
    return normalizedSummary;
  }

  const changedFilesSummary =
    changedFiles.length <= 5
      ? changedFiles.join(', ')
      : `${changedFiles.slice(0, 5).join(', ')} (+${changedFiles.length - 5} more)`;

  return normalizedSummary
    ? `${normalizedSummary} Changed files: ${changedFilesSummary}.`
    : `Changed files: ${changedFilesSummary}.`;
}

function looksLikeFilePath(value: string): boolean {
  return (
    !value.startsWith('http://') &&
    !value.startsWith('https://') &&
    !value.startsWith('@') &&
    value.includes('/') &&
    !value.endsWith(':')
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
