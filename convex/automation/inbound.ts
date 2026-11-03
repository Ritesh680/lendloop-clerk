import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { syncToolAvailability } from "../lib/availability";
import { daysBetween, todayUtc } from "../lib/dates";
import { applyDelivered } from "./outbox";

/** Handlers behind the signed HTTP routes in convex/http.ts. */

export const OVERDUE_SWEEP_HEARTBEAT = "overdue-sweep";
const OVERDUE_BATCH = 200;

/**
 * Lists loans owed a reminder today. A mutation because it also records the
 * heartbeat, atomically with the read. Loans already reminded today are
 * excluded, so re-running the workflow can't remind anyone twice, while loans
 * whose send failed stay in the list and get retried.
 */
export const startOverdueSweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const heartbeat = await ctx.db
      .query("integrationHeartbeats")
      .withIndex("by_name", (q) => q.eq("name", OVERDUE_SWEEP_HEARTBEAT))
      .unique();
    if (heartbeat) {
      await ctx.db.patch(heartbeat._id, { lastSeenAt: Date.now() });
    } else {
      await ctx.db.insert("integrationHeartbeats", {
        name: OVERDUE_SWEEP_HEARTBEAT,
        lastSeenAt: Date.now(),
      });
    }

    const overdue = await ctx.db
      .query("loans")
      .withIndex("by_status_and_endDate", (q) =>
        q.eq("status", "approved").lt("endDate", today),
      )
      .take(OVERDUE_BATCH);

    const items = [];
    for (const loan of overdue) {
      const reminder = await ctx.db
        .query("reminders")
        .withIndex("by_loan_and_date", (q) =>
          q.eq("loanId", loan._id).eq("reminderDate", today),
        )
        .unique();
      if (reminder?.status === "sent") continue;

      const [borrower, tool] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.toolId),
      ]);
      if (!borrower?.email || !tool) continue;

      items.push({
        loanId: loan._id as string,
        reminderDate: today,
        borrowerEmail: borrower.email,
        borrowerFirstName: borrower.firstName,
        toolName: tool.name,
        dueDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
    }
    return { date: today, loans: items };
  },
});

/**
 * Idempotent upsert on (loanId, reminderDate). "sent" is terminal: a delayed
 * retry of an earlier failure must not overwrite a later success.
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    reminderDate: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
  },
  handler: async (ctx, { loanId, reminderDate, status }) => {
    const id = ctx.db.normalizeId("loans", loanId);
    if (!id || !(await ctx.db.get(id))) return { result: "unknown_loan" as const };

    const existing = await ctx.db
      .query("reminders")
      .withIndex("by_loan_and_date", (q) =>
        q.eq("loanId", id).eq("reminderDate", reminderDate),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("reminders", {
        loanId: id,
        reminderDate,
        status,
        updatedAt: Date.now(),
      });
      return { result: "recorded" as const };
    }
    if (existing.status === "failed" && status === "sent") {
      await ctx.db.patch(existing._id, { status, updatedAt: Date.now() });
      return { result: "recorded" as const };
    }
    return { result: "duplicate" as const };
  },
});

/** Ack from the notification workflow, confirming the email actually went out. */
export const ackNotification = internalMutation({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const id = ctx.db.normalizeId("notificationOutbox", eventId);
    return { result: id ? await applyDelivered(ctx, id) : ("unknown_event" as const) };
  },
});

export const recordWorkflowFailure = internalMutation({
  args: {
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workflowFailures")
      .withIndex("by_execution", (q) => q.eq("executionId", args.executionId))
      .unique();
    if (existing) return { result: "duplicate" as const };
    await ctx.db.insert("workflowFailures", {
      executionId: args.executionId,
      workflowName: args.workflowName.slice(0, 120),
      nodeName: args.nodeName.slice(0, 120),
      // Defense in depth: n8n scrubs this too, but error text can quote payloads.
      message: args.message
        .replace(/[^\s@]+@[^\s@]+/g, "[email]")
        .slice(0, 500),
      occurredAt: Date.now(),
    });
    return { result: "recorded" as const };
  },
});

/** Daily: flips tools to "on loan" when an approved loan's start date arrives. */
export const refreshAvailability = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const started = await ctx.db
      .query("loans")
      .withIndex("by_status_and_startDate", (q) =>
        q.eq("status", "approved").lte("startDate", today),
      )
      .collect();
    const toolIds = new Set(started.map((loan) => loan.toolId));
    for (const toolId of toolIds) {
      await syncToolAvailability(ctx, toolId);
    }
  },
});
