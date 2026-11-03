import clsx from "clsx";
import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "pending"
  | "go"
  | "alert"
  | "muted"
  | "brass";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-zinc-line text-steel",
  pending: "border-manila/60 text-manila",
  go: "border-go/60 text-go",
  alert: "border-stamp bg-stamp/10 text-stamp",
  muted: "border-enamel-700 text-steel/70",
  brass: "border-brass/70 text-brass",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] tracking-wider whitespace-nowrap uppercase",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
