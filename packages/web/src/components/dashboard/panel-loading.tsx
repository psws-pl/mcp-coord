export function PanelLoading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10 lg:py-10">
      <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
          Loading
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-36 animate-pulse rounded-2xl border bg-background/80"
          />
        ))}
      </section>

      <section className="rounded-3xl border bg-background p-6 shadow-sm lg:p-8">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-2xl bg-muted/60"
            />
          ))}
        </div>
      </section>
    </div>
  );
}
