import { DatabaseZap, LucideIcon } from "lucide-react";

import type { CoordResourceMeta } from "@/lib/coord/types";

interface PanelFrameProps {
  eyebrow: string;
  title: string;
  description: string;
  meta: CoordResourceMeta;
  children: React.ReactNode;
}

export function PanelFrame({
  eyebrow,
  title,
  description,
  meta,
  children,
}: PanelFrameProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10 lg:py-10">
      <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
              {eyebrow}
            </p>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-balance">
                {title}
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <SourceBadge meta={meta} />
        </div>
      </section>

      {children}
    </div>
  );
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-2xl border bg-background p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{helper}</p>
    </article>
  );
}

export function PreviewList({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

function SourceBadge({ meta }: { meta: CoordResourceMeta }) {
  const isStub = meta.source === "stub";

  return (
    <div className="flex max-w-sm items-start gap-3 rounded-2xl border bg-muted/40 px-4 py-3 text-sm leading-6">
      <DatabaseZap className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium text-foreground">
          {isStub ? "Preview data" : "Live data"}
        </p>
        <p className="text-muted-foreground">
          {meta.reason ??
            (meta.endpoint
              ? `Loaded from ${meta.endpoint}`
              : "Connected to coord API.")}
        </p>
      </div>
    </div>
  );
}
