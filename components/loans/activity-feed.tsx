import { timeAgo } from "@/lib/format";

export type ActivityItem = {
  kind: "notification" | "reminder";
  state: "sent" | "failed";
  label: string;
  at: number;
};

/** Most recent automation events on a loan, e.g. "Overdue reminder sent 2 days ago". */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1 border-t border-enamel-800 pt-3">
      {items.slice(0, 4).map((item) => (
        <li
          key={`${item.label}-${item.at}`}
          className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] tabular-nums"
        >
          <span className={item.state === "failed" ? "text-stamp" : "text-steel"}>
            {item.label} {item.state === "failed" ? "failed" : "sent"}
          </span>
          <span className="text-steel/70">{timeAgo(item.at)}</span>
        </li>
      ))}
    </ul>
  );
}
