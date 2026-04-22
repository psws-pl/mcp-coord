"use client";

import { PanelErrorState } from "@/components/dashboard/panel-error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PanelErrorState title="Tasks panel failed to load" error={error} reset={reset} />
  );
}
