"use strict";
/**
 * Shared types for @mcp-coord/runner.
 *
 * These stubs define the contracts consumed across ar-002 → ar-010.
 * Implementations land in their respective tasks:
 *   - AgentDriver + DriverRegistry  → ar-002
 *   - McpCoordClient                → ar-003
 *   - JobSpawner                    → ar-004 / ar-005
 *   - Driver impls                  → ar-006 → ar-010
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_DRIVER_NAMES = void 0;
exports.isDriverName = isDriverName;
// ── Driver ───────────────────────────────────────────────────────────────────
exports.SUPPORTED_DRIVER_NAMES = [
    'claude',
    'codex',
    'gemini',
    'aider',
    'generic',
];
function isDriverName(value) {
    return exports.SUPPORTED_DRIVER_NAMES.includes(value);
}
//# sourceMappingURL=types.js.map