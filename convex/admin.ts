import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { activityForLoan } from "./automation/activity";
import { OVERDUE_SWEEP_HEARTBEAT } from "./automation/inbound";
import { LIMITS, loanStatusValidator } from "./lib/constants";
import { appError } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";
import { cleanLine, maskEmail } from "./lib/text";
import { retireTool } from "./tools";

export const listLoans = adminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(loanStatusValidator),
  },
  handler: async (ctx, { paginationOpts, status }) => {
    const query = status
      ? ctx.db
          .query("loans")
          .withIndex("by_status_and_endDate", (q) => q.eq("status", status))
      : ctx.db.query("loans");
    const page = await query.order("desc").paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (loan) => {
          const [tool, borrower, lender] = await Promise.all([
            ctx.db.get(loan.toolId),
            ctx.db.get(loan.borrowerId),
            ctx.db.get(loan.lenderId),
          ]);
          return {
            _id: loan._id,
            status: loan.status,
            startDate: loan.startDate,
            endDate: loan.endDate,
            toolName: tool?.name ?? "Removed tool",
            toolCategory: tool?.category ?? "other",
            borrowerName: borrower?.firstName ?? "Neighbor",
            lenderName: lender?.firstName ?? "Neighbor",
            activity: await activityForLoan(ctx, loan._id),
          };
        }),
      ),
    };
  },
});

export const listListings = adminQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query("tools")
      .withIndex("by_status_and_category", (q) => q.eq("status", "active"))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (tool) => {
          const owner = await ctx.db.get(tool.ownerId);
          return {
            _id: tool._id,
            name: tool.name,
            category: tool.category,
            availability: tool.availability,
            ownerName: owner?.firstName ?? "Neighbor",
          };
        }),
      ),
    };
  },
});

export const removeListing = adminMutation({
  args: { toolId: v.id("tools"), reason: v.string() },
  handler: async (ctx, { toolId, reason }) => {
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.status !== "active") {
      throw appError("NOT_FOUND", "This listing no longer exists.");
    }
    // Approved loans stay open on purpose: the tool may still be out, so its
    // return and any overdue reminders must keep working after removal.
    await retireTool(
      ctx,
      tool,
      ctx.user._id,
      cleanLine(reason, "Reason", LIMITS.removalReason),
    );
  },
});

export const listMembers = adminQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(LIMITS.listPage);
    return users.map((user) => ({
      _id: user._id,
      firstName: user.firstName,
      maskedEmail: maskEmail(user.email),
      role: user.role,
      trustedLender: user.trustedLender,
    }));
  },
});

export const setTrustedLender = adminMutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const user = await ctx.db.get(userId);
    if (!user) throw appError("NOT_FOUND", "This member no longer exists.");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});

export const automationHealth = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [failedNotifications, failures, heartbeat] = await Promise.all([
      ctx.db
        .query("notificationOutbox")
        .withIndex("by_status_and_nextAttemptAt", (q) =>
          q.eq("status", "failed"),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("workflowFailures")
        .withIndex("by_acknowledged", (q) =>
          q.eq("acknowledgedAt", undefined),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("integrationHeartbeats")
        .withIndex("by_name", (q) => q.eq("name", OVERDUE_SWEEP_HEARTBEAT))
        .unique(),
    ]);
    const pending = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "pending"),
      )
      .take(100);
    return {
      lastOverdueSweepAt: heartbeat?.lastSeenAt ?? null,
      pendingNotifications: pending.length,
      failedNotifications: failedNotifications.map((row) => ({
        _id: row._id,
        type: row.type,
        attempts: row.attempts,
        lastError: row.lastError ?? "unknown",
        failedAt: row.failedAt ?? row._creationTime,
      })),
      workflowFailures: failures.map((row) => ({
        _id: row._id,
        workflowName: row.workflowName,
        nodeName: row.nodeName,
        message: row.message,
        occurredAt: row.occurredAt,
      })),
    };
  },
});

export const retryNotification = adminMutation({
  args: { outboxId: v.id("notificationOutbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    if (!row) throw appError("NOT_FOUND", "This notification no longer exists.");
    if (row.status !== "failed") {
      throw appError("CONFLICT", "This notification is not in a failed state.");
    }
    await ctx.db.patch(outboxId, {
      status: "pending",
      attempts: 0,
      nextAttemptAt: Date.now(),
      lockedUntil: undefined,
      failedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.automation.outbox.deliver, {
      outboxId,
    });
  },
});

export const acknowledgeWorkflowFailure = adminMutation({
  args: { failureId: v.id("workflowFailures") },
  handler: async (ctx, { failureId }) => {
    await ctx.db.patch(failureId, { acknowledgedAt: Date.now() });
  },
});

/**
 * Role changes are internal functions: they are callable only with deployment
 * credentials (CLI or dashboard), so no client path can escalate privileges.
 *   npx convex run admin:setRoleByEmail '{"email":"you@example.com","role":"admin"}'
 */
export const setRoleByEmail = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) {
      throw new Error(`No user with email ${email}. Sign in once first.`);
    }
    await ctx.db.patch(user._id, { role });
    return { userId: user._id, role };
  },
});
