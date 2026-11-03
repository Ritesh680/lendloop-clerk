import type { ReactNode } from "react";
import type { Category, LoanStatus } from "@/convex/lib/constants";
import { CATEGORY_ICONS } from "@/lib/categories";
import { formatRange } from "@/lib/format";
import { Badge } from "../ui/badge";
import { ActivityFeed, type ActivityItem } from "./activity-feed";
import { LoanStatusBadge } from "./status-badge";

export type PartyLoan = {
  status: LoanStatus;
  startDate: string;
  endDate: string;
  tool: { name: string; category: Category };
  counterparty: {
    firstName: string;
    trustedLender: boolean;
    email: string | null;
  };
  activity: ActivityItem[];
};

export function LoanCard({
  loan,
  counterpartyLabel,
  actions,
}: {
  loan: PartyLoan;
  counterpartyLabel: string;
  actions?: ReactNode;
}) {
  const Icon = CATEGORY_ICONS[loan.tool.category];
  return (
    <article className="rounded-md border border-enamel-700 bg-enamel-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-manila" strokeWidth={1.5} aria-hidden />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg leading-tight font-semibold tracking-tight break-words">
                {loan.tool.name}
              </h3>
              <LoanStatusBadge status={loan.status} endDate={loan.endDate} />
            </div>
            <p className="mt-1 font-mono text-xs text-manila tabular-nums">
              {formatRange(loan.startDate, loan.endDate)}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-steel">
              <span>
                {counterpartyLabel}{" "}
                <span className="text-chalk">{loan.counterparty.firstName}</span>
              </span>
              {loan.counterparty.trustedLender && (
                <Badge tone="brass">Trusted</Badge>
              )}
              {loan.counterparty.email && (
                <a
                  href={`mailto:${loan.counterparty.email}`}
                  className="font-mono text-xs underline underline-offset-2 hover:text-chalk"
                >
                  {loan.counterparty.email}
                </a>
              )}
            </p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <ActivityFeed items={loan.activity} />
    </article>
  );
}
