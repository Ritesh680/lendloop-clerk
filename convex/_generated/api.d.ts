/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as automation_activity from "../automation/activity.js";
import type * as automation_inbound from "../automation/inbound.js";
import type * as automation_outbox from "../automation/outbox.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_availability from "../lib/availability.js";
import type * as lib_constants from "../lib/constants.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_hmac from "../lib/hmac.js";
import type * as lib_text from "../lib/text.js";
import type * as loans from "../loans.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  "automation/activity": typeof automation_activity;
  "automation/inbound": typeof automation_inbound;
  "automation/outbox": typeof automation_outbox;
  crons: typeof crons;
  http: typeof http;
  "lib/availability": typeof lib_availability;
  "lib/constants": typeof lib_constants;
  "lib/dates": typeof lib_dates;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/hmac": typeof lib_hmac;
  "lib/text": typeof lib_text;
  loans: typeof loans;
  seed: typeof seed;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
