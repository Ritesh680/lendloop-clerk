import type { ReactNode } from "react";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-zinc-line p-6">
      <h3 className="font-display text-base font-semibold tracking-tight">
        {title}
      </h3>
      {children && <p className="max-w-prose text-sm text-steel">{children}</p>}
      {action}
    </div>
  );
}
