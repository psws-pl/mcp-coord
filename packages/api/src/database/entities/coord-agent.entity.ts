import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import {
  COORD_AGENT_STATUSES,
  CoordAgentStatus,
  CoordJsonObject,
} from '../coord-schema.constants';

const agentStatusConstraint = COORD_AGENT_STATUSES.map((status) => `'${status}'`).join(
  ', ',
);

@Entity('coord_agents')
@Unique('coord_agents_name_key', ['name'])
@Index('coord_agents_status_idx', ['status'])
@Index('coord_agents_enabled_idx', ['enabled'])
@Index('coord_agents_current_task_id_idx', ['currentTaskId'])
@Check(
  'coord_agents_status_check',
  `"status" IN (${agentStatusConstraint})`,
)
export class CoordAgentEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', default: 'waiting' })
  status: CoordAgentStatus = 'waiting';

  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled = true;

  @Column({ name: 'driver', type: 'varchar', nullable: true })
  driver!: string | null;

  @Column({ name: 'capabilities', type: 'jsonb', default: () => "'{}'::jsonb" })
  capabilities: CoordJsonObject = {};

  @Column({ name: 'current_task_id', type: 'varchar', nullable: true })
  currentTaskId!: string | null;

  @Column({ name: 'last_heartbeat_at', type: 'timestamptz', nullable: true })
  lastHeartbeatAt!: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: CoordJsonObject = {};

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
