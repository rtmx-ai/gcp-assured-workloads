/**
 * Integration tests for provisioning lifecycle, initialization state machine,
 * and unified subcommand behavior.
 *
 * @req REQ-GCG-002, REQ-GCG-005, REQ-GCG-006
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PLUGIN = path.join(__dirname, "mock-gcp-plugin.ts");
const FAILING_PLUGIN = path.join(__dirname, "failing-gcp-plugin.ts");
const TSX = path.join(__dirname, "../../node_modules/.bin/tsx");

const VALID_INPUT = '{"project_id":"test-project","region":"us-central1","impact_level":"IL4"}';

async function runPlugin(
  args: string[],
  opts?: { failMode?: string; plugin?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const plugin = opts?.plugin ?? MOCK_PLUGIN;
  const env = opts?.failMode ? { ...process.env, FAIL_MODE: opts.failMode } : process.env;
  try {
    const result = await exec(TSX, [plugin, ...args], { timeout: 30000, env });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      exitCode: e.code ?? 1,
    };
  }
}

function parseEvents(stdout: string): Record<string, unknown>[] {
  return stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

function findResult(events: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return events.find((e) => e.type === "result");
}

// --- REQ-GCG-005: Initialization State Machine ---

describe("initialization state machine (REQ-GCG-005)", () => {
  it("up runs PREFLIGHT, API_ENABLEMENT, PROVISION, VERIFY in order", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);

    const diagnostics = events.filter((e) => e.type === "diagnostic") as Record<string, unknown>[];
    const stateMessages = diagnostics.map((d) => String(d.message));
    expect(stateMessages.some((m) => m.includes("PREFLIGHT"))).toBe(true);
    expect(stateMessages.some((m) => m.includes("API_ENABLEMENT"))).toBe(true);
    expect(stateMessages.some((m) => m.includes("PROVISION"))).toBe(true);
    expect(stateMessages.some((m) => m.includes("VERIFY"))).toBe(true);

    // Verify ordering: PREFLIGHT before API_ENABLEMENT before PROVISION before VERIFY
    const preflightIdx = stateMessages.findIndex((m) => m.includes("PREFLIGHT"));
    const apiIdx = stateMessages.findIndex((m) => m.includes("API_ENABLEMENT"));
    const provisionIdx = stateMessages.findIndex((m) => m.includes("PROVISION"));
    const verifyIdx = stateMessages.findIndex((m) => m.includes("VERIFY"));
    expect(preflightIdx).toBeLessThan(apiIdx);
    expect(apiIdx).toBeLessThan(provisionIdx);
    expect(provisionIdx).toBeLessThan(verifyIdx);
  });

  it("state transitions emit diagnostic events with severity info", async () => {
    const { stdout } = await runPlugin(["up", "--input", VALID_INPUT]);
    const events = parseEvents(stdout);
    const diagnostics = events.filter((e) => e.type === "diagnostic") as Record<string, unknown>[];
    const stateTransitions = diagnostics.filter(
      (d) => String(d.message).includes("PREFLIGHT") || String(d.message).includes("PROVISION"),
    );
    for (const t of stateTransitions) {
      expect(t.severity).toBe("info");
    }
  });

  it("preflight fails on invalid credentials", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "credentials",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("Credentials");

    // No progress events (stopped at preflight)
    expect(events.filter((e) => e.type === "progress")).toHaveLength(0);
  });

  it("preflight fails on access denied", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "access",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("access");
  });

  it("API enablement failure reports the failed API", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "enable_error",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("googleapis.com");
  });
});

// --- REQ-GCG-002: Provisioning ---

describe("provisioning lifecycle (REQ-GCG-002)", () => {
  it("preview succeeds and emits diagnostic + result events", async () => {
    const { stdout, exitCode } = await runPlugin(["preview", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const types = events.map((e) => e.type);
    expect(types).toContain("diagnostic");
    expect(types).toContain("result");
    const result = findResult(events);
    expect(result?.success).toBe(true);
  });

  it("up returns all declared outputs", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const result = findResult(events) as Record<string, unknown>;
    expect(result.success).toBe(true);
    const outputs = result.outputs as Record<string, string>;
    expect(outputs.vertex_endpoint).toBe("us-central1-aiplatform.googleapis.com");
    expect(outputs.kms_key_resource_name).toContain("keyRings/aegis-keyring");
    expect(outputs.vpc_name).toBe("aegis-vpc");
    expect(outputs.audit_bucket).toContain("aegis-audit-logs");
    expect(outputs.perimeter_configured).toBe("true");
  });

  it("up emits health check events during VERIFY phase", async () => {
    const { stdout } = await runPlugin(["up", "--input", VALID_INPUT]);
    const events = parseEvents(stdout);
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(4);
    for (const check of checks) {
      expect(check.status).toBe("pass");
    }
  });

  it("engine failure during up surfaces error", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "engine_error",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("Pulumi crashed");
  });
});

// --- REQ-GCG-006: Unified State Machine ---

describe("unified lifecycle (REQ-GCG-006)", () => {
  it("preview runs preflight before dry run", async () => {
    const { stdout, exitCode } = await runPlugin(["preview", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const diagnostics = events.filter((e) => e.type === "diagnostic") as Record<string, unknown>[];
    const stateMessages = diagnostics.map((d) => String(d.message));
    expect(stateMessages.some((m) => m.includes("PREFLIGHT"))).toBe(true);
  });

  it("preview fails when APIs are disabled", async () => {
    const { stdout, exitCode } = await runPlugin(["preview", "--input", VALID_INPUT], {
      failMode: "api_disabled",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("not enabled");
  });

  it("destroy requires --confirm-destroy flag", async () => {
    const { stdout, exitCode } = await runPlugin(["destroy", "--input", VALID_INPUT]);
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("--confirm-destroy");
  });

  it("destroy with --confirm-destroy succeeds", async () => {
    const { stdout, exitCode } = await runPlugin([
      "destroy",
      "--confirm-destroy",
      "--input",
      VALID_INPUT,
    ]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(true);
  });

  it("destroy fails on invalid credentials", async () => {
    const { stdout, exitCode } = await runPlugin(
      ["destroy", "--confirm-destroy", "--input", VALID_INPUT],
      { failMode: "credentials", plugin: FAILING_PLUGIN },
    );
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
  });

  it("destroy fails on engine error", async () => {
    const { stdout, exitCode } = await runPlugin(
      ["destroy", "--confirm-destroy", "--input", VALID_INPUT],
      { failMode: "engine_error", plugin: FAILING_PLUGIN },
    );
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("Pulumi crashed");
  });

  it("status runs preflight before health checks", async () => {
    const { stdout, exitCode } = await runPlugin(["status", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const diagnostics = events.filter((e) => e.type === "diagnostic") as Record<string, unknown>[];
    const stateMessages = diagnostics.map((d) => String(d.message));
    expect(stateMessages.some((m) => m.includes("PREFLIGHT"))).toBe(true);

    const checks = events.filter((e) => e.type === "check");
    expect(checks.length).toBeGreaterThan(0);
  });
});
