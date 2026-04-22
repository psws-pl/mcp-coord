import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-24 w-full rounded-[1.35rem] border border-border/70 bg-background/85 px-4 py-3 text-sm leading-6 text-foreground shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-muted-foreground focus-visible:border-primary/35 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
