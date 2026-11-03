import type { ReactNode } from "react";
import {
  CATEGORY_LABELS,
  CONDITION_LABELS,
  type Category,
  type Condition,
} from "@/convex/lib/constants";
import { CATEGORY_ICONS } from "@/lib/categories";
import { formatDay } from "@/lib/format";

export type ToolTagData = {
  name: string;
  category: Category;
  condition: Condition;
  description: string;
  availability: "available" | "on_loan";
  dueBack: string | null;
  owner: { firstName: string; trustedLender: boolean };
  isMine: boolean;
};

/**
 * The signature of the app. An available tool is a manila tag hanging on the
 * board. A lent tool leaves its painted outline behind, with the date it's due.
 */
export function ToolTag({
  tool,
  actions,
}: {
  tool: ToolTagData;
  actions?: ReactNode;
}) {
  const Icon = CATEGORY_ICONS[tool.category];

  if (tool.availability === "on_loan") {
    return (
      <article className="tag-shadow-wrap h-full">
        <TagOutline />
        <div className="tag-shadow">
          <div className="flex items-start justify-between gap-2">
            <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="font-mono text-[10px] tracking-wider uppercase">
              On loan
            </span>
          </div>
          <h3 className="mt-3 font-display text-lg leading-tight font-semibold tracking-tight break-words text-chalk">
            {tool.name}
          </h3>
          <p className="mt-1 font-mono text-[10px] tracking-wider uppercase">
            {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
          </p>
          <p className="mt-2 line-clamp-2 flex-1 text-sm">{tool.description}</p>
          {tool.dueBack && (
            <p className="mt-3 font-mono text-xs text-manila tabular-nums">
              Due back {formatDay(tool.dueBack)}
            </p>
          )}
          <Footer tool={tool} actions={actions} />
        </div>
      </article>
    );
  }

  return (
    <article className="tag tag-swing h-full">
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="font-mono text-[10px] tracking-wider text-ink-soft uppercase">
          Available
        </span>
      </div>
      <h3 className="mt-3 font-display text-lg leading-tight font-semibold tracking-tight break-words">
        {tool.name}
      </h3>
      <p className="mt-1 font-mono text-[10px] tracking-wider text-ink-soft uppercase">
        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
      </p>
      <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink/85">
        {tool.description}
      </p>
      <Footer tool={tool} actions={actions} light />
    </article>
  );
}

function Footer({
  tool,
  actions,
  light,
}: {
  tool: ToolTagData;
  actions?: ReactNode;
  light?: boolean;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">
        {tool.isMine ? "Yours" : tool.owner.firstName}
        {tool.owner.trustedLender && (
          <span
            className={`ml-2 rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase ${
              light ? "border-ink/50" : "border-brass/70 text-brass"
            }`}
          >
            Trusted
          </span>
        )}
      </p>
      {actions}
    </div>
  );
}

/** Drawn in SVG because a clip-path can't carry a dashed border. */
function TagOutline() {
  return (
    <svg aria-hidden preserveAspectRatio="none" viewBox="0 0 200 200">
      <path
        d="M14 1 H186 L199 14 V199 H1 V14 Z"
        fill="rgb(10 28 38 / 0.85)"
        stroke="currentColor"
        strokeDasharray="5 4"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Button styled for the manila tag, where the app's dark buttons would clash. */
export const tagButtonClasses =
  "cursor-pointer rounded-md border border-ink bg-ink px-3 py-1.5 text-sm font-medium text-manila-soft transition-colors hover:bg-enamel-800 disabled:cursor-not-allowed disabled:opacity-50";
export const tagGhostButtonClasses =
  "cursor-pointer rounded-md border border-ink/40 px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-ink hover:bg-manila-soft";
