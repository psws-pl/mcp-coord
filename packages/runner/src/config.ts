/**
 * Runtime configuration for @mcp-coord/runner.
 * All values come from environment variables — no secrets in source.
 */

export interface RunnerConfig {
  /** Full URL to the mcp-coord MCP endpoint, e.g. https://coord-api.psws.pl/mcp */
  mcordUrl: string;
  /** API key sent as X-Coord-Key header */
  mcordKey: string;
  /** GitHub personal access token for branch + PR operations */
  githubToken: string;
  /** GitHub repo slug, e.g. "psws-pl/axiom02" */
  githubRepo: string;
  /**
   * Fallback driver name when coord_agents.driver is null.
   * Defaults to "claude".
   */
  defaultDriver: string;
  /** Path to kubeconfig; undefined = in-cluster config */
  kubeconfig?: string;
  /** Polling interval in milliseconds (converted from POLL_INTERVAL_SECONDS). */
  pollIntervalMs: number;
  /** k8s Job TTL after completion in seconds. */
  jobTtlSeconds: number;
  /** k8s namespace for spawned Jobs. */
  namespace: string;
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(
      `[runner] Required environment variable ${key} is not set. ` +
        `Check your runner deployment secrets.`,
    );
  }
  return val;
}

function optionalInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[runner] ${key} must be an integer, got: ${raw}`);
  }
  return parsed;
}

export function loadConfig(): RunnerConfig {
  return {
    mcordUrl: required('MCOORD_URL'),
    mcordKey: required('MCOORD_KEY'),
    githubToken: required('GITHUB_TOKEN'),
    githubRepo: required('GITHUB_REPO'),
    defaultDriver: process.env['DEFAULT_DRIVER'] ?? 'claude',
    kubeconfig: process.env['KUBECONFIG'],
    pollIntervalMs: optionalInt('POLL_INTERVAL_SECONDS', 10) * 1000,
    jobTtlSeconds: optionalInt('JOB_TTL_SECONDS', 3600),
    namespace: process.env['K8S_NAMESPACE'] ?? 'coord',
  };
}
