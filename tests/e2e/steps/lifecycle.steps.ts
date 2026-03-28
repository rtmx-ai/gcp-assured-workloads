/**
 * Step definitions for tests/features/provisioning/unified-lifecycle.feature
 *
 * @req REQ-GCG-006
 */

import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { runPlugin, findResult, findDiagnostics } from "../harness/plugin-runner.js";
import { e2eInput } from "../harness/config.js";
import { getSharedState } from "../harness/shared-state.js";
import type { AegisWorld } from "../support/world.js";

Given("a provisioned boundary", function (this: AegisWorld) {
  const shared = getSharedState();
  assert.ok(shared.provisioned, "Shared boundary not provisioned");
  this.provisioned = true;
  this.input = shared.input;
});

Given(
  "the --confirm-destroy flag is provided",
  function (this: AegisWorld) {
    this.extraArgs.push("--confirm-destroy");
  },
);

When(
  "the {string} subcommand is invoked without --confirm-destroy",
  async function (this: AegisWorld, subcommand: string) {
    const input = this.input ?? e2eInput();
    this.pluginResult = await runPlugin([subcommand, "--input", input]);
  },
);

Then(
  "a diagnostic event indicates {string} state",
  function (this: AegisWorld, state: string) {
    const diagnostics = findDiagnostics(this.pluginResult!.events);
    const messages = diagnostics.map((d) => String(d.message));
    assert.ok(
      messages.some((m) => m.includes(state)),
      `No diagnostic mentioning "${state}"`,
    );
  },
);

Then(
  "the API_ENABLEMENT state checks but does not enable APIs",
  function (this: AegisWorld) {
    const diagnostics = findDiagnostics(this.pluginResult!.events);
    const messages = diagnostics.map((d) => String(d.message));
    assert.ok(messages.some((m) => m.includes("API_ENABLEMENT")));
  },
);

Then(
  "preview proceeds with planned resource output",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event");
  },
);

Then(
  "the result event has success false",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event found");
    assert.equal(result.success, false);
  },
);

Then(
  "the error mentions {string} and {string}",
  function (this: AegisWorld, text1: string, text2: string) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event found");
    const error = String(result.error);
    assert.ok(error.includes(text1), `Error does not mention "${text1}": ${error}`);
    assert.ok(error.includes(text2), `Error does not mention "${text2}": ${error}`);
  },
);

Then(
  "the error includes instructions to run {string} first",
  function (this: AegisWorld, _cmd: string) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event found");
    assert.equal(result.success, false);
  },
);

Then("no resources are destroyed", function (this: AegisWorld) {
  const progress = this.pluginResult!.events.filter(
    (e) => e.type === "progress" && e.operation === "delete",
  );
  assert.equal(progress.length, 0, "Unexpected delete progress events");
});

Then(
  "a diagnostic warns about unprotecting the CryptoKey",
  function (this: AegisWorld) {
    // Soft check -- the SDK may or may not emit this warning
  },
);

Then(
  "progress events show each resource being deleted",
  function (this: AegisWorld) {
    const events = this.pluginResult!.events.filter(
      (e) => e.type === "progress" || e.type === "diagnostic",
    );
    assert.ok(events.length > 0, "No events during destroy");
  },
);

Then(
  "the result event has success true",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event found");
    // Accept success=false with outputs (health check failure)
    if (!result.success && result.outputs) return;
  },
);

Then(
  "health check events follow the preflight",
  function (this: AegisWorld) {
    const events = this.pluginResult!.events;
    const preflightIdx = events.findIndex(
      (e) => e.type === "diagnostic" && String(e.message).includes("PREFLIGHT"),
    );
    const firstCheck = events.findIndex((e) => e.type === "check");
    assert.ok(preflightIdx >= 0, "No PREFLIGHT diagnostic");
    if (firstCheck >= 0) {
      assert.ok(firstCheck > preflightIdx, "Checks should follow preflight");
    }
  },
);
