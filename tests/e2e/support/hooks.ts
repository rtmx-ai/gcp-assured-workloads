/**
 * Cucumber hooks for E2E test setup and cleanup.
 *
 * Single provision/destroy per suite:
 *   BeforeAll: run `up` once, store outputs in shared state
 *   Each scenario: reads shared state, runs subcommands
 *   AfterAll: run `destroy` once
 */

import { Before, BeforeAll, AfterAll, setDefaultTimeout } from "@cucumber/cucumber";
import { isE2eEnabled } from "../harness/config.js";
import { provisionOnce, destroyOnce } from "../harness/shared-state.js";
import type { AegisWorld } from "./world.js";

// Pulumi operations can take 5+ minutes
setDefaultTimeout(600_000);

/**
 * Provision the boundary once before any scenario runs.
 */
BeforeAll(async function () {
  if (!isE2eEnabled()) return;
  await provisionOnce();
});

/**
 * Destroy the boundary once after all scenarios complete.
 */
AfterAll(async function () {
  await destroyOnce();
});

/**
 * Skip all scenarios when E2E_PROJECT_ID is not set.
 * Reset per-scenario state.
 */
Before(function (this: AegisWorld) {
  if (!isE2eEnabled()) {
    return "skipped";
  }
  this.extraArgs = [];
});
