/**
 * Integration tests for the aegis-infra/v1 plugin contract.
 * Runs the mock GCP plugin as a real subprocess and validates protocol output.
 *
 * @req REQ-GCG-001
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_PLUGIN = path.join(__dirname, "mock-gcp-plugin.ts");
const TSX = path.join(__dirname, "../../node_modules/.bin/tsx");

async function runPlugin(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await exec(TSX, [MOCK_PLUGIN, ...args], { timeout: 30000 });
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

function parseLines(stdout: string): Record<string, unknown>[] {
  return stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l));
}

const VALID_INPUT = '{"project_id":"test-project","region":"us-central1","impact_level":"IL4"}';

// --- manifest ---

describe("manifest subcommand", () => {
  it("outputs valid manifest JSON with correct name and contract", async () => {
    const { stdout, exitCode } = await runPlugin(["manifest"]);
    expect(exitCode).toBe(0);
    const manifest = JSON.parse(stdout.trim());
    expect(manifest.name).toBe("gcp-assured-workloads");
    expect(manifest.contract).toBe("aegis-infra/v1");
    expect(manifest.version).toBe("0.2.0");
  });

  it("declares required inputs: project_id, region, impact_level", async () => {
    const { stdout } = await runPlugin(["manifest"]);
    const manifest = JSON.parse(stdout.trim());
    const inputNames = manifest.requires.inputs.map((i: { name: string }) => i.name);
    expect(inputNames).toContain("project_id");
    expect(inputNames).toContain("region");
    expect(inputNames).toContain("impact_level");
  });

  it("declares expected outputs", async () => {
    const { stdout } = await runPlugin(["manifest"]);
    const manifest = JSON.parse(stdout.trim());
    const outputNames = manifest.provides.outputs.map((o: { name: string }) => o.name);
    expect(outputNames).toContain("vertex_endpoint");
    expect(outputNames).toContain("kms_key_resource_name");
    expect(outputNames).toContain("vpc_name");
    expect(outputNames).toContain("audit_bucket");
  });

  it("outputs exactly one JSON line", async () => {
    const { stdout } = await runPlugin(["manifest"]);
    const lines = stdout
      .trim()
      .split("\n")
      .filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });
});

// --- invalid subcommand ---

describe("invalid subcommand", () => {
  it("exits with code 1 and usage on stderr", async () => {
    const { stderr, exitCode } = await runPlugin(["foo"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});

// --- missing --input ---

describe("missing --input", () => {
  it("preview exits with code 2 and error mentioning --input", async () => {
    const { stdout, exitCode } = await runPlugin(["preview"]);
    expect(exitCode).toBe(2);
    const events = parseLines(stdout);
    const result = events.find((e) => e.type === "result");
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("--input");
  });

  it("up exits with code 2 and error mentioning --input", async () => {
    const { stdout, exitCode } = await runPlugin(["up"]);
    expect(exitCode).toBe(2);
    const events = parseLines(stdout);
    const result = events.find((e) => e.type === "result");
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("--input");
  });
});

// --- invalid JSON ---

describe("invalid JSON in --input", () => {
  it("exits with code 2 and error mentioning Invalid JSON", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", "not json"]);
    expect(exitCode).toBe(2);
    const events = parseLines(stdout);
    const result = events.find((e) => e.type === "result");
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("Invalid JSON");
  });
});

// --- missing required input ---

describe("missing required input", () => {
  it("exits with code 2 and error mentioning project_id", async () => {
    const { stdout, exitCode } = await runPlugin(["up", "--input", "{}"]);
    expect(exitCode).toBe(2);
    const events = parseLines(stdout);
    const result = events.find((e) => e.type === "result");
    expect(result?.success).toBe(false);
    expect(String(result?.error)).toContain("project_id");
  });
});

// --- protocol compliance ---

describe("protocol compliance", () => {
  it("every stdout line is valid JSON for all subcommands", async () => {
    for (const cmd of ["preview", "up", "status"]) {
      const { stdout } = await runPlugin([cmd, "--input", VALID_INPUT]);
      const lines = stdout
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      for (const line of lines) {
        expect(() => JSON.parse(line), `Invalid JSON in ${cmd}: ${line}`).not.toThrow();
      }
    }
  });

  it("all events have a type field", async () => {
    const { stdout } = await runPlugin(["up", "--input", VALID_INPUT]);
    const events = parseLines(stdout);
    for (const event of events) {
      expect(event).toHaveProperty("type");
      expect(["diagnostic", "progress", "check", "result"]).toContain(event.type);
    }
  });

  it("exactly one result event per subcommand", async () => {
    for (const cmd of ["preview", "up", "status"]) {
      const { stdout } = await runPlugin([cmd, "--input", VALID_INPUT]);
      const events = parseLines(stdout);
      const results = events.filter((e) => e.type === "result");
      expect(results, `${cmd} should emit exactly one result`).toHaveLength(1);
    }
  });
});
