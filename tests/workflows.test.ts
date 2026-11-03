// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/** Static guards on the exported n8n JSON, which is committed to the repo. */
const dir = join(process.cwd(), "n8n/workflows");
const workflows = readdirSync(dir).map((file) => ({
  file,
  raw: readFileSync(join(dir, file), "utf8"),
  json: JSON.parse(readFileSync(join(dir, file), "utf8")),
}));

type WorkflowNode = {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  retryOnFail?: boolean;
};

describe.each(workflows)("$file", ({ raw, json }) => {
  const nodes = json.nodes as WorkflowNode[];

  test("contains no secrets or secret-shaped values", () => {
    expect(raw).not.toMatch(/hmacSecret|password|encryptionKey/i);
    // Long hex strings are what generated secrets look like.
    expect(raw).not.toMatch(/[0-9a-f]{32,}/i);
    expect(raw).not.toContain("$env");
  });

  test("uses a placeholder rather than a hardcoded Convex URL", () => {
    for (const node of nodes.filter((n) => n.type.endsWith(".httpRequest"))) {
      expect(node.parameters.url).toMatch(/^__CONVEX_SITE_URL__\/n8n\//);
    }
  });

  test("signing and email nodes reference credentials by ID", () => {
    for (const node of nodes) {
      if (node.type.endsWith(".crypto") || node.type.endsWith(".emailSend")) {
        const [credential] = Object.values(node.credentials ?? {});
        expect(credential?.id, node.name).toBeTruthy();
      }
    }
  });

  test("every network node retries", () => {
    for (const node of nodes) {
      if (node.type.endsWith(".httpRequest") || node.type.endsWith(".emailSend")) {
        expect(node.retryOnFail, node.name).toBe(true);
      }
    }
  });

  test("doesn't retain data from successful runs that contain addresses", () => {
    expect(json.settings.saveManualExecutions).toBe(false);
  });
});

test("the two main workflows route failures to the error workflow", () => {
  const handler = workflows.find((w) => w.file === "error-handler.json")!;
  for (const { file, json } of workflows) {
    if (file !== "error-handler.json") {
      expect(json.settings.errorWorkflow).toBe(handler.json.id);
      expect(json.settings.saveDataSuccessExecution).toBe("none");
    }
  }
});
