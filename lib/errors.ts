import { ConvexError } from "convex/values";

/** Convex redacts unexpected errors, so only ConvexError text is user-facing. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    if (data?.message) return data.message;
  }
  return "That didn't go through. Check your connection and try again.";
}
