import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { dayOffset, member, setup, toolInput } from "./helpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("public access", () => {
  test("public list exposes only name and category", async () => {
    const t = setup();
    const owner = await member(t, "Olive");
    await owner.as.mutation(api.tools.create, toolInput);

    const tools = await t.query(api.tools.listPublic);

    expect(tools).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
  });

  test("public list hides tools that are on loan or removed", async () => {
    const t = setup();
    const owner = await member(t, "Olive");
    const borrower = await member(t, "Ben");
    const lent = await owner.as.mutation(api.tools.create, toolInput);
    const gone = await owner.as.mutation(api.tools.create, {
      ...toolInput,
      name: "Old saw",
    });
    const loanId = await borrower.as.mutation(api.loans.request, {
      toolId: lent,
      startDate: dayOffset(0),
      endDate: dayOffset(1),
    });
    await owner.as.mutation(api.loans.approve, { loanId });
    await owner.as.mutation(api.tools.remove, { toolId: gone });

    expect(await t.query(api.tools.listPublic)).toEqual([]);
  });

  test.each([
    ["list tool", (c: ReturnType<typeof setup>) => c.mutation(api.tools.create, toolInput)],
    ["my listings", (c: ReturnType<typeof setup>) => c.query(api.tools.mine)],
    ["my requests", (c: ReturnType<typeof setup>) => c.query(api.loans.myRequests)],
    ["all loans", (c: ReturnType<typeof setup>) =>
      c.query(api.admin.listLoans, { paginationOpts: { numItems: 5, cursor: null } })],
  ])("anonymous caller is rejected: %s", async (_label, call) => {
    await expect(call(setup())).rejects.toThrow(/Sign in/);
  });
});

describe("listing ownership", () => {
  test("users cannot edit or delete someone else's listing", async () => {
    const t = setup();
    const owner = await member(t, "Olive");
    const other = await member(t, "Mallory");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);

    await expect(
      other.as.mutation(api.tools.update, { toolId, ...toolInput, name: "Hacked" }),
    ).rejects.toThrow(/your own listings/);
    await expect(
      other.as.mutation(api.tools.remove, { toolId }),
    ).rejects.toThrow(/your own listings/);
  });

  test("an admin cannot edit a listing through the owner path", async () => {
    const t = setup();
    const owner = await member(t, "Olive");
    const admin = await member(t, "Ada", "admin");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);

    await expect(
      admin.as.mutation(api.tools.update, { toolId, ...toolInput, name: "Edited" }),
    ).rejects.toThrow(/your own listings/);
  });
});

describe("request actions", () => {
  async function pendingLoan() {
    const t = setup();
    const owner = await member(t, "Olive");
    const borrower = await member(t, "Ben");
    const stranger = await member(t, "Mallory");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);
    const loanId = await borrower.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });
    return { t, owner, borrower, stranger, toolId, loanId };
  }

  test("only the lender can approve, decline or mark returned", async () => {
    const { stranger, borrower, owner, loanId } = await pendingLoan();
    for (const actor of [stranger, borrower]) {
      await expect(actor.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/owner/);
      await expect(actor.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/owner/);
    }
    await owner.as.mutation(api.loans.approve, { loanId });
    await expect(
      borrower.as.mutation(api.loans.markReturned, { loanId }),
    ).rejects.toThrow(/owner/);
  });

  test("only the borrower can cancel", async () => {
    const { owner, stranger, loanId } = await pendingLoan();
    await expect(owner.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/borrower/);
    await expect(stranger.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/borrower/);
  });

  test("an admin has no authority over other people's requests", async () => {
    const { t, loanId } = await pendingLoan();
    const admin = await member(t, "Ada", "admin");
    await expect(admin.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/owner/);
  });

  test("users cannot borrow their own tool", async () => {
    const { owner, toolId } = await pendingLoan();
    await expect(
      owner.as.mutation(api.loans.request, {
        toolId,
        startDate: dayOffset(5),
        endDate: dayOffset(6),
      }),
    ).rejects.toThrow(/your own tool/);
  });

  test("request lists show only the caller's own loans", async () => {
    const { stranger, borrower, owner } = await pendingLoan();
    expect(await stranger.as.query(api.loans.myRequests)).toEqual([]);
    expect(await stranger.as.query(api.loans.incoming)).toEqual([]);
    expect(await borrower.as.query(api.loans.myRequests)).toHaveLength(1);
    expect(await owner.as.query(api.loans.incoming)).toHaveLength(1);
  });

  test("email is hidden until approved and hidden again after return", async () => {
    const { owner, borrower, loanId } = await pendingLoan();
    const email = async () =>
      (await borrower.as.query(api.loans.myRequests))[0].counterparty.email;

    expect(await email()).toBeNull();
    await owner.as.mutation(api.loans.approve, { loanId });
    expect(await email()).toBe("olive@example.com");
    await owner.as.mutation(api.loans.markReturned, { loanId });
    expect(await email()).toBeNull();
  });
});

