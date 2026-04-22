import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { RunnerConfig } from './config';

const execFileAsync = promisify(execFile);
const DEFAULT_BASE_BRANCH = 'main';

type FetchLike = typeof fetch;

interface GitHubRefResponse {
  object: {
    sha: string;
  };
}

interface GitHubPullRequestResponse {
  number: number;
  html_url: string;
}

interface GitHubApiErrorBody {
  message?: string;
}

export interface PullRequestResult {
  branch: string;
  number: number;
  url: string;
}

export interface GitManagerOptions {
  apiBaseUrl?: string;
  defaultBaseBranch?: string;
  fetchImpl?: FetchLike;
  runGit?: (args: string[], cwd: string) => Promise<string>;
  worktreePath?: string;
}

/**
 * Manages per-task GitHub branches and pull requests for the runner.
 *
 * Branches are always isolated as task/{taskId}; reusing an existing branch
 * is treated as an error to avoid corrupting task history.
 */
export class GitManager {
  private readonly apiBaseUrl: string;
  private readonly defaultBaseBranch: string;
  private readonly fetchImpl: FetchLike;
  private readonly owner: string;
  private readonly repo: string;
  private readonly runGit: (args: string[], cwd: string) => Promise<string>;
  private readonly worktreePath: string;

  constructor(
    private readonly config: Pick<RunnerConfig, 'githubRepo' | 'githubToken'>,
    options: GitManagerOptions = {},
  ) {
    const { owner, repo } = parseRepoSlug(config.githubRepo);

    this.owner = owner;
    this.repo = repo;
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
    this.defaultBaseBranch =
      options.defaultBaseBranch ?? DEFAULT_BASE_BRANCH;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.worktreePath = options.worktreePath ?? process.cwd();
    this.runGit = options.runGit ?? defaultRunGit;
  }

  static branchName(taskId: string): string {
    const normalizedTaskId = taskId.trim();

    if (!normalizedTaskId) {
      throw new Error('[runner] taskId is required to create a task branch.');
    }

    if (normalizedTaskId.startsWith('task/')) {
      throw new Error(
        `[runner] createBranch() expects a raw task id, got branch-like value: ${taskId}`,
      );
    }

    if (/\s/.test(normalizedTaskId)) {
      throw new Error(
        `[runner] taskId must not contain whitespace, got: ${taskId}`,
      );
    }

    return `task/${normalizedTaskId}`;
  }

  async createBranch(
    taskId: string,
    base: string = this.defaultBaseBranch,
  ): Promise<string> {
    const branch = GitManager.branchName(taskId);
    const baseSha = await this.getBranchSha(base);

    try {
      await this.request<void>('POST', '/git/refs', {
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      });
    } catch (error: unknown) {
      if (isGithubApiError(error, 422)) {
        throw new Error(
          `[runner] Refusing to reuse existing remote branch ${branch}. ` +
            'Each task must have its own isolated branch.',
        );
      }

      throw error;
    }

    return branch;
  }

  async push(branch: string): Promise<string> {
    const normalizedBranch = this.normalizeBranch(branch);
    const sha = await this.resolveLocalBranchSha(normalizedBranch);

    try {
      await this.request<void>('POST', '/git/refs', {
        ref: `refs/heads/${normalizedBranch}`,
        sha,
      });
    } catch (error: unknown) {
      if (!isGithubApiError(error, 422)) {
        throw error;
      }

      await this.request<void>(
        'PATCH',
        `/git/refs/heads/${encodeRefPath(normalizedBranch)}`,
        {
          force: false,
          sha,
        },
      );
    }

    return sha;
  }

  async openPR(
    branch: string,
    title: string,
    body: string,
  ): Promise<PullRequestResult> {
    const normalizedBranch = this.normalizeBranch(branch);
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      throw new Error('[runner] PR title is required.');
    }

    try {
      const pr = await this.request<GitHubPullRequestResponse>('POST', '/pulls', {
        base: this.defaultBaseBranch,
        body,
        head: normalizedBranch,
        title: normalizedTitle,
      });

      return {
        branch: normalizedBranch,
        number: pr.number,
        url: pr.html_url,
      };
    } catch (error: unknown) {
      if (!isGithubApiError(error, 422, 'pull request already exists')) {
        throw error;
      }

      const existingPr = await this.findOpenPullRequest(normalizedBranch);
      if (!existingPr) {
        throw error;
      }

      return {
        branch: normalizedBranch,
        number: existingPr.number,
        url: existingPr.html_url,
      };
    }
  }

  private async findOpenPullRequest(
    branch: string,
  ): Promise<GitHubPullRequestResponse | null> {
    const query = new URLSearchParams({
      base: this.defaultBaseBranch,
      head: `${this.owner}:${branch}`,
      state: 'open',
    });

    const pulls = await this.request<GitHubPullRequestResponse[]>(
      'GET',
      `/pulls?${query.toString()}`,
    );

    return pulls[0] ?? null;
  }

  private async getBranchSha(branch: string): Promise<string> {
    const ref = await this.request<GitHubRefResponse>(
      'GET',
      `/git/ref/heads/${encodeRefPath(branch)}`,
    );

    return ref.object.sha;
  }

  private normalizeBranch(branch: string): string {
    const normalizedBranch = branch.trim();

    if (!normalizedBranch) {
      throw new Error('[runner] Branch name is required.');
    }

    if (!normalizedBranch.startsWith('task/')) {
      throw new Error(
        `[runner] Runner branches must use the task/{taskId} format, got: ${branch}`,
      );
    }

    return normalizedBranch;
  }

  private async resolveLocalBranchSha(branch: string): Promise<string> {
    const sha = await this.runGit(
      ['rev-parse', `${branch}^{commit}`],
      this.worktreePath,
    );

    return sha.trim();
  }

  private async request<TResponse>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const response = await this.fetchImpl(
      `${this.apiBaseUrl}/repos/${this.owner}/${this.repo}${path}`,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.config.githubToken}`,
          'Content-Type': 'application/json',
          'User-Agent': '@mcp-coord/runner',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        method,
      },
    );

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({}))) as GitHubApiErrorBody;

      throw new GitHubApiError(
        method,
        path,
        response.status,
        errorBody.message ?? response.statusText,
      );
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }
}

class GitHubApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly path: string,
    public readonly status: number,
    message: string,
  ) {
    super(`[runner] GitHub API ${method} ${path} failed (${status}): ${message}`);
    this.name = 'GitHubApiError';
  }
}

function parseRepoSlug(repoSlug: string): { owner: string; repo: string } {
  const normalizedRepoSlug = repoSlug.trim();
  const [owner, repo, ...rest] = normalizedRepoSlug.split('/');

  if (!owner || !repo || rest.length > 0) {
    throw new Error(
      `[runner] GITHUB_REPO must use the "owner/repo" format, got: ${repoSlug}`,
    );
  }

  return { owner, repo };
}

function encodeRefPath(ref: string): string {
  return ref
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function defaultRunGit(args: string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', ['--no-pager', ...args], {
    cwd,
    encoding: 'utf8',
  });
  return result.stdout;
}

function isGithubApiError(
  error: unknown,
  status: number,
  messageIncludes?: string,
): error is GitHubApiError {
  if (!(error instanceof GitHubApiError)) {
    return false;
  }

  if (error.status !== status) {
    return false;
  }

  return messageIncludes === undefined
    ? true
    : error.message.toLowerCase().includes(messageIncludes.toLowerCase());
}
