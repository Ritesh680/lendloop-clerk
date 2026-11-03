import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError } from "./lib/errors";

/**
 * Creates or refreshes the caller's profile from their verified JWT claims.
 * It takes no arguments on purpose. Role and trusted status are never written
 * from here except for the safe defaults on first insert.
 */
export const ensureCurrentUser = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");

    const firstName =
      (identity.givenName ?? identity.name ?? "").trim().split(/\s+/)[0] ||
      "Neighbor";
    // An unverified address must not receive mail or match an admin grant.
    const email =
      identity.emailVerified === false ? undefined : identity.email;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      if (existing.firstName !== firstName || existing.email !== email) {
        await ctx.db.patch(existing._id, { firstName, email });
      }
      return existing._id;
    }

    return ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      firstName,
      email,
      role: "user",
      trustedLender: false,
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    return {
      id: user._id,
      firstName: user.firstName,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});
