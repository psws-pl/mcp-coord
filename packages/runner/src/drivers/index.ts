import type { AgentDriver } from '../types';
import { claudeDriver } from './claude';

/**
 * Static startup wiring for built-in drivers.
 *
 * ar-006 → ar-010 should add their concrete driver instances here so the runner
 * can register them at process startup without dynamic imports or config-time
 * module loading.
 */
export const BUILTIN_DRIVERS: readonly AgentDriver[] = [claudeDriver];
