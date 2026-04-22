import { DatabaseZap, LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Card className="relative overflow-hidden rounded-[2rem] bg-background/90 backdrop-blur">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.14),transparent_52%),linear-gradient(90deg,rgba(255,255,255,0.78),transparent)]" />

        <CardContent className="relative p-6 lg:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <Badge variant="muted" className="w-fit px-3 py-1 text-xs tracking-[0.28em]">
                {eyebrow}
              </Badge>
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-[2rem]">
                  {title}
                </h2>
                <p className="text-base leading-7 text-muted-foreground">
                  {description}
                </p>
              </div>
            </div>
            <SourceBadge meta={meta} />
          </div>
        </CardContent>
      </Card>

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
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-11 items-center justify-center rounded-[1.2rem] bg-primary/10 text-primary shadow-[0_16px_35px_-24px_rgba(79,70,229,0.35)]">
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{helper}</p>
    </Card>
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
    <Card className="rounded-[2rem] p-6 lg:p-8">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </Card>
  );
}

function SourceBadge({ meta }: { meta: CoordResourceMeta }) {
  const isStub = meta.source === "stub";

  return (
    <Card className="flex max-w-sm items-start gap-3 rounded-[1.35rem] bg-background/85 px-4 py-3 text-sm leading-6">
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
    </Card>
  );
}
