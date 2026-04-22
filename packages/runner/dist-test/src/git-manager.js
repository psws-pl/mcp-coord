"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitManager = void 0;
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
const DEFAULT_BASE_BRANCH = 'main';
/**
 * Manages per-task GitHub branches and pull requests for the runner.
 *
 * Branches are always isolated as task/{taskId}; reusing an existing branch
 * is treated as an error to avoid corrupting task history.
 */
class GitManager {
    config;
    apiBaseUrl;
    defaultBaseBranch;
    fetchImpl;
    owner;
    repo;
    runGit;
    worktreePath;
    constructor(config, options = {}) {
        this.config = config;
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
    static branchName(taskId) {
        const normalizedTaskId = taskId.trim();
        if (!normalizedTaskId) {
            throw new Error('[runner] taskId is required to create a task branch.');
        }
        if (normalizedTaskId.startsWith('task/')) {
            throw new Error(`[runner] createBranch() expects a raw task id, got branch-like value: ${taskId}`);
        }
        if (/\s/.test(normalizedTaskId)) {
            throw new Error(`[runner] taskId must not contain whitespace, got: ${taskId}`);
        }
        return `task/${normalizedTaskId}`;
    }
    async createBranch(taskId, base = this.defaultBaseBranch) {
        const branch = GitManager.branchName(taskId);
        const baseSha = await this.getBranchSha(base);
        try {
            await this.request('POST', '/git/refs', {
                ref: `refs/heads/${branch}`,
                sha: baseSha,
            });
        }
        catch (error) {
            if (isGithubApiError(error, 422)) {
                throw new Error(`[runner] Refusing to reuse existing remote branch ${branch}. ` +
                    'Each task must have its own isolated branch.');
            }
            throw error;
        }
        return branch;
    }
    async push(branch) {
        const normalizedBranch = this.normalizeBranch(branch);
        const sha = await this.resolveLocalBranchSha(normalizedBranch);
        try {
            await this.request('POST', '/git/refs', {
                ref: `refs/heads/${normalizedBranch}`,
                sha,
            });
        }
        catch (error) {
            if (!isGithubApiError(error, 422)) {
                throw error;
            }
            await this.request('PATCH', `/git/refs/heads/${encodeRefPath(normalizedBranch)}`, {
                force: false,
                sha,
            });
        }
        return sha;
    }
    async openPR(branch, title, body) {
        const normalizedBranch = this.normalizeBranch(branch);
        const normalizedTitle = title.trim();
        if (!normalizedTitle) {
            throw new Error('[runner] PR title is required.');
        }
        try {
            const pr = await this.request('POST', '/pulls', {
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
        }
        catch (error) {
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
    async findOpenPullRequest(branch) {
        const query = new URLSearchParams({
            base: this.defaultBaseBranch,
            head: `${this.owner}:${branch}`,
            state: 'open',
        });
        const pulls = await this.request('GET', `/pulls?${query.toString()}`);
        return pulls[0] ?? null;
    }
    async getBranchSha(branch) {
        const ref = await this.request('GET', `/git/ref/heads/${encodeRefPath(branch)}`);
        return ref.object.sha;
    }
    normalizeBranch(branch) {
        const normalizedBranch = branch.trim();
        if (!normalizedBranch) {
            throw new Error('[runner] Branch name is required.');
        }
        if (!normalizedBranch.startsWith('task/')) {
            throw new Error(`[runner] Runner branches must use the task/{taskId} format, got: ${branch}`);
        }
        return normalizedBranch;
    }
    async resolveLocalBranchSha(branch) {
        const sha = await this.runGit(['rev-parse', `${branch}^{commit}`], this.worktreePath);
        return sha.trim();
    }
    async request(method, path, body) {
        const response = await this.fetchImpl(`${this.apiBaseUrl}/repos/${this.owner}/${this.repo}${path}`, {
            body: body === undefined ? undefined : JSON.stringify(body),
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${this.config.githubToken}`,
                'Content-Type': 'application/json',
                'User-Agent': '@mcp-coord/runner',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            method,
        });
        if (!response.ok) {
            const errorBody = (await response
                .json()
                .catch(() => ({})));
            throw new GitHubApiError(method, path, response.status, errorBody.message ?? response.statusText);
        }
        if (response.status === 204) {
            return undefined;
        }
        return (await response.json());
    }
}
exports.GitManager = GitManager;
class GitHubApiError extends Error {
    method;
    path;
    status;
    constructor(method, path, status, message) {
        super(`[runner] GitHub API ${method} ${path} failed (${status}): ${message}`);
        this.method = method;
        this.path = path;
        this.status = status;
        this.name = 'GitHubApiError';
    }
}
function parseRepoSlug(repoSlug) {
    const normalizedRepoSlug = repoSlug.trim();
    const [owner, repo, ...rest] = normalizedRepoSlug.split('/');
    if (!owner || !repo || rest.length > 0) {
        throw new Error(`[runner] GITHUB_REPO must use the "owner/repo" format, got: ${repoSlug}`);
    }
    return { owner, repo };
}
function encodeRefPath(ref) {
    return ref
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
}
async function defaultRunGit(args, cwd) {
    const result = await execFileAsync('git', ['--no-pager', ...args], {
        cwd,
        encoding: 'utf8',
    });
    return result.stdout;
}
function isGithubApiError(error, status, messageIncludes) {
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
//# sourceMappingURL=git-manager.js.map