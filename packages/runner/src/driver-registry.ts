import type { AgentDriver, DriverName } from './types';
import { isDriverName } from './types';

function unsupportedDriverError(name: string): Error {
  return new Error(
    `[runner] Unsupported driver "${name}". ` +
      'Expected one of: claude, codex, gemini, aider, generic.',
  );
}

/**
 * In-memory registry of statically linked drivers.
 * Drivers are registered during process startup — no runtime module loading.
 */
export class DriverRegistry {
  private readonly drivers = new Map<DriverName, AgentDriver>();

  constructor(drivers: readonly AgentDriver[] = []) {
    this.registerMany(drivers);
  }

  register(driver: AgentDriver): this {
    const existing = this.drivers.get(driver.name);
    if (existing) {
      throw new Error(
        `[runner] Driver "${driver.name}" is already registered.`,
      );
    }

    this.drivers.set(driver.name, driver);
    return this;
  }

  registerMany(drivers: readonly AgentDriver[]): this {
    for (const driver of drivers) {
      this.register(driver);
    }

    return this;
  }

  has(name: string): boolean {
    return isDriverName(name) && this.drivers.has(name);
  }

  get(name: string): AgentDriver {
    const driverName = this.toDriverName(name);
    const driver = this.drivers.get(driverName);

    if (!driver) {
      throw new Error(
        `[runner] Driver "${driverName}" is not registered. ` +
          'Ensure it is wired into the startup registry.',
      );
    }

    return driver;
  }

  maybeGet(name: string): AgentDriver | undefined {
    if (!isDriverName(name)) {
      return undefined;
    }

    return this.drivers.get(name);
  }

  list(): readonly AgentDriver[] {
    return [...this.drivers.values()];
  }

  listNames(): readonly DriverName[] {
    return [...this.drivers.keys()];
  }

  private toDriverName(name: string): DriverName {
    if (!isDriverName(name)) {
      throw unsupportedDriverError(name);
    }

    return name;
  }
}

export function createDriverRegistry(
  drivers: readonly AgentDriver[] = [],
): DriverRegistry {
  return new DriverRegistry(drivers);
}
