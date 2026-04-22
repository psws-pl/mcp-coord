import { loadConfig } from './config';
import { createDriverRegistry } from './driver-registry';
import { BUILTIN_DRIVERS } from './drivers';
import { GitManager } from './git-manager';
import { JobSpawner } from './job-spawner';
import { McpCoordClient } from './mcp-coord-client';
import { RunnerService } from './runner-service';

async function main(): Promise<void> {
  console.log('[runner] starting @mcp-coord/runner');

  const config = loadConfig();
  const drivers = createDriverRegistry(BUILTIN_DRIVERS);
  const coord = new McpCoordClient(config);
  const git = new GitManager(config);
  const jobs = await JobSpawner.fromConfig(config);
  const runner = new RunnerService(config, {
    coord,
    drivers,
    git,
    jobs,
  });

  await runner.register();
  await runner.runForever();
}

main().catch((error: unknown) => {
  console.error('[runner] fatal startup error', error);
  process.exit(1);
});
