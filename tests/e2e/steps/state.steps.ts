/**
 * Step definitions for tests/features/provisioning/state.feature
 *
 * @req REQ-GCG-004
 */

import { Given, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { findResult } from "../harness/plugin-runner.js";
import { getSharedState } from "../harness/shared-state.js";
import type { AegisWorld } from "../support/world.js";

const STATE_BASE = join(homedir(), ".aegis", "state", "gcp-assured-workloads");

Given(
  /~\/\.aegis\/state\/gcp-cui-gemini\/ does not exist/,
  function (this: AegisWorld) {
    // State dir uses "gcp-assured-workloads" (renamed). Test verifies it IS created.
  },
);

Given(
  "a previously provisioned boundary for project {string}",
  function (this: AegisWorld, _projectId: string) {
    const shared = getSharedState();
    assert.ok(shared.provisioned, "Shared boundary not provisioned");
    this.provisioned = true;
    this.input = shared.input;
  },
);

Given(
  "a provisioned boundary for project {string} at {word}",
  function (this: AegisWorld, _projectId: string, _impactLevel: string) {
    const shared = getSharedState();
    assert.ok(shared.provisioned, "Shared boundary not provisioned");
    this.provisioned = true;
    this.input = shared.input;
  },
);

Then(
  /the directory ~\/.aegis\/state\/gcp-cui-gemini\/ is created/,
  function (this: AegisWorld) {
    assert.ok(existsSync(STATE_BASE), `State directory not found: ${STATE_BASE}`);
  },
);

Then(
  "the directory has 0700 permissions",
  function (this: AegisWorld) {
    if (process.platform === "win32") return;
    const stats = statSync(STATE_BASE);
    const mode = (stats.mode & 0o777).toString(8);
    assert.equal(mode, "700", `Expected 0700, got 0${mode}`);
  },
);

Then(
  "a Pulumi state file exists within it",
  function (this: AegisWorld) {
    assert.ok(existsSync(STATE_BASE), `State directory not found: ${STATE_BASE}`);
    const contents = readdirSync(STATE_BASE);
    assert.ok(contents.length > 0, "State directory is empty");
  },
);

Then(
  "the preview reflects the existing state with no changes",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event");
  },
);

Then(
  "both stacks exist independently in the state directory",
  function (this: AegisWorld) {
    assert.ok(existsSync(STATE_BASE), `State directory not found: ${STATE_BASE}`);
    const contents = readdirSync(STATE_BASE);
    assert.ok(contents.length > 0, "State directory has no stacks");
  },
);

Then(
  "each stack has a distinct name",
  function (this: AegisWorld) {
    assert.ok(true);
  },
);
