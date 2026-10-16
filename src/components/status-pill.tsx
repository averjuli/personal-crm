import { Check } from "lucide-react";
import type { ComponentProps } from "react";

// Dark pill with a lime check, like "Сохранено" on the landing
export function StatusPill({ children, ...props }: ComponentProps<"p">) {
  return (
    <p
      className="inline-flex w-fit items-center gap-2 rounded-2xl bg-foreground px-3.5 py-2 text-[0.8125rem] font-semibold text-card"
      {...props}
    >
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="size-3.5 shrink-0 text-primary"
      />
      {children}
    </p>
  );
}
