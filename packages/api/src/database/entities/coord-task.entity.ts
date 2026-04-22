import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import {
  COORD_TASK_PRIORITIES,
  COORD_TASK_STATUSES,
  CoordJsonObject,
  CoordTaskPriority,
  CoordTaskStatus,
} from '../coord-schema.constants';

const taskStatusConstraint = COORD_TASK_STATUSES.map((status) => `'${status}'`).join(
  ', ',
);
const taskPriorityConstraint = COORD_TASK_PRIORITIES.map(
  (priority) => `'${priority}'`,
).join(', ');

@Entity('coord_tasks')
@Index('coord_tasks_status_idx', ['status'])
@Index('coord_tasks_owner_idx', ['owner'])
@Index('coord_tasks_plan_id_idx', ['planId'])
@Index('coord_tasks_status_owner_idx', ['status', 'owner'])
@Check(
  'coord_tasks_status_check',
  `"status" IN (${taskStatusConstraint})`,
)
@Check(
  'coord_tasks_priority_check',
  `"priority" IN (${taskPriorityConstraint})`,
)
export class CoordTaskEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', default: '' })
  description = '';

  @Column({ type: 'varchar', default: 'pending' })
  status: CoordTaskStatus = 'pending';

  @Column({ type: 'varchar', default: 'P2' })
  priority: CoordTaskPriority = 'P2';

  @Column({ type: 'varchar' })
  owner!: string;

  @Column({ name: 'plan_id', type: 'varchar', nullable: true })
  planId!: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: CoordJsonObject = {};

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
