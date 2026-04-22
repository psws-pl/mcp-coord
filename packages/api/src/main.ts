import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const dataSource = app.get(DataSource);
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);

  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }

  await app.listen(port, '0.0.0.0');
}

void bootstrap();
