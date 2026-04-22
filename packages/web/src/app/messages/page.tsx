import { BellDot, CheckCheck, MessagesSquare, UsersRound } from "lucide-react";

import { MessagesTimeline } from "@/components/dashboard/messages-timeline";
import { PanelFrame, SummaryCard } from "@/components/dashboard/panel-frame";
import { listAgents, listMessages } from "@/lib/coord/api";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const [messagesData, agentsData] = await Promise.all([listMessages(), listAgents()]);
  const pendingCount = messagesData.items.filter((message) => message.status === "pending").length;
  const acknowledgedCount = messagesData.items.filter(
    (message) => message.status === "acknowledged",
  ).length;
  const participantCount = new Set(
    messagesData.items.flatMap((message) => [message.from, message.to]),
  ).size;

  return (
      <PanelFrame
        eyebrow="Messages"
        title="Messages timeline panel"
        description="Follow chronological coordination traffic, filter the stream by agent, and keep message acknowledgements aligned with dashboard invalidations."
        meta={messagesData.meta}
      >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={MessagesSquare}
          label="Messages"
          value={String(messagesData.items.length)}
          helper="Timeline rows stay keyed to the typed coordination message collection so grouping and optimistic updates share one source of truth."
        />
        <SummaryCard
          icon={BellDot}
          label="Pending"
          value={String(pendingCount)}
          helper="Pending deliveries are highlighted inline so unacknowledged coordination requests stand out immediately."
        />
        <SummaryCard
          icon={CheckCheck}
          label="Acknowledged"
          value={String(acknowledgedCount)}
          helper="Acknowledge actions keep status chips aligned with the spec-defined ack_message workflow."
        />
        <SummaryCard
          icon={UsersRound}
          label="Participants"
          value={String(participantCount)}
          helper={`Agent filtering can target ${agentsData.items.length} tracked agents plus any preview-only sender or recipient IDs.`}
        />
      </section>

      <MessagesTimeline messages={messagesData.items} agents={agentsData.items} />
    </PanelFrame>
  );
}