describe("admin", () => {
  const page = { paginationOpts: { numItems: 10, cursor: null } };

  test("non-admins are refused every admin function", async () => {
    const t = setup();
    const user = await member(t, "Mallory");
    const owner = await member(t, "Olive");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);

    await expect(user.as.query(api.admin.listLoans, page)).rejects.toThrow(/admins only/);
    await expect(user.as.query(api.admin.listMembers)).rejects.toThrow(/admins only/);
    await expect(user.as.query(api.admin.automationHealth)).rejects.toThrow(/admins only/);
    await expect(
      user.as.mutation(api.admin.removeListing, { toolId, reason: "x" }),
    ).rejects.toThrow(/admins only/);
    await expect(
      user.as.mutation(api.admin.setTrustedLender, { userId: user.id, trusted: true }),
    ).rejects.toThrow(/admins only/);
  });

  test("admin can remove any listing, which declines its pending requests", async () => {
    const t = setup();
    const admin = await member(t, "Ada", "admin");
    const owner = await member(t, "Olive");
    const borrower = await member(t, "Ben");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);
    await borrower.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });

    await admin.as.mutation(api.admin.removeListing, { toolId, reason: "Unsafe" });

    expect(await t.query(api.tools.listPublic)).toEqual([]);
    const [loan] = await borrower.as.query(api.loans.myRequests);
    expect(loan.status).toBe("declined");
  });

  test("admin can mark a trusted lender, visible to other members", async () => {
    const t = setup();
    const admin = await member(t, "Ada", "admin");
    const owner = await member(t, "Olive");
    await owner.as.mutation(api.tools.create, toolInput);

    await admin.as.mutation(api.admin.setTrustedLender, {
      userId: owner.id,
      trusted: true,
    });

    const { page: tools } = await admin.as.query(api.tools.list, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(tools[0].owner.trustedLender).toBe(true);
  });

  test("admin member list masks email addresses", async () => {
    const t = setup();
    const admin = await member(t, "Ada", "admin");
    const [row] = await admin.as.query(api.admin.listMembers);
    expect(row.maskedEmail).toBe("a***@example.com");
    expect(row).not.toHaveProperty("email");
  });

  test("profile sync cannot change a role", async () => {
    const t = setup();
    const user = await member(t, "Mallory");
    await user.as.mutation(api.users.ensureCurrentUser);
    expect((await user.as.query(api.users.me))?.role).toBe("user");
  });

  test("role changes go through the internal function only", async () => {
    const t = setup();
    const user = await member(t, "Ben");
    await t.mutation(internal.admin.setRoleByEmail, {
      email: "ben@example.com",
      role: "admin",
    });
    expect((await user.as.query(api.users.me))?.role).toBe("admin");
    // Takes effect immediately in both directions, as the role is read per call.
    await t.mutation(internal.admin.setRoleByEmail, {
      email: "ben@example.com",
      role: "user",
    });
    await expect(user.as.query(api.admin.listMembers)).rejects.toThrow(/admins only/);
  });
});
