"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PanelErrorState({
  title,
  error,
  reset,
}: {
  title: string;
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-8 lg:px-10">
      <section className="w-full rounded-3xl border bg-background p-8 shadow-sm">
        <div className="flex max-w-2xl flex-col gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
              Error boundary
            </p>
            <h2 className="text-3xl font-semibold tracking-tight">
              {title}
            </h2>
            <p className="text-base leading-7 text-muted-foreground">
              {error.message ||
                "Something went wrong while loading this dashboard panel."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={reset}>Try again</Button>
            {error.digest ? (
              <Button variant="outline" disabled>
                Digest: {error.digest}
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
