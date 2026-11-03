import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  notificationEventValidator,
} from "./lib/constants";

export default defineSchema({
  // Data minimization: first name and email only. No avatar, surname or phone.
  users: defineTable({
    tokenIdentifier: v.string(),
    firstName: v.string(),
    email: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("user")),
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    // Soft delete: loans still in progress need the tool's name after removal.
    status: v.union(v.literal("active"), v.literal("removed")),
    removedBy: v.optional(v.id("users")),
    removalReason: v.optional(v.string()),
    // Denormalized and kept current by lib/availability.ts, so the public list
    // is one index read rather than a scan of every tool's loans.
    availability: v.union(v.literal("available"), v.literal("on_loan")),
  })
    .index("by_status_and_availability", ["status", "availability"])
    .index("by_status_and_category", ["status", "category"])
    .index("by_owner", ["ownerId", "status"]),

  // One row per borrow request, from "pending" through to "returned".
  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_tool_and_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId", "status"])
    .index("by_lender", ["lenderId", "status"])
    .index("by_status_and_endDate", ["status", "endDate"])
    .index("by_status_and_startDate", ["status", "startDate"]),

  // Transactional outbox for Convex -> n8n. Rows hold references, not PII: the
  // payload is built at send time from current data and never stored.
  notificationOutbox: defineTable({
    type: notificationEventValidator,
    loanId: v.id("loans"),
    recipientId: v.id("users"),
    actorId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lockedUntil: v.optional(v.number()),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
  })
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"])
    .index("by_loan", ["loanId"]),

  // Overdue reminder ledger. (loanId, reminderDate) is the idempotency key: at
  // most one reminder per loan per day, however often n8n retries.
  reminders: defineTable({
    loanId: v.id("loans"),
    reminderDate: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    updatedAt: v.number(),
  }).index("by_loan_and_date", ["loanId", "reminderDate"]),

  // Failed n8n runs reported by its error workflow, deduplicated by execution.
  workflowFailures: defineTable({
    executionId: v.string(),
    workflowName: v.string(),
    nodeName: v.string(),
    message: v.string(),
    occurredAt: v.number(),
    acknowledgedAt: v.optional(v.number()),
  })
    .index("by_execution", ["executionId"])
    .index("by_acknowledged", ["acknowledgedAt", "occurredAt"]),

  // Dead-man's switch: a scheduler that stops running raises no error of its
  // own, so the admin screen flags this timestamp when it goes stale.
  integrationHeartbeats: defineTable({
    name: v.string(),
    lastSeenAt: v.number(),
  }).index("by_name", ["name"]),
});
