import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/constants";
import { CATEGORY_ICONS } from "@/lib/categories";

/** Server component: visitors get the tool list in the HTML, with no client JS. */
export async function PublicTools() {
  const tools = await fetchQuery(api.tools.listPublic);

  if (tools.length === 0) {
    return (
      <p className="max-w-prose rounded-md border border-dashed border-zinc-line bg-enamel-950 p-6 text-steel">
        The board is empty right now. Sign in and hang up the first tool.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {tools.map((tool, index) => {
        const Icon = CATEGORY_ICONS[tool.category];
        return (
          <li key={`${tool.name}-${index}`}>
            <div className="tag tag-swing h-full min-h-40 justify-between gap-4">
              <Icon className="size-6 self-center" strokeWidth={1.5} aria-hidden />
              <div>
                <p className="font-display leading-tight font-semibold tracking-tight break-words">
                  {tool.name}
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-wider text-ink-soft uppercase">
                  {CATEGORY_LABELS[tool.category]}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PublicToolsSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="skeleton h-40 rounded-md" />
      ))}
    </div>
  );
}
