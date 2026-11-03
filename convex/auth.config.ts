import type { AuthConfig } from "convex/server";

// Convex verifies every Clerk JWT against this issuer (signature, `iss`, `aud`).
// The `aud` claim comes from the "convex" JWT template in the Clerk dashboard.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
