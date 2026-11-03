import {
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { Doc } from "../_generated/dataModel";
import { mutation, query, type QueryCtx } from "../_generated/server";
import { appError } from "./errors";

/**
 * Authorization lives here, not in the UI.
 *
 * Feature modules build public functions from these wrappers, which resolve
 * the caller from the verified JWT and inject `ctx.user`. Identity is never
 * accepted as an argument, so a client cannot claim to be someone else, and the
 * role is read from the database on each call so a revocation applies at once.
 */
export async function requireUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier),
    )
    .unique();
  if (!user) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  return user;
}

export async function requireAdmin(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") {
    throw appError("FORBIDDEN", "This action is for admins only.");
  }
  return user;
}

const withUser = customCtx(async (ctx: QueryCtx) => ({
  user: await requireUser(ctx),
}));
const withAdmin = customCtx(async (ctx: QueryCtx) => ({
  user: await requireAdmin(ctx),
}));

export const authedQuery = customQuery(query, withUser);
export const authedMutation = customMutation(mutation, withUser);
export const adminQuery = customQuery(query, withAdmin);
export const adminMutation = customMutation(mutation, withAdmin);
