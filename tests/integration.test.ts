import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import {
  canonicalString,
  signPayload,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "../convex/lib/hmac";
import { MAX_ATTEMPTS } from "../convex/automation/outbox";
import { dayOffset, type Harness, member, setup, toolInput } from "./helpers";

const IN_SECRET = "n8n-to-convex-test-secret";
const OUT_SECRET = "convex-to-n8n-test-secret";
const WEBHOOK = "http://n8n.test/webhook/lendloop-request-event";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("N8N_TO_CONVEX_SECRET", IN_SECRET);
  vi.stubEnv("CONVEX_TO_N8N_SECRET", OUT_SECRET);
  vi.stubEnv("N8N_REQUEST_WEBHOOK_URL", WEBHOOK);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Calls a route the way n8n does, with a correct signature by default. */
async function signedFetch(
  t: Harness,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
  overrides: { secret?: string; timestamp?: string; signedPath?: string } = {},
) {
  const body = data === undefined ? "" : JSON.stringify(data);
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signature = await signPayload(
    overrides.secret ?? IN_SECRET,
    canonicalString({
      timestamp,
      method,
      path: overrides.signedPath ?? path,
      body,
    }),
  );
  return t.fetch(path, {
    method,
    headers: { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
    ...(body ? { body } : {}),
  });
}

async function overdueLoan() {
  const t = setup();
  const owner = await member(t, "Olive");
  const borrower = await member(t, "Ben");
  const toolId = await owner.as.mutation(api.tools.create, toolInput);
  const loanId = await borrower.as.mutation(api.loans.request, {
    toolId,
    startDate: dayOffset(0),
    endDate: dayOffset(1),
  });
  await owner.as.mutation(api.loans.approve, { loanId });
  vi.advanceTimersByTime(3 * 86_400_000);
  return { t, owner, borrower, toolId, loanId };
}

describe("signature verification", () => {
  const base = { method: "POST", path: "/x", body: "{}" };
  const now = 1_800_000_000_000;
  const timestamp = String(now / 1000);
  const sign = (over: Partial<typeof base> = {}) =>
    signPayload(
      "secret",
      canonicalString({ timestamp, ...base, ...over }),
    );

  test("accepts a valid signature", async () => {
    const signature = await sign();
    expect(
      await verifySignature({ ...base, secret: "secret", timestamp, signature, nowMs: now }),
    ).toEqual({ ok: true });
  });

  test("rejects a tampered body, a different path, and the wrong secret", async () => {
    const signature = await sign();
    const check = (over: object) =>
      verifySignature({ ...base, secret: "secret", timestamp, signature, nowMs: now, ...over });
    expect(await check({ body: '{"evil":1}' })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await check({ path: "/y" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await check({ method: "GET" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await check({ secret: "other" })).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("rejects replayed, future-dated, missing and malformed values", async () => {
    const signature = await sign();
    const check = (over: object) =>
      verifySignature({ ...base, secret: "secret", timestamp, signature, nowMs: now, ...over });
    expect(await check({ nowMs: now + 301_000 })).toEqual({ ok: false, reason: "stale" });
    expect(await check({ nowMs: now - 301_000 })).toEqual({ ok: false, reason: "stale" });
    expect(await check({ signature: null })).toEqual({ ok: false, reason: "missing" });
    expect(await check({ timestamp: null })).toEqual({ ok: false, reason: "missing" });
    expect(await check({ timestamp: "soon" })).toEqual({ ok: false, reason: "stale" });
    expect(await check({ signature: "v1=zz" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await check({ signature: "abc" })).toEqual({ ok: false, reason: "bad_signature" });
  });
});

describe("HTTP routes", () => {
  test("every route refuses an unsigned request", async () => {
    const t = setup();
    for (const [method, path] of [
      ["GET", "/n8n/overdue-loans"],
      ["POST", "/n8n/reminder-status"],
      ["POST", "/n8n/notification-status"],
      ["POST", "/n8n/workflow-failure"],
    ] as const) {
      const response = await t.fetch(path, {
        method,
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      expect(response.status).toBe(401);
    }
  });

  test("refuses the wrong secret, the outbound secret, a stale time, another path", async () => {
    const { t } = await overdueLoan();
    const path = "/n8n/overdue-loans";
    expect((await signedFetch(t, "GET", path, undefined, { secret: "nope" })).status).toBe(401);
    // Each direction has its own key, so one leaking doesn't expose the other.
    expect((await signedFetch(t, "GET", path, undefined, { secret: OUT_SECRET })).status).toBe(401);
    expect(
      (
        await signedFetch(t, "GET", path, undefined, {
          timestamp: String(Math.floor(Date.now() / 1000) - 3600),
        })
      ).status,
    ).toBe(401);
    expect(
      (await signedFetch(t, "GET", path, undefined, { signedPath: "/n8n/reminder-status" })).status,
    ).toBe(401);
  });

  test("fails closed when the secret isn't configured", async () => {
    const t = setup();
    vi.stubEnv("N8N_TO_CONVEX_SECRET", "");
    const response = await signedFetch(t, "GET", "/n8n/overdue-loans");
    expect(response.status).toBe(503);
  });

  test("rejects a malformed body and unknown fields", async () => {
    const { t, loanId } = await overdueLoan();
    const path = "/n8n/reminder-status";
    const bad = [
      { loanId, reminderDate: "not-a-day", status: "sent" },
      { loanId, reminderDate: dayOffset(0), status: "weird" },
      { loanId, reminderDate: dayOffset(0), status: "sent", extra: 1 },
    ];
    for (const body of bad) {
      expect((await signedFetch(t, "POST", path, body)).status).toBe(400);
    }
  });
});

describe("overdue reminders", () => {
  test("returns only the fields a reminder needs", async () => {
    const { t, loanId } = await overdueLoan();
    const response = await signedFetch(t, "GET", "/n8n/overdue-loans");
    expect(response.status).toBe(200);
    const { loans } = await response.json();
    expect(loans).toEqual([
      {
        loanId,
        reminderDate: dayOffset(0),
        borrowerEmail: "ben@example.com",
        borrowerFirstName: "Ben",
        toolName: "Cordless drill",
        dueDate: dayOffset(-2),
        daysOverdue: 2,
      },
    ]);
  });

  test("excludes loans that are not yet due or already returned", async () => {
    const { t, owner, loanId } = await overdueLoan();
    await owner.as.mutation(api.loans.markReturned, { loanId });
    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toEqual([]);
  });

  test("records a heartbeat so a silent scheduler becomes visible", async () => {
    const t = setup();
    const admin = await member(t, "Ada", "admin");
    expect((await admin.as.query(api.admin.automationHealth)).lastOverdueSweepAt).toBeNull();
    await signedFetch(t, "GET", "/n8n/overdue-loans");
    expect((await admin.as.query(api.admin.automationHealth)).lastOverdueSweepAt).toBe(Date.now());
  });

  test("a retried write-back creates one record, and the loan drops off the list", async () => {
    const { t, loanId } = await overdueLoan();
    const body = { loanId, reminderDate: dayOffset(0), status: "sent" };
    const path = "/n8n/reminder-status";

    const first = await (await signedFetch(t, "POST", path, body)).json();
    const second = await (await signedFetch(t, "POST", path, body)).json();

    expect(first.result).toBe("recorded");
    expect(second.result).toBe("duplicate");
    expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toHaveLength(1);
    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toEqual([]);
  });

  test("a failed send stays eligible, then upgrades to sent, and sent is terminal", async () => {
    const { t, loanId } = await overdueLoan();
    const path = "/n8n/reminder-status";
    const reminderDate = dayOffset(0);

    await signedFetch(t, "POST", path, { loanId, reminderDate, status: "failed" });
    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toHaveLength(1);

    await signedFetch(t, "POST", path, { loanId, reminderDate, status: "sent" });
    const late = await signedFetch(t, "POST", path, { loanId, reminderDate, status: "failed" });
    expect((await late.json()).result).toBe("duplicate");

    const rows = await t.run((ctx) => ctx.db.query("reminders").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("sent");
  });

  test("the loan is reminded again on the next day", async () => {
    const { t, loanId } = await overdueLoan();
    await signedFetch(t, "POST", "/n8n/reminder-status", {
      loanId,
      reminderDate: dayOffset(0),
      status: "sent",
    });
    vi.advanceTimersByTime(86_400_000);
    const { loans } = await (await signedFetch(t, "GET", "/n8n/overdue-loans")).json();
    expect(loans).toHaveLength(1);
  });

  test("reminders appear in the loan's activity for both parties", async () => {
    const { t, borrower, owner, loanId } = await overdueLoan();
    await signedFetch(t, "POST", "/n8n/reminder-status", {
      loanId,
      reminderDate: dayOffset(0),
      status: "sent",
    });
    const [asBorrower] = await borrower.as.query(api.loans.myRequests);
    const [asOwner] = await owner.as.query(api.loans.incoming);
    for (const loan of [asBorrower, asOwner]) {
      expect(loan.activity).toContainEqual(
        expect.objectContaining({ kind: "reminder", state: "sent" }),
      );
    }
  });

  test("an unknown or malformed loan is a 404, not a crash or a stray record", async () => {
    const t = setup();
    const response = await signedFetch(t, "POST", "/n8n/reminder-status", {
      loanId: "not-a-real-id",
      reminderDate: dayOffset(0),
      status: "sent",
    });
    expect(response.status).toBe(404);
    expect(await t.run((ctx) => ctx.db.query("reminders").collect())).toEqual([]);
  });
});

describe("workflow failures", () => {
  const failure = {
    executionId: "exec-1",
    workflowName: "Overdue reminders",
    nodeName: "Send reminder",
    message: "SMTP refused ben@example.com",
  };

  test("deduplicates by execution and scrubs email addresses", async () => {
    const t = setup();
    const admin = await member(t, "Ada", "admin");
    await signedFetch(t, "POST", "/n8n/workflow-failure", failure);
    await signedFetch(t, "POST", "/n8n/workflow-failure", failure);

    const { workflowFailures } = await admin.as.query(api.admin.automationHealth);
    expect(workflowFailures).toHaveLength(1);
    expect(workflowFailures[0].message).toBe("SMTP refused [email]");
  });
});

describe("notification outbox", () => {
  async function createdRequest() {
    const t = setup();
    const owner = await member(t, "Olive");
    const borrower = await member(t, "Ben");
    const toolId = await owner.as.mutation(api.tools.create, toolInput);
    const loanId = await borrower.as.mutation(api.loans.request, {
      toolId,
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });
    const row = await t.run(async (ctx) =>
      (await ctx.db.query("notificationOutbox").collect()).find(
        (r) => r.loanId === loanId,
      ),
    );
    return { t, owner, borrower, loanId, outboxId: row!._id };
  }

  const getRow = (t: Harness, outboxId: Awaited<ReturnType<typeof createdRequest>>["outboxId"]) =>
    t.run((ctx) => ctx.db.get(outboxId));

  test("a status change and its event commit together", async () => {
    const { t, owner, loanId } = await createdRequest();
    await owner.as.mutation(api.loans.decline, { loanId });
    const rows = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(rows.map((r) => r.type).sort()).toEqual(["request.created", "request.declined"]);
  });

  test("a rejected mutation emits nothing", async () => {
    const { t, borrower, loanId } = await createdRequest();
    await expect(borrower.as.mutation(api.loans.approve, { loanId })).rejects.toThrow();
    const rows = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(rows).toHaveLength(1);
  });

  test("sends a signed, minimal payload that the receiver can verify", async () => {
    const { t, outboxId } = await createdRequest();
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.automation.outbox.deliver, { outboxId });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    const body = init.body as string;
    const headers = init.headers as Record<string, string>;
    expect(JSON.parse(body)).toEqual({
      eventId: outboxId,
      type: "request.created",
      recipient: { email: "olive@example.com", firstName: "Olive" },
      actorFirstName: "Ben",
      toolName: "Cordless drill",
      startDate: dayOffset(1),
      endDate: dayOffset(2),
    });
    expect(
      await verifySignature({
        secret: OUT_SECRET,
        timestamp: headers[TIMESTAMP_HEADER],
        signature: headers[SIGNATURE_HEADER],
        method: "POST",
        path: "/webhook/lendloop-request-event",
        body,
      }),
    ).toEqual({ ok: true });
    expect((await getRow(t, outboxId))?.status).toBe("delivered");
  });

  test("backs off on failure, keeps the status code, and never stores the response", async () => {
    const { t, outboxId } = await createdRequest();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("echo ben@example.com", { status: 502 })),
    );

    await t.action(internal.automation.outbox.deliver, { outboxId });

    const row = await getRow(t, outboxId);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "http_502" });
    expect(row!.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  test("network errors are retried too", async () => {
    const { t, outboxId } = await createdRequest();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await t.action(internal.automation.outbox.deliver, { outboxId });
    expect(await getRow(t, outboxId)).toMatchObject({
      status: "pending",
      lastError: "network_error",
    });
  });

  test("a second delivery can't run during the lease or before the backoff ends", async () => {
    const { t, outboxId } = await createdRequest();
    const claim = () => t.mutation(internal.automation.outbox.claim, { outboxId });

    expect(await claim()).not.toBeNull();
    expect(await claim()).toBeNull(); // Leased.

    await t.mutation(internal.automation.outbox.recordFailure, {
      outboxId,
      error: "http_500",
    });
    expect(await claim()).toBeNull(); // Backing off.

    // Moves the clock without firing timers, so only this test's claim runs.
    vi.setSystemTime(Date.now() + 31_000);
    expect(await claim()).not.toBeNull();
  });

  test("gives up visibly after the final attempt, and an admin can retry", async () => {
    const { t, outboxId } = await createdRequest();
    const admin = await member(t, "Ada", "admin");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await t.action(internal.automation.outbox.deliver, { outboxId });
      vi.advanceTimersByTime(4_000_000);
    }

    expect((await getRow(t, outboxId))?.status).toBe("failed");
    const health = await admin.as.query(api.admin.automationHealth);
    expect(health.failedNotifications).toHaveLength(1);

    await admin.as.mutation(api.admin.retryNotification, { outboxId });
    expect(await getRow(t, outboxId)).toMatchObject({ status: "pending", attempts: 0 });
  });

  test("the n8n ack is idempotent and stops further sends", async () => {
    const { t, outboxId } = await createdRequest();
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const ack = () =>
      signedFetch(t, "POST", "/n8n/notification-status", { eventId: outboxId });
    expect((await (await ack()).json()).result).toBe("recorded");
    expect((await (await ack()).json()).result).toBe("duplicate");

    // Ignore the job scheduled at creation, which may have raced the ack here.
    fetchMock.mockClear();
    await t.action(internal.automation.outbox.deliver, { outboxId });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fails fast when the recipient has no email", async () => {
    const { t, owner, outboxId } = await createdRequest();
    await t.run((ctx) => ctx.db.patch(owner.id, { email: undefined }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.automation.outbox.deliver, { outboxId });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await getRow(t, outboxId)).toMatchObject({
      status: "failed",
      lastError: "recipient_has_no_email",
    });
  });

  test("the sweep requeues a row whose scheduled job was lost", async () => {
    const { t, outboxId } = await createdRequest();
    await t.run((ctx) => ctx.db.patch(outboxId, { nextAttemptAt: Date.now() - 1 }));
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await t.mutation(internal.automation.outbox.sweep);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await getRow(t, outboxId))?.status).toBe("delivered");
  });
});
