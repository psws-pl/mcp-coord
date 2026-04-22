import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import { COORD_PLAN_STATUSES, CoordPlanStatus } from '../coord-schema.constants';

const planStatusConstraint = COORD_PLAN_STATUSES.map((status) => `'${status}'`).join(
  ', ',
);

@Entity('coord_plans')
@Index('coord_plans_status_idx', ['status'])
@Index('coord_plans_owner_idx', ['owner'])
@Check(
  'coord_plans_status_check',
  `"status" IN (${planStatusConstraint})`,
)
export class CoordPlanEntity {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', default: '' })
  description = '';

  @Column({ type: 'varchar', default: 'draft' })
  status: CoordPlanStatus = 'draft';

  @Column({ type: 'varchar' })
  owner!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
