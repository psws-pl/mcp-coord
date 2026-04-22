import { PanelLoading } from "@/components/dashboard/panel-loading";

export default function Loading() {
  return (
    <PanelLoading
      title="Loading agents"
      description="Preparing the agent panel shell and availability summary."
    />
  );
}
