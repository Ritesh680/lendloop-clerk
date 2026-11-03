import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { emitLoanEvent } from "./automation/outbox";
import { activityForLoan } from "./automation/activity";
import {
  approvedLoansForTool,
  conflictsWithApproved,
  syncToolAvailability,
} from "./lib/availability";
import { LIMITS } from "./lib/constants";
import {
  daysBetween,
  isIsoDay,
  rangesOverlap,
  todayUtc,
} from "./lib/dates";
import { appError } from "./lib/errors";
import { authedMutation, authedQuery } from "./lib/functions";

async function getLoan(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "This request no longer exists.");
  return loan;
}

function assertLender(loan: Doc<"loans">, userId: Id<"users">) {
  if (loan.lenderId !== userId) {
    throw appError("FORBIDDEN", "Only the tool's owner can do this.");
  }
}

function assertStatus(loan: Doc<"loans">, expected: Doc<"loans">["status"]) {
  // Doubles as protection against double-clicks and stale tabs: a transition
  // that already happened fails here rather than notifying someone twice.
  if (loan.status !== expected) {
    throw appError("CONFLICT", `This request is already ${loan.status}.`);
  }
}

function assertValidRange(startDate: string, endDate: string) {
  if (!isIsoDay(startDate) || !isIsoDay(endDate)) {
    throw appError("INVALID_INPUT", "Choose valid start and end dates.");
  }
  if (startDate < todayUtc()) {
    throw appError("INVALID_INPUT", "The start date can't be in the past.");
  }
  if (endDate < startDate) {
    throw appError("INVALID_INPUT", "The end date can't be before the start date.");
  }
  if (daysBetween(startDate, endDate) >= LIMITS.maxLoanDays) {
    throw appError(
      "INVALID_INPUT",
      `Loans can last up to ${LIMITS.maxLoanDays} days.`,
    );
  }
}

export const request = authedMutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.id("loans"),
  handler: async (ctx, { toolId, startDate, endDate }) => {
    assertValidRange(startDate, endDate);

    const tool = await ctx.db.get(toolId);
    if (!tool || tool.status !== "active") {
      throw appError("NOT_FOUND", "This listing no longer exists.");
    }
    if (tool.ownerId === ctx.user._id) {
      throw appError("FORBIDDEN", "You can't borrow your own tool.");
    }

    const range = { startDate, endDate };
    const approved = await approvedLoansForTool(ctx, toolId);
    if (conflictsWithApproved(range, approved)) {
      throw appError("CONFLICT", "The tool is already booked for those dates.");
    }

    const myPending = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) =>
        q.eq("borrowerId", ctx.user._id).eq("status", "pending"),
      )
      .take(LIMITS.maxOpenRequestsPerUser);
    if (myPending.length >= LIMITS.maxOpenRequestsPerUser) {
      throw appError(
        "LIMIT_REACHED",
        "You have too many open requests. Cancel one to make another.",
      );
    }
    if (
      myPending.some(
        (loan) => loan.toolId === toolId && rangesOverlap(loan, range),
      )
    ) {
      throw appError(
        "CONFLICT",
        "You already asked for this tool on overlapping dates.",
      );
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: ctx.user._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      status: "pending",
    });
    await emitLoanEvent(ctx, {
      type: "request.created",
      loanId,
      recipientId: tool.ownerId,
      actorId: ctx.user._id,
    });
    return loanId;
  },
});

export const approve = authedMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "pending");

    const today = todayUtc();
    if (loan.endDate < today) {
      throw appError(
        "CONFLICT",
        "These dates have passed. Decline this request instead.",
      );
    }
    const approved = await approvedLoansForTool(ctx, loan.toolId);
    if (conflictsWithApproved(loan, approved, today)) {
      throw appError("CONFLICT", "The tool is already booked for those dates.");
    }

    const now = Date.now();
    await ctx.db.patch(loanId, { status: "approved", decidedAt: now });
    await syncToolAvailability(ctx, loan.toolId);
    await emitLoanEvent(ctx, {
      type: "request.approved",
      loanId,
      recipientId: loan.borrowerId,
      actorId: ctx.user._id,
    });

    // Requests for the same dates can no longer be met, so close them now
    // instead of leaving those neighbors waiting.
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_and_status", (q) =>
        q.eq("toolId", loan.toolId).eq("status", "pending"),
      )
      .collect();
    for (const other of pending) {
      if (other._id !== loanId && rangesOverlap(other, loan)) {
        await ctx.db.patch(other._id, { status: "declined", decidedAt: now });
        await emitLoanEvent(ctx, {
          type: "request.declined",
          loanId: other._id,
          recipientId: other.borrowerId,
          actorId: ctx.user._id,
        });
      }
    }
  },
});

export const decline = authedMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "pending");
    await ctx.db.patch(loanId, { status: "declined", decidedAt: Date.now() });
    await emitLoanEvent(ctx, {
      type: "request.declined",
      loanId,
      recipientId: loan.borrowerId,
      actorId: ctx.user._id,
    });
  },
});

export const cancel = authedMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    if (loan.borrowerId !== ctx.user._id) {
      throw appError("FORBIDDEN", "Only the borrower can cancel a request.");
    }
    assertStatus(loan, "pending");
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await emitLoanEvent(ctx, {
      type: "request.cancelled",
      loanId,
      recipientId: loan.lenderId,
      actorId: ctx.user._id,
    });
  },
});

/**
 * Lender only: the person who gets the tool back confirms the return, so a
 * borrower can't close out a loan (and end its reminders) without returning it.
 */
export const markReturned = authedMutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await getLoan(ctx, loanId);
    assertLender(loan, ctx.user._id);
    assertStatus(loan, "approved");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    await syncToolAvailability(ctx, loan.toolId);
    await emitLoanEvent(ctx, {
      type: "loan.returned",
      loanId,
      recipientId: loan.borrowerId,
      actorId: ctx.user._id,
    });
  },
});

async function toPartyView(
  ctx: QueryCtx,
  loan: Doc<"loans">,
  viewerRole: "borrower" | "lender",
) {
  const tool = await ctx.db.get(loan.toolId);
  const counterparty = await ctx.db.get(
    viewerRole === "borrower" ? loan.lenderId : loan.borrowerId,
  );
  return {
    _id: loan._id,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    createdAt: loan._creationTime,
    returnedAt: loan.returnedAt ?? null,
    tool: {
      name: tool?.name ?? "Removed tool",
      category: tool?.category ?? "other",
    },
    counterparty: {
      firstName: counterparty?.firstName ?? "Neighbor",
      trustedLender: counterparty?.trustedLender ?? false,
      // Revealed only once a loan is agreed, and only while it runs: the two
      // neighbors need a way to arrange the hand-over, and nobody else does.
      email: loan.status === "approved" ? (counterparty?.email ?? null) : null,
    },
    activity: await activityForLoan(ctx, loan._id),
  };
}

export const myRequests = authedQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", ctx.user._id))
      .order("desc")
      .take(LIMITS.listPage);
    return Promise.all(loans.map((loan) => toPartyView(ctx, loan, "borrower")));
  },
});

export const incoming = authedQuery({
  args: {},
  handler: async (ctx) => {
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", ctx.user._id))
      .order("desc")
      .take(LIMITS.listPage);
    return Promise.all(loans.map((loan) => toPartyView(ctx, loan, "lender")));
  },
});

/** Drives the count on the "Incoming requests" tab. */
export const incomingPendingCount = authedQuery({
  args: {},
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) =>
        q.eq("lenderId", ctx.user._id).eq("status", "pending"),
      )
      .take(100);
    return pending.length;
  },
});
