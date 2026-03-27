/**
 * Cucumber hooks for E2E test setup and cleanup.
 */

import { Before, After, BeforeAll, AfterAll } from "@cucumber/cucumber";
import { isE2eEnabled, E2E_CONFIG, e2eInput } from "../harness/config.js";
import { runPlugin } from "../harness/plugin-runner.js";
import type { AegisWorld } from "./world.js";

/**
 * Skip all scenarios when E2E_PROJECT_ID is not set.
 */
Before(function (this: AegisWorld) {
  if (!isE2eEnabled()) {
    return "skipped";
  }
});

/**
 * Tag-based hooks for scenarios that need a provisioned boundary.
 * Scenarios tagged @provisioned get an `up` before and `destroy` after.
 */
Before({ tags: "@provisioned" }, async function (this: AegisWorld) {
  if (!isE2eEnabled()) return "skipped";

  const input = e2eInput();
  const result = await runPlugin(["up", "--input", input]);
  if (result.exitCode !== 0) {
    throw new Error(`Provisioning failed: ${result.stdout}\n${result.stderr}`);
  }
  this.provisioned = true;
  this.input = input;
});

After({ tags: "@provisioned" }, async function (this: AegisWorld) {
  if (!this.provisioned) return;

  const input = this.input ?? e2eInput();
  await runPlugin(["destroy", "--confirm-destroy", "--input", input]);
  this.provisioned = false;
});
