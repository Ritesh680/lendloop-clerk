import { httpRouter } from "convex/server";
import { type GenericValidator, type Infer, v } from "convex/values";
import { validate } from "convex-helpers/validators";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { isIsoDay } from "./lib/dates";
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifySignature,
} from "./lib/hmac";

const MAX_BODY_LENGTH = 16 * 1024;

const json = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Every n8n route goes through this wrapper, so an unsigned route can't be added
 * by forgetting a check. It reads the body as text first, because the signature
 * covers the exact bytes. Failure reasons are logged but not returned, to avoid
 * telling a caller which part of a forged request was wrong.
 */
function signedRoute(
  handler: (ctx: ActionCtx, body: string) => Promise<Response>,
) {
  return httpAction(async (ctx, request) => {
    const secret = process.env.N8N_TO_CONVEX_SECRET;
    if (!secret) {
      console.error("N8N_TO_CONVEX_SECRET is not set");
      return json(503, { error: "not_configured" });
    }
    const body = await request.text();
    if (body.length > MAX_BODY_LENGTH) {
      return json(413, { error: "too_large" });
    }
    const { pathname } = new URL(request.url);
    const check = await verifySignature({
      secret,
      timestamp: request.headers.get(TIMESTAMP_HEADER),
      signature: request.headers.get(SIGNATURE_HEADER),
      method: request.method,
      path: pathname,
      body,
    });
    if (!check.ok) {
      console.warn(`Rejected ${pathname}: ${check.reason}`);
      return json(401, { error: "unauthorized" });
    }
    return handler(ctx, body);
  });
}

function parseBody<V extends GenericValidator>(
  validator: V,
  body: string,
): Infer<V> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return validate(validator, parsed) ? (parsed as Infer<V>) : null;
  } catch {
    return null;
  }
}

const invalidBody = () => json(400, { error: "invalid_body" });

const reminderBody = v.object({
  loanId: v.string(),
  reminderDate: v.string(),
  status: v.union(v.literal("sent"), v.literal("failed")),
});
const notificationBody = v.object({ eventId: v.string() });
const failureBody = v.object({
  executionId: v.string(),
  workflowName: v.string(),
  nodeName: v.string(),
  message: v.string(),
});

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "GET",
  handler: signedRoute(async (ctx) =>
    json(
      200,
      await ctx.runMutation(internal.automation.inbound.startOverdueSweep),
    ),
  ),
});

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const parsed = parseBody(reminderBody, body);
    if (!parsed || !isIsoDay(parsed.reminderDate)) return invalidBody();
    const outcome = await ctx.runMutation(
      internal.automation.inbound.recordReminder,
      parsed,
    );
    return outcome.result === "unknown_loan"
      ? json(404, outcome)
      : json(200, outcome);
  }),
});

http.route({
  path: "/n8n/notification-status",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const parsed = parseBody(notificationBody, body);
    if (!parsed) return invalidBody();
    const outcome = await ctx.runMutation(
      internal.automation.inbound.ackNotification,
      parsed,
    );
    return outcome.result === "unknown_event"
      ? json(404, outcome)
      : json(200, outcome);
  }),
});

http.route({
  path: "/n8n/workflow-failure",
  method: "POST",
  handler: signedRoute(async (ctx, body) => {
    const parsed = parseBody(failureBody, body);
    if (!parsed) return invalidBody();
    return json(
      200,
      await ctx.runMutation(
        internal.automation.inbound.recordWorkflowFailure,
        parsed,
      ),
    );
  }),
});

export default http;
