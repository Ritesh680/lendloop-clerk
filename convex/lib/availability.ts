import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { rangesOverlap, todayUtc } from "./dates";

export async function approvedLoansForTool(ctx: QueryCtx, toolId: Id<"tools">) {
  return ctx.db
    .query("loans")
    .withIndex("by_tool_and_status", (q) =>
      q.eq("toolId", toolId).eq("status", "approved"),
    )
    .collect();
}

/**
 * Recomputes the denormalized availability field. Call it from any mutation
 * that changes an approved loan; a daily cron handles loans whose start date
 * simply arrives. A tool is on loan from the start date until it is marked
 * returned, which may be later than the end date.
 */
export async function syncToolAvailability(
  ctx: MutationCtx,
  toolId: Id<"tools">,
) {
  const tool = await ctx.db.get(toolId);
  if (!tool) return;
  const today = todayUtc();
  const approved = await approvedLoansForTool(ctx, toolId);
  const availability = approved.some((loan) => loan.startDate <= today)
    ? "on_loan"
    : "available";
  if (tool.availability !== availability) {
    await ctx.db.patch(toolId, { availability });
  }
}

/**
 * An unreturned overdue loan still occupies the tool, so its effective end date
 * is today at the earliest. Without this, a tool that is physically still out
 * could be promised to someone else.
 */
export function conflictsWithApproved(
  range: { startDate: string; endDate: string },
  approved: Pick<Doc<"loans">, "startDate" | "endDate">[],
  today = todayUtc(),
) {
  return approved.some((loan) =>
    rangesOverlap(range, {
      startDate: loan.startDate,
      endDate: loan.endDate < today ? today : loan.endDate,
    }),
  );
}
