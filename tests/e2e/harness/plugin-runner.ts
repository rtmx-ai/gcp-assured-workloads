/**
 * Runs the real plugin binary as a subprocess and captures protocol output.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ENTRY = path.resolve(__dirname, "../../../dist/index.js");

export interface PluginResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  events: Record<string, unknown>[];
}

export async function runPlugin(args: string[]): Promise<PluginResult> {
  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const result = await exec("node", [PLUGIN_ENTRY, ...args], {
      timeout: 300_000,
      env: { ...process.env, PULUMI_CONFIG_PASSPHRASE: "" },
    });
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    stdout = e.stdout ?? "";
    stderr = e.stderr ?? "";
    exitCode = e.code ?? 1;
  }

  const events = stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>;
      } catch {
        return { type: "raw", content: l } as Record<string, unknown>;
      }
    });

  return { stdout, stderr, exitCode, events };
}

export function findResult(
  events: Record<string, unknown>[],
): Record<string, unknown> | undefined {
  return events.find((e) => e.type === "result");
}

export function findChecks(
  events: Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.filter((e) => e.type === "check");
}

export function findDiagnostics(
  events: Record<string, unknown>[],
): Record<string, unknown>[] {
  return events.filter((e) => e.type === "diagnostic");
}
