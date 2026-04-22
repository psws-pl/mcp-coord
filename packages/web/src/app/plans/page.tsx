import {
  Blocks,
  ChartNoAxesCombined,
  CircleCheckBig,
  Milestone,
} from "lucide-react";

import { PlansPanel } from "@/components/dashboard/plans-panel";
import { PanelFrame, SummaryCard } from "@/components/dashboard/panel-frame";
import { listPlans, listTasks } from "@/lib/coord/api";
import { getPlanActionStatus } from "@/lib/coord/plans";

export default async function PlansPage() {
  const [plansData, tasksData] = await Promise.all([listPlans(), listTasks()]);
  const activePlans = plansData.items.filter(
    (plan) => getPlanActionStatus(plan.status) === "active",
  ).length;
  const completedPlans = plansData.items.filter(
    (plan) => getPlanActionStatus(plan.status) === "completed",
  ).length;
  const totalTasks = plansData.items.reduce((sum, plan) => sum + plan.taskCounts.total, 0);
  const completedTasks = plansData.items.reduce((sum, plan) => sum + plan.taskCounts.done, 0);

  return (
      <PanelFrame
        eyebrow="Plans"
        title="Plans panel"
        description="Monitor shared execution plans with typed progress summaries, linked task drill-down, and realtime refresh when plans or tasks change."
        meta={plansData.meta}
      >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Milestone}
          label="Tracked plans"
          value={String(plansData.items.length)}
          helper="Plan cards stay keyed to the shared plan collection so progress, drill-down, and optimistic actions all share one source of truth."
        />
        <SummaryCard
          icon={Blocks}
          label="Active"
          value={String(activePlans)}
          helper="Inline status controls can promote paused or draft plans back into the active queue without leaving the grid."
        />
        <SummaryCard
          icon={CircleCheckBig}
          label="Completed"
          value={String(completedPlans)}
          helper="Completed plans remain visible with their linked task history so execution context is preserved after handoff."
        />
        <SummaryCard
          icon={ChartNoAxesCombined}
          label="Task progress"
          value={`${completedTasks}/${totalTasks}`}
          helper={`Linked drill-down is backed by ${tasksData.items.length} typed tasks so each plan can expand into its current execution scope.`}
        />
      </section>

      <PlansPanel plans={plansData.items} tasks={tasksData.items} />
    </PanelFrame>
  );
}
