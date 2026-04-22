import { Activity, Clock3, Cpu, ShieldCheck } from "lucide-react";

import { AgentsPanel } from "@/components/dashboard/agents-panel";
import { PanelFrame, SummaryCard } from "@/components/dashboard/panel-frame";
import { deriveAgentCardStatus } from "@/lib/coord/agents";
import { listAgents, listMessages, listTasks } from "@/lib/coord/api";

export default async function AgentsPage() {
  const [agentsData, tasksData, messagesData] = await Promise.all([
    listAgents(),
    listTasks(),
    listMessages(),
  ]);
  const enabledAgents = agentsData.items.filter((agent) => agent.enabled).length;
  const runningAgents = agentsData.items.filter(
    (agent) => deriveAgentCardStatus(agent) === "running",
  ).length;
  const waitingAgents = agentsData.items.filter(
    (agent) => deriveAgentCardStatus(agent) === "waiting",
  ).length;
  const configuredDrivers = new Set(
    agentsData.items.map((agent) => agent.driver).filter(Boolean),
  ).size;

  return (
    <PanelFrame
      eyebrow="Agents"
      title="Agent status panel"
      description="Review live runner state, inspect recent coordination activity, and prepare agent configuration or task routing changes from a single workspace."
      meta={agentsData.meta}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Activity}
          label="Tracked agents"
          value={String(agentsData.items.length)}
          helper="The grid stays keyed to the typed agent collection so status cards and sheet details share one source of truth."
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Enabled"
          value={String(enabledAgents)}
          helper="Enablement is editable from the detail sheet with optimistic preview updates."
        />
        <SummaryCard
          icon={Clock3}
          label="Waiting"
          value={String(waitingAgents)}
          helper="Waiting agents remain visible even when they are idle so dispatch decisions stay obvious."
        />
        <SummaryCard
          icon={Cpu}
          label="Configured drivers"
          value={String(configuredDrivers)}
          helper={`Runner activity currently shows ${runningAgents} active agents across the available driver pool.`}
        />
      </section>

      <AgentsPanel
        agents={agentsData.items}
        tasks={tasksData.items}
        messages={messagesData.items}
      />
    </PanelFrame>
  );
}
