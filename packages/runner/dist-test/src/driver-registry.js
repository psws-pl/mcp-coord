"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverRegistry = void 0;
exports.createDriverRegistry = createDriverRegistry;
const types_1 = require("./types");
function unsupportedDriverError(name) {
    return new Error(`[runner] Unsupported driver "${name}". ` +
        'Expected one of: claude, codex, gemini, aider, generic.');
}
/**
 * In-memory registry of statically linked drivers.
 * Drivers are registered during process startup — no runtime module loading.
 */
class DriverRegistry {
    drivers = new Map();
    constructor(drivers = []) {
        this.registerMany(drivers);
    }
    register(driver) {
        const existing = this.drivers.get(driver.name);
        if (existing) {
            throw new Error(`[runner] Driver "${driver.name}" is already registered.`);
        }
        this.drivers.set(driver.name, driver);
        return this;
    }
    registerMany(drivers) {
        for (const driver of drivers) {
            this.register(driver);
        }
        return this;
    }
    has(name) {
        return (0, types_1.isDriverName)(name) && this.drivers.has(name);
    }
    get(name) {
        const driverName = this.toDriverName(name);
        const driver = this.drivers.get(driverName);
        if (!driver) {
            throw new Error(`[runner] Driver "${driverName}" is not registered. ` +
                'Ensure it is wired into the startup registry.');
        }
        return driver;
    }
    maybeGet(name) {
        if (!(0, types_1.isDriverName)(name)) {
            return undefined;
        }
        return this.drivers.get(name);
    }
    list() {
        return [...this.drivers.values()];
    }
    listNames() {
        return [...this.drivers.keys()];
    }
    toDriverName(name) {
        if (!(0, types_1.isDriverName)(name)) {
            throw unsupportedDriverError(name);
        }
        return name;
    }
}
exports.DriverRegistry = DriverRegistry;
function createDriverRegistry(drivers = []) {
    return new DriverRegistry(drivers);
}
//# sourceMappingURL=driver-registry.js.map