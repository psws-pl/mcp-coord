import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-2xl border border-border/70 bg-background/85 px-3.5 text-sm text-foreground shadow-[0_1px_0_rgba(15,23,42,0.03)] outline-none transition placeholder:text-muted-foreground focus-visible:border-primary/35 focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
