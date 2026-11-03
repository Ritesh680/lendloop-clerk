import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../_generated/server";
import type { NotificationEvent } from "../lib/constants";
import {
  canonicalString,
  signPayload,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "../lib/hmac";

/**
 * Convex -> n8n delivery, built as a transactional outbox.
 *
 * emitLoanEvent runs inside the mutation that changes the loan, so the status
 * change and the intent to notify commit together or not at all. Delivery is
 * at-least-once: failures back off and retry, a cron recovers lost scheduled
 * jobs, and exhausted rows surface on the admin screen rather than vanishing.
 */

export const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 30_000;
/** Longer than the request timeout, so a live attempt is never run twice. */
const LEASE_MS = 60_000;
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000];

export const backoffFor = (attempts: number) =>
  BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];

export async function emitLoanEvent(
  ctx: MutationCtx,
  event: {
    type: NotificationEvent;
    loanId: Id<"loans">;
    recipientId: Id<"users">;
    actorId: Id<"users">;
  },
) {
  const outboxId = await ctx.db.insert("notificationOutbox", {
    ...event,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.automation.outbox.deliver, {
    outboxId,
  });
}

/**
 * Atomically takes a lease on a row and returns what to send. Mutations are
 * serialized, so concurrent callers (a retry and the sweep cron, say) can't
 * both win. The payload is an allowlist: the workflow gets what it needs to
 * write one email and nothing else.
 */
export const claim = internalMutation({
  args: { outboxId: v.id("notificationOutbox") },
  handler: async (ctx, { outboxId }) => {
    const row = await ctx.db.get(outboxId);
    const now = Date.now();
    if (
      !row ||
      row.status !== "pending" ||
      row.nextAttemptAt > now ||
      (row.lockedUntil ?? 0) > now
    ) {
      return null;
    }

    const [loan, recipient, actor] = await Promise.all([
      ctx.db.get(row.loanId),
      ctx.db.get(row.recipientId),
      ctx.db.get(row.actorId),
    ]);
    const tool = loan ? await ctx.db.get(loan.toolId) : null;

    // Retrying can't fix these, so fail now rather than burn the backoff.
    if (!loan || !tool || !recipient?.email) {
      await ctx.db.patch(outboxId, {
        status: "failed",
        failedAt: now,
        lastError: recipient?.email ? "loan_missing" : "recipient_has_no_email",
      });
      return null;
    }

    await ctx.db.patch(outboxId, {
      attempts: row.attempts + 1,
      lockedUntil: now + LEASE_MS,
    });

    return {
      eventId: outboxId as string,
      type: row.type,
      recipient: { email: recipient.email, firstName: recipient.firstName },
      actorFirstName: actor?.firstName ?? "A neighbor",
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

/** Idempotent: an n8n ack and the HTTP 200 for the same event may both arrive. */
export async function applyDelivered(
  ctx: MutationCtx,
  outboxId: Id<"notificationOutbox">,
): Promise<"recorded" | "duplicate" | "unknown_event"> {
  const row = await ctx.db.get(outboxId);
  if (!row) return "unknown_event";
  if (row.status === "delivered") return "duplicate";
  await ctx.db.patch(outboxId, {
    status: "delivered",
    deliveredAt: Date.now(),
    lockedUntil: undefined,
    lastError: undefined,
    failedAt: undefined,
  });
  return "recorded";
}

export const markDelivered = internalMutation({
  args: { outboxId: v.id("notificationOutbox") },
  handler: async (ctx, { outboxId }) => {
    await applyDelivered(ctx, outboxId);
  },
});

export const recordFailure = internalMutation({
  args: { outboxId: v.id("notificationOutbox"), error: v.string() },
  handler: async (ctx, { outboxId, error }) => {
    const row = await ctx.db.get(outboxId);
    if (!row || row.status !== "pending") return;
    const now = Date.now();
    if (row.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(outboxId, {
        status: "failed",
        failedAt: now,
        lastError: error,
        lockedUntil: undefined,
      });
      return;
    }
    const delay = backoffFor(row.attempts);
    await ctx.db.patch(outboxId, {
      nextAttemptAt: now + delay,
      lastError: error,
      lockedUntil: undefined,
    });
    await ctx.scheduler.runAfter(delay, internal.automation.outbox.deliver, {
      outboxId,
    });
  },
});

export const deliver = internalAction({
  args: { outboxId: v.id("notificationOutbox") },
  handler: async (ctx, { outboxId }) => {
    const payload = await ctx.runMutation(internal.automation.outbox.claim, {
      outboxId,
    });
    if (!payload) return;

    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.CONVEX_TO_N8N_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.automation.outbox.recordFailure, {
        outboxId,
        error: "integration_not_configured",
      });
      return;
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await signPayload(
      secret,
      canonicalString({
        timestamp,
        method: "POST",
        path: new URL(url).pathname,
        body,
      }),
    );

    let error: string;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        await ctx.runMutation(internal.automation.outbox.markDelivered, {
          outboxId,
        });
        return;
      }
      // Status code only. A response body could echo the payload into our DB.
      error = `http_${response.status}`;
    } catch (cause) {
      error =
        cause instanceof Error && cause.name === "TimeoutError"
          ? "timeout"
          : "network_error";
    }
    await ctx.runMutation(internal.automation.outbox.recordFailure, {
      outboxId,
      error,
    });
  },
});

/**
 * Safety net: Convex runs scheduled actions at most once, so a job lost to a
 * restart would otherwise leave its row pending forever. Claiming is what stops
 * this from double-sending alongside a normal retry.
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("notificationOutbox")
      .withIndex("by_status_and_nextAttemptAt", (q) =>
        q.eq("status", "pending").lte("nextAttemptAt", now),
      )
      .take(50);
    for (const row of due) {
      if ((row.lockedUntil ?? 0) <= now) {
        await ctx.scheduler.runAfter(0, internal.automation.outbox.deliver, {
          outboxId: row._id,
        });
      }
    }
  },
});
