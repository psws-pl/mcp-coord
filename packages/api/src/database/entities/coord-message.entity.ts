import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import {
  COORD_MESSAGE_STATUSES,
  COORD_MESSAGE_TYPES,
  CoordMessageStatus,
  CoordMessageType,
} from '../coord-schema.constants';

const messageStatusConstraint = COORD_MESSAGE_STATUSES.map(
  (status) => `'${status}'`,
).join(', ');
const messageTypeConstraint = COORD_MESSAGE_TYPES.map((type) => `'${type}'`).join(
  ', ',
);

@Entity('coord_messages')
@Index('coord_messages_to_status_created_at_idx', ['to', 'status', 'createdAt'])
@Index('coord_messages_from_created_at_idx', ['from', 'createdAt'])
@Index('coord_messages_task_id_idx', ['taskId'])
@Index('coord_messages_plan_id_idx', ['planId'])
@Check(
  'coord_messages_status_check',
  `"status" IN (${messageStatusConstraint})`,
)
@Check(
  'coord_messages_type_check',
  `"type" IN (${messageTypeConstraint})`,
)
export class CoordMessageEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ name: 'from', type: 'varchar' })
  from!: string;

  @Column({ name: 'to', type: 'varchar' })
  to!: string;

  @Column({ type: 'varchar' })
  type!: CoordMessageType;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: CoordMessageStatus = 'pending';

  @Column({ name: 'task_id', type: 'varchar', nullable: true })
  taskId!: string | null;

  @Column({ name: 'plan_id', type: 'varchar', nullable: true })
  planId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;
}
