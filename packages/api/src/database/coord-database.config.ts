import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

import { coordEntities } from './entities';
import { InitialCoordSchema1713916800000 } from './migrations/1713916800000-initial-coord-schema';

const DEFAULT_DATABASE_URL = 'postgres://coord:coord@127.0.0.1:5432/coord';

const coordMigrations = [InitialCoordSchema1713916800000];

export const createCoordDataSourceOptions = (
  databaseUrl?: string,
): DataSourceOptions => ({
  type: 'postgres',
  url: databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  entities: [...coordEntities],
  migrations: coordMigrations,
  migrationsTableName: 'coord_migrations',
  synchronize: false,
});

export const createCoordTypeOrmOptions = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  ...createCoordDataSourceOptions(configService.get<string>('DATABASE_URL')),
  autoLoadEntities: false,
  retryAttempts: 0,
  manualInitialization: true,
});
