"use strict";
/**
 * Runtime configuration for @mcp-coord/runner.
 * All values come from environment variables — no secrets in source.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
function required(key) {
    const val = process.env[key];
    if (!val) {
        throw new Error(`[runner] Required environment variable ${key} is not set. ` +
            `Check your runner deployment secrets.`);
    }
    return val;
}
function optionalInt(key, fallback) {
    const raw = process.env[key];
    if (!raw)
        return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
        throw new Error(`[runner] ${key} must be an integer, got: ${raw}`);
    }
    return parsed;
}
function loadConfig() {
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
//# sourceMappingURL=config.js.map