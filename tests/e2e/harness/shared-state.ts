/**
 * Shared E2E state -- single provision/destroy per suite.
 *
 * BeforeAll runs `up` once and stores outputs here.
 * All scenarios read from this shared state.
 * AfterAll runs `destroy` once.
 */

import { runPlugin, findResult } from "./plugin-runner.js";
import { e2eInput, isE2eEnabled } from "./config.js";
import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LOCK_DIR = join(
  homedir(),
  ".aegis",
  "state",
  "gcp-assured-workloads",
  ".pulumi",
  "locks",
);

export interface SharedState {
  provisioned: boolean;
  input: string;
  outputs: Record<string, string>;
  upEvents: Record<string, unknown>[];
}

const state: SharedState = {
  provisioned: false,
  input: "",
  outputs: {},
  upEvents: [],
};

export function getSharedState(): SharedState {
  return state;
}

/** Remove stale Pulumi lock files from crashed runs. */
function clearStaleLocks(): void {
  try {
    const walkAndDelete = (dir: string): void => {
      let entries: string[];
      try {
        entries = readdirSync(dir, { withFileTypes: true }) as unknown as string[];
      } catch {
        return;
      }
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walkAndDelete(full);
        } else if (entry.name.endsWith(".json")) {
          try {
            unlinkSync(full);
          } catch {
            // ignore
          }
        }
      }
    };
    walkAndDelete(LOCK_DIR);
  } catch {
    // Lock dir may not exist yet
  }
}

/** Provision once for the entire suite. */
export async function provisionOnce(): Promise<void> {
  if (!isE2eEnabled()) return;
  if (state.provisioned) return;

  clearStaleLocks();

  state.input = e2eInput();
  const result = await runPlugin(["up", "--input", state.input]);
  state.upEvents = result.events;

  const resultEvent = findResult(result.events);
  if (resultEvent?.outputs) {
    state.outputs = resultEvent.outputs as Record<string, string>;
    state.provisioned = true;
  } else {
    throw new Error(
      `E2E provisioning failed: ${resultEvent?.error ?? result.stderr}`,
    );
  }
}

/** Destroy once after all scenarios. */
export async function destroyOnce(): Promise<void> {
  if (!state.provisioned) return;

  clearStaleLocks();
  await runPlugin(["destroy", "--confirm-destroy", "--input", state.input]);
  state.provisioned = false;
}
