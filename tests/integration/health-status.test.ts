/**
 * Integration tests for boundary health status checks.
 *
 * @req REQ-GCG-003
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

// --- All checks pass ---

describe("healthy boundary (REQ-GCG-003)", () => {
  it("status emits 4 check events, all passing", async () => {
    const { stdout, exitCode } = await runPlugin(["status", "--input", VALID_INPUT]);
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(4);
    for (const check of checks) {
      expect(check.status).toBe("pass");
    }
  });

  it("result includes summary with pass count", async () => {
    const { stdout } = await runPlugin(["status", "--input", VALID_INPUT]);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(true);
    expect(String(result?.summary)).toContain("4 passed");
  });

  it("check events include expected check names", async () => {
    const { stdout } = await runPlugin(["status", "--input", VALID_INPUT]);
    const events = parseEvents(stdout);
    const checkNames = events.filter((e) => e.type === "check").map((e) => e.name);
    expect(checkNames).toContain("kms_key_active");
    expect(checkNames).toContain("vpc_sc_enforced");
    expect(checkNames).toContain("audit_sink_flowing");
    expect(checkNames).toContain("model_accessible");
  });
});

// --- Individual check failure ---

describe("single health check failure (REQ-GCG-003)", () => {
  it("one failing check does not block other checks", async () => {
    const { stdout, exitCode } = await runPlugin(["status", "--input", VALID_INPUT], {
      failMode: "health_fail",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(0);
    const events = parseEvents(stdout);
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(4);

    const passing = checks.filter((c) => c.status === "pass");
    const failing = checks.filter((c) => c.status === "fail");
    expect(passing).toHaveLength(3);
    expect(failing).toHaveLength(1);
  });

  it("result reports success false when any check fails", async () => {
    const { stdout } = await runPlugin(["status", "--input", VALID_INPUT], {
      failMode: "health_fail",
      plugin: FAILING_PLUGIN,
    });
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
  });
});

// --- Multiple check failures ---

describe("multiple health check failures (REQ-GCG-003)", () => {
  it("reports correct pass/fail counts with mixed results", async () => {
    const { stdout } = await runPlugin(["status", "--input", VALID_INPUT], {
      failMode: "health_partial",
      plugin: FAILING_PLUGIN,
    });
    const events = parseEvents(stdout);
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(4);

    const passing = checks.filter((c) => c.status === "pass");
    const failing = checks.filter((c) => c.status === "fail");
    expect(passing).toHaveLength(2);
    expect(failing).toHaveLength(2);
  });
});

// --- Health checker crash ---

describe("health checker crash (REQ-GCG-003)", () => {
  it("surfaces crash as error result", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "health_error",
      plugin: FAILING_PLUGIN,
    });
    expect(exitCode).toBe(2);
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("Health check crashed");
  });
});

// --- Health checks during up (VERIFY phase) ---

describe("health checks during up (REQ-GCG-003, REQ-GCG-005)", () => {
  it("up emits 4 check events in VERIFY phase", async () => {
    const { stdout } = await runPlugin(["up", "--input", VALID_INPUT]);
    const events = parseEvents(stdout);
    const checks = events.filter((e) => e.type === "check");
    expect(checks).toHaveLength(4);
  });

  it("health failure during up makes result success false", async () => {
    const { stdout } = await runPlugin(["up", "--input", VALID_INPUT], {
      failMode: "health_fail",
      plugin: FAILING_PLUGIN,
    });
    const events = parseEvents(stdout);
    const result = findResult(events);
    expect(result?.success).toBe(false);
  });
});
