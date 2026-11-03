import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { emitLoanEvent } from "./automation/outbox";
import {
  approvedLoansForTool,
} from "./lib/availability";
import {
  categoryValidator,
  conditionValidator,
  LIMITS,
} from "./lib/constants";
import { todayUtc } from "./lib/dates";
import { appError } from "./lib/errors";
import { authedMutation, authedQuery } from "./lib/functions";
import { cleanLine, cleanParagraph } from "./lib/text";

const toolFields = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

function cleanToolFields(args: {
  name: string;
  description: string;
}): { name: string; description: string } {
  return {
    name: cleanLine(args.name, "Name", LIMITS.toolName),
    description: cleanParagraph(
      args.description,
      "Description",
      LIMITS.toolDescription,
    ),
  };
}

async function getOwnedTool(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  userId: Id<"users">,
) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.status !== "active") {
    throw appError("NOT_FOUND", "This listing no longer exists.");
  }
  if (tool.ownerId !== userId) {
    throw appError("FORBIDDEN", "You can only change your own listings.");
  }
  return tool;
}

/**
 * Public, unauthenticated. Returns an allowlist of two fields: the response has
 * no IDs, owner, condition or description, so nothing here can be joined back
 * to a neighbor. The cap bounds what an anonymous caller can make us read.
 */
export const listPublic = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), category: categoryValidator })),
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_status_and_availability", (q) =>
        q.eq("status", "active").eq("availability", "available"),
      )
      .order("desc")
      .take(60);
    return tools.map(({ name, category }) => ({ name, category }));
  },
});

async function toBrowseItem(
  ctx: QueryCtx,
  tool: Doc<"tools">,
  viewerId: Id<"users">,
) {
  const owner = await ctx.db.get(tool.ownerId);
  const today = todayUtc();
  const current =
    tool.availability === "on_loan"
      ? (await approvedLoansForTool(ctx, tool._id)).find(
          (loan) => loan.startDate <= today,
        )
      : undefined;
  return {
    _id: tool._id,
    name: tool.name,
    category: tool.category,
    condition: tool.condition,
    description: tool.description,
    availability: tool.availability,
    // Lets borrowers plan without revealing who currently has the tool.
    dueBack: current?.endDate ?? null,
    isMine: tool.ownerId === viewerId,
    owner: {
      firstName: owner?.firstName ?? "Neighbor",
      trustedLender: owner?.trustedLender ?? false,
    },
  };
}

export const list = authedQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(categoryValidator),
  },
  handler: async (ctx, { paginationOpts, category }) => {
    const page = await ctx.db
      .query("tools")
      .withIndex("by_status_and_category", (q) =>
        category
          ? q.eq("status", "active").eq("category", category)
          : q.eq("status", "active"),
      )
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map((tool) => toBrowseItem(ctx, tool, ctx.user._id)),
      ),
    };
  },
});

export const mine = authedQuery({
  args: {},
  handler: async (ctx) => {
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) =>
        q.eq("ownerId", ctx.user._id).eq("status", "active"),
      )
      .order("desc")
      .take(LIMITS.listPage);
    return Promise.all(tools.map((tool) => toBrowseItem(ctx, tool, ctx.user._id)));
  },
});

/** Booked dates for the request form. Dates only: never who booked them. */
export const bookedRanges = authedQuery({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const today = todayUtc();
    const approved = await approvedLoansForTool(ctx, toolId);
    return approved
      .map((loan) => ({
        startDate: loan.startDate,
        endDate: loan.endDate < today ? today : loan.endDate,
      }))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  },
});

export const create = authedMutation({
  args: toolFields,
  returns: v.id("tools"),
  handler: async (ctx, args) => {
    const owned = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) =>
        q.eq("ownerId", ctx.user._id).eq("status", "active"),
      )
      .take(LIMITS.maxListingsPerUser);
    if (owned.length >= LIMITS.maxListingsPerUser) {
      throw appError(
        "LIMIT_REACHED",
        `You can have up to ${LIMITS.maxListingsPerUser} listings. Remove one to add another.`,
      );
    }
    return ctx.db.insert("tools", {
      ...args,
      ...cleanToolFields(args),
      ownerId: ctx.user._id,
      status: "active",
      availability: "available",
    });
  },
});

export const update = authedMutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...fields }) => {
    await getOwnedTool(ctx, toolId, ctx.user._id);
    await ctx.db.patch(toolId, { ...fields, ...cleanToolFields(fields) });
  },
});

/**
 * Soft-deletes a listing and declines its pending requests. Shared by the owner
 * path and the admin path, which apply different authorization first.
 */
export async function retireTool(
  ctx: MutationCtx,
  tool: Doc<"tools">,
  actorId: Id<"users">,
  removalReason?: string,
) {
  await ctx.db.patch(tool._id, {
    status: "removed",
    removedBy: actorId,
    removalReason,
  });
  const pending = await ctx.db
    .query("loans")
    .withIndex("by_tool_and_status", (q) =>
      q.eq("toolId", tool._id).eq("status", "pending"),
    )
    .collect();
  for (const loan of pending) {
    await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
    await emitLoanEvent(ctx, {
      type: "request.declined",
      loanId: loan._id,
      recipientId: loan.borrowerId,
      actorId,
    });
  }
}

export const remove = authedMutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const tool = await getOwnedTool(ctx, toolId, ctx.user._id);
    const approved = await approvedLoansForTool(ctx, toolId);
    if (approved.length > 0) {
      throw appError(
        "CONFLICT",
        "This tool has an approved loan. Mark it returned before removing the listing.",
      );
    }
    await retireTool(ctx, tool, ctx.user._id);
  },
});
