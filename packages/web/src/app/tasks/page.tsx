import { ArrowUpRight, CircleCheckBig, KanbanSquare, UsersRound } from "lucide-react";

import { TasksBoard } from "@/components/dashboard/tasks-board";
import { PanelFrame, SummaryCard } from "@/components/dashboard/panel-frame";
import { listAgents, listPlans, listTasks } from "@/lib/coord/api";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const [tasksData, agentsData, plansData] = await Promise.all([
    listTasks(),
    listAgents(),
    listPlans(),
  ]);
  const reviewCount = tasksData.items.filter((task) => task.status === "review").length;
  const inProgressCount = tasksData.items.filter((task) => task.status === "in_progress").length;
  const doneCount = tasksData.items.filter((task) => task.status === "done").length;
  const blockedCount = tasksData.items.filter((task) => task.status === "blocked").length;

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
          helper="A wider, cleaner shell keeps the board readable without losing the existing live task collection."
        />
        <SummaryCard
          icon={ArrowUpRight}
          label="Active flow"
          value={String(inProgressCount + reviewCount)}
          helper="In-progress and review work stay elevated so handoffs and current execution are easy to scan."
        />
        <SummaryCard
          icon={UsersRound}
          label="Agents available"
          value={String(agentsData.items.length)}
          helper="Quick assign stays close to each card, using the same tracked agent list that powers filters."
        />
        <SummaryCard
          icon={CircleCheckBig}
          label="Done / blocked"
          value={`${doneCount} / ${blockedCount}`}
          helper={`Plan filters still span ${plansData.items.length} plans while blocked work stays visible as risk.`}
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
