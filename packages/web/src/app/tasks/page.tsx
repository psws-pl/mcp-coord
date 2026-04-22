import { ArrowUpRight, CircleCheckBig, KanbanSquare, UsersRound } from "lucide-react";

import { TasksBoard } from "@/components/dashboard/tasks-board";
import { PanelFrame, SummaryCard } from "@/components/dashboard/panel-frame";
import { listAgents, listPlans, listTasks } from "@/lib/coord/api";

export default async function TasksPage() {
  const [tasksData, agentsData, plansData] = await Promise.all([
    listTasks(),
    listAgents(),
    listPlans(),
  ]);
  const reviewCount = tasksData.items.filter((task) => task.status === "review").length;
  const doneCount = tasksData.items.filter((task) => task.status === "done").length;
  const assignedCount = tasksData.items.filter((task) => task.owner).length;

  return (
      <PanelFrame
        eyebrow="Tasks"
        title="Tasks kanban panel"
        description="Track work by status lane, filter the board by owner or plan, and keep task detail sheets aligned with live coord invalidations."
        meta={tasksData.meta}
      >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={KanbanSquare}
          label="Visible tasks"
          value={String(tasksData.items.length)}
          helper="Board lanes stay keyed to the shared task collection so filters and detail sheets stay in sync."
        />
        <SummaryCard
          icon={ArrowUpRight}
          label="In review"
          value={String(reviewCount)}
          helper="A dedicated review lane keeps handoff work visible before tasks move to done."
        />
        <SummaryCard
          icon={UsersRound}
          label="Assigned"
          value={String(assignedCount)}
          helper={`Owner filtering includes the ${agentsData.items.length} tracked agents plus any preview-only assignees.`}
        />
        <SummaryCard
          icon={CircleCheckBig}
          label="Completed"
          value={String(doneCount)}
          helper={`Plan filters currently span ${plansData.items.length} plans across the available task set.`}
        />
      </section>

      <TasksBoard
        tasks={tasksData.items}
        agents={agentsData.items}
        plans={plansData.items}
      />
    </PanelFrame>
  );
}
