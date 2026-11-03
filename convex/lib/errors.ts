import { ConvexError } from "convex/values";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "LIMIT_REACHED";

/**
 * Errors the UI may show verbatim. ConvexError data reaches clients even in
 * production, so messages must never contain another user's details. Anything
 * thrown as a plain Error is redacted by Convex.
 */
export function appError(code: ErrorCode, message: string) {
  return new ConvexError({ code, message });
}
