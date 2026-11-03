import { convexTest } from "convex-test";
import schema from "../convex/schema";

export const modules = import.meta.glob("../convex/**/*.ts");

export const setup = () => convexTest(schema, modules);
export type Harness = ReturnType<typeof setup>;

export const dayOffset = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/** Inserts a user directly, then returns a client acting as them. */
export async function member(
  t: Harness,
  name: string,
  role: "user" | "admin" = "user",
) {
  const tokenIdentifier = `https://clerk.test|${name}`;
  const id = await t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier,
      firstName: name,
      email: `${name.toLowerCase()}@example.com`,
      role,
      trustedLender: false,
    }),
  );
  return { id, as: t.withIdentity({ tokenIdentifier, subject: name }) };
}

export const toolInput = {
  name: "Cordless drill",
  category: "power_tools",
  condition: "good",
  description: "18V with two batteries.",
} as const;
