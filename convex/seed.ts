import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { syncToolAvailability } from "./lib/availability";
import { toIsoDay } from "./lib/dates";

/**
 * Demo data: internal, so it runs only with deployment credentials.
 *   npx convex run seed:demo
 *   npx convex run seed:demo '{"borrowerEmail":"you@example.com"}'
 * Passing your email makes you the borrower on the overdue loan, so the reminder
 * shows up on your own My requests screen. It backdates a loan directly because
 * the public API rightly refuses to create one in the past.
 */

const DAY_MS = 86_400_000;
const dayOffset = (days: number) => toIsoDay(Date.now() + days * DAY_MS);

const DEMO_TOOLS = [
  ["Cordless drill", "power_tools", "good", "18V, two batteries and a charger. Bits not included."],
  ["Orbital sander", "power_tools", "fair", "Works fine. Bring your own sanding discs."],
  ["Extension ladder", "hand_tools", "good", "6 m aluminum. You'll need a car with roof bars."],
  ["Hedge trimmer", "garden", "like_new", "Electric, used twice. Comes with a blade guard."],
  ["Wheelbarrow", "garden", "worn", "Rusty but solid. The tire holds air for about a day."],
  ["Stand mixer", "kitchen", "good", "5 qt with dough hook and whisk."],
  ["Four-person tent", "camping", "good", "Dry and clean, with all its pegs."],
  ["Pressure washer", "cleaning", "good", "Needs a garden hose connection."],
  ["Socket set", "automotive", "like_new", "Metric, 40 pieces, in its case."],
] as const;

async function demoUser(ctx: MutationCtx, firstName: string) {
  const email = `${firstName.toLowerCase()}@demo.lendloop.local`;
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (existing) return existing._id;
  return ctx.db.insert("users", {
    tokenIdentifier: `seed|${firstName}`,
    firstName,
    email,
    role: "user",
    trustedLender: firstName === "Priya",
  });
}

export const demo = internalMutation({
  args: { borrowerEmail: v.optional(v.string()) },
  handler: async (ctx, { borrowerEmail }) => {
    const priya = await demoUser(ctx, "Priya");
    const marcus = await demoUser(ctx, "Marcus");

    let borrowerId: Id<"users"> = marcus;
    if (borrowerEmail) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", borrowerEmail))
        .first();
      if (!user) throw new Error("No such user. Sign in once first.");
      borrowerId = user._id;
    }

    // Re-running reuses the demo tools, and only adds another overdue loan.
    const priyasTools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", priya).eq("status", "active"))
      .collect();
    let ladder = priyasTools.find((tool) => tool.name === "Extension ladder")?._id;
    if (!ladder) {
      for (const [index, [name, category, condition, description]] of DEMO_TOOLS.entries()) {
        const toolId = await ctx.db.insert("tools", {
          ownerId: index % 2 === 0 ? priya : marcus,
          name,
          category,
          condition,
          description,
          status: "active",
          availability: "available",
        });
        if (name === "Extension ladder") ladder = toolId;
      }
    }

    // The ladder belongs to Priya and is overdue, ready for the reminder workflow.
    const overdueLoan = await ctx.db.insert("loans", {
      toolId: ladder!,
      borrowerId,
      lenderId: priya,
      startDate: dayOffset(-6),
      endDate: dayOffset(-2),
      status: "approved",
      decidedAt: Date.now() - 6 * DAY_MS,
    });
    await syncToolAvailability(ctx, ladder!);

    return { overdueLoan };
  },
});
