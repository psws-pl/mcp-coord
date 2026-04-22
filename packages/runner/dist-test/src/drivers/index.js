"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_DRIVERS = void 0;
const claude_1 = require("./claude");
/**
 * Static startup wiring for built-in drivers.
 *
 * ar-006 → ar-010 should add their concrete driver instances here so the runner
 * can register them at process startup without dynamic imports or config-time
 * module loading.
 */
exports.BUILTIN_DRIVERS = [claude_1.claudeDriver];
//# sourceMappingURL=index.js.map