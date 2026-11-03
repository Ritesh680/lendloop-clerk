import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { dayOffset, member, setup, toolInput } from "./helpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function scenario() {
  const t = setup();
  const owner = await member(t, "Olive");
  const ben = await member(t, "Ben");
  const cora = await member(t, "Cora");
  const toolId = await owner.as.mutation(api.tools.create, toolInput);
  return { t, owner, ben, cora, toolId };
}

describe("date validation", () => {
  test.each([
    ["past start", dayOffset(-1), dayOffset(1), /in the past/],
    ["end before start", dayOffset(3), dayOffset(2), /before the start/],
    ["too long", dayOffset(1), dayOffset(90), /up to 60 days/],
    ["impossible date", "2031-02-31", "2031-03-01", /valid/],
    ["not a date", "soon", "later", /valid/],
  ])("rejects %s", async (_label, startDate, endDate, message) => {
    const { ben, toolId } = await scenario();
    await expect(
      ben.as.mutation(api.loans.request, { toolId, startDate, endDate }),
    ).rejects.toThrow(message);
  });
});

describe("lifecycle", () => {
  test("approve then return restores availability", async () => {
    const { t, owner, ben, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(0),
      endDate: dayOffset(1),
    });

    await owner.as.mutation(api.loans.approve, { loanId });
    const availability = () =>
      t.run(async (ctx) => (await ctx.db.get(toolId))?.availability);
    expect(await availability()).toBe("on_loan");

    await owner.as.mutation(api.loans.markReturned, { loanId });
    expect(await availability()).toBe("available");
  });

  test("a loan starting later keeps the tool available until the cron flips it", async () => {
    const { t, owner, ben, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(2),
      endDate: dayOffset(3),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    const availability = () =>
      t.run(async (ctx) => (await ctx.db.get(toolId))?.availability);
    expect(await availability()).toBe("available");

    vi.advanceTimersByTime(2 * 86_400_000);
    await t.mutation(internal.automation.inbound.refreshAvailability);
    expect(await availability()).toBe("on_loan");
  });

  test("a stale double-click cannot replay a transition", async () => {
    const { owner, ben, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(owner.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/already approved/);
    await expect(owner.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/already approved/);
  });

  test("approving declines overlapping requests but not others", async () => {
    const { owner, ben, cora, toolId } = await scenario();
    const winner = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(3),
    });
    const overlapping = await cora.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(3),
      endDate: dayOffset(4),
    });
    const later = await cora.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(10),
      endDate: dayOffset(11),
    });

    await owner.as.mutation(api.loans.approve, { loanId: winner });

    const statuses = Object.fromEntries(
      (await cora.as.query(api.loans.myRequests)).map((l) => [l._id, l.status]),
    );
    expect(statuses[overlapping]).toBe("declined");
    expect(statuses[later]).toBe("pending");
  });

  test("new requests cannot overlap an approved loan", async () => {
    const { owner, ben, cora, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(3),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(
      cora.as.mutation(api.loans.request, {
        toolId,
        startDate: dayOffset(2),
        endDate: dayOffset(5),
      }),
    ).rejects.toThrow(/already booked/);
  });

  test("an overdue, unreturned tool still blocks today's bookings", async () => {
    const { owner, ben, cora, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(0),
      endDate: dayOffset(1),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    vi.advanceTimersByTime(5 * 86_400_000);

    await expect(
      cora.as.mutation(api.loans.request, {
        toolId,
        startDate: dayOffset(0),
        endDate: dayOffset(1),
      }),
    ).rejects.toThrow(/already booked/);
  });

  test("a borrower cannot file duplicate overlapping requests", async () => {
    const { ben, toolId } = await scenario();
    const args = { toolId, startDate: dayOffset(1), endDate: dayOffset(2) };
    await ben.as.mutation(api.loans.request, args);
    await expect(ben.as.mutation(api.loans.request, args)).rejects.toThrow(/overlapping/);
  });

  test("an owner cannot delete a listing with an approved loan", async () => {
    const { owner, ben, toolId } = await scenario();
    const loanId = await ben.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(owner.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/Mark it returned/);
  });
});

describe("input validation", () => {
  test("rejects a newline in a tool name, which would reach email subjects", async () => {
    const { owner } = await scenario();
    await expect(
      owner.as.mutation(api.tools.create, {
        ...toolInput,
        name: "Drill\nBcc: everyone@example.com",
      }),
    ).rejects.toThrow(/invalid characters/);
  });

  test("rejects blank and oversized fields", async () => {
    const { owner } = await scenario();
    await expect(
      owner.as.mutation(api.tools.create, { ...toolInput, name: "   " }),
    ).rejects.toThrow(/required/);
    await expect(
      owner.as.mutation(api.tools.create, {
        ...toolInput,
        description: "x".repeat(501),
      }),
    ).rejects.toThrow(/500 characters/);
  });
});
