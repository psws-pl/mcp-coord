import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class CoordRealtimeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async notify(
    channel: string,
    payload: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    const executor = manager ?? this.dataSource.manager;

    await executor.query('SELECT pg_notify($1, $2)', [
      channel,
      JSON.stringify(payload),
    ]);
  }
}
