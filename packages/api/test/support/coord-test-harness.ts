import { AddressInfo } from 'node:net';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

import { AppModule } from '../../src/app.module';
import { createCoordDataSourceOptions } from '../../src/database/coord-database.config';

export const TEST_API_KEYS = {
  raw: 'raw-key',
  be: 'be-key',
  orch: 'orch-key',
} as const;

const TEST_COORD_API_KEYS = `be=${TEST_API_KEYS.be},orch=${TEST_API_KEYS.orch},${TEST_API_KEYS.raw}`;
const TEST_DATABASE_URL_ENV = 'COORD_TEST_DATABASE_URL';

interface StartedDatabaseHandle {
  connectionString: string;
  stop: () => Promise<void>;
}

export interface CoordApiTestHarness {
  app: INestApplication;
  baseUrl: string;
  dataSource: DataSource;
  resetDatabase: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createCoordApiTestHarness(): Promise<CoordApiTestHarness> {
  const previousEnv = {
    databaseUrl: process.env.DATABASE_URL,
    coordApiKeys: process.env.COORD_API_KEYS,
  };
  const databaseHandle = await startDatabase();

  process.env.DATABASE_URL = databaseHandle.connectionString;
  process.env.COORD_API_KEYS = TEST_COORD_API_KEYS;

  await prepareDatabase(databaseHandle.connectionString);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  const dataSource = app.get(DataSource);

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  await app.init();
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    dataSource,
    resetDatabase: async () => {
      await dataSource.query(`
        TRUNCATE TABLE
          "coord_messages",
          "coord_agents",
          "coord_tasks",
          "coord_plans"
        RESTART IDENTITY CASCADE
      `);
    },
    close: async () => {
      await app.close();

      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }

      process.env.DATABASE_URL = previousEnv.databaseUrl;
      process.env.COORD_API_KEYS = previousEnv.coordApiKeys;

      await databaseHandle.stop();
    },
  };
}

async function startDatabase(): Promise<StartedDatabaseHandle> {
  const externalDatabaseUrl = process.env[TEST_DATABASE_URL_ENV];

  if (externalDatabaseUrl) {
    return {
      connectionString: externalDatabaseUrl,
      stop: async () => undefined,
    };
  }

  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:16-alpine',
  )
    .withDatabase('coord_test')
    .withUsername('coord')
    .withPassword('coord')
    .start();

  return {
    connectionString: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}

async function prepareDatabase(databaseUrl: string): Promise<void> {
  const dataSource = new DataSource(createCoordDataSourceOptions(databaseUrl));

  await dataSource.initialize();
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
