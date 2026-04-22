"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("./config");
const driver_registry_1 = require("./driver-registry");
const drivers_1 = require("./drivers");
const git_manager_1 = require("./git-manager");
const job_spawner_1 = require("./job-spawner");
const mcp_coord_client_1 = require("./mcp-coord-client");
const runner_service_1 = require("./runner-service");
async function main() {
    console.log('[runner] starting @mcp-coord/runner');
    const config = (0, config_1.loadConfig)();
    const drivers = (0, driver_registry_1.createDriverRegistry)(drivers_1.BUILTIN_DRIVERS);
    const coord = new mcp_coord_client_1.McpCoordClient(config);
    const git = new git_manager_1.GitManager(config);
    const jobs = await job_spawner_1.JobSpawner.fromConfig(config);
    const runner = new runner_service_1.RunnerService(config, {
        coord,
        drivers,
        git,
        jobs,
    });
    await runner.register();
    await runner.runForever();
}
main().catch((error) => {
    console.error('[runner] fatal startup error', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map