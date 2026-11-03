import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type LoanActivity = {
  kind: "notification" | "reminder";
  state: "sent" | "failed";
  label: string;
  at: number;
};

const NOTIFICATION_LABELS = {
  "request.created": "Request email",
  "request.approved": "Approval email",
  "request.declined": "Decline email",
  "request.cancelled": "Cancellation email",
  "loan.returned": "Return confirmation",
} as const;

/** Newest-first automation history for one loan, for the bonus activity feed. */
export async function activityForLoan(
  ctx: QueryCtx,
  loanId: Id<"loans">,
): Promise<LoanActivity[]> {
  const [outbox, reminders] = await Promise.all([
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .take(50),
    ctx.db
      .query("reminders")
      .withIndex("by_loan_and_date", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(50),
  ]);

  const items: LoanActivity[] = [];
  for (const row of outbox) {
    // Pending rows are in-flight rather than history, so they are left out.
    if (row.status === "delivered") {
      items.push({
        kind: "notification",
        state: "sent",
        label: NOTIFICATION_LABELS[row.type],
        at: row.deliveredAt ?? row._creationTime,
      });
    } else if (row.status === "failed") {
      items.push({
        kind: "notification",
        state: "failed",
        label: NOTIFICATION_LABELS[row.type],
        at: row.failedAt ?? row._creationTime,
      });
    }
  }
  for (const row of reminders) {
    items.push({
      kind: "reminder",
      state: row.status,
      label: "Overdue reminder",
      at: row.updatedAt,
    });
  }
  return items.sort((a, b) => b.at - a.at);
}
