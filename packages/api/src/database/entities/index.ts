import { CoordAgentEntity } from './coord-agent.entity';
import { CoordMessageEntity } from './coord-message.entity';
import { CoordPlanEntity } from './coord-plan.entity';
import { CoordTaskEntity } from './coord-task.entity';

export const coordEntities = [
  CoordAgentEntity,
  CoordTaskEntity,
  CoordMessageEntity,
  CoordPlanEntity,
] as const;

export {
  CoordAgentEntity,
  CoordMessageEntity,
  CoordPlanEntity,
  CoordTaskEntity,
};
