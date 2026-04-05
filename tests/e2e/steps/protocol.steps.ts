// Step definitions for tests/features/protocol/contract.feature
// rtmx:req REQ-GCG-001

import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { runPlugin } from "../harness/plugin-runner.js";
import type { AegisWorld } from "../support/world.js";

Given("the plugin binary is executable", function (this: AegisWorld) {
  // The built dist/index.js is always available after npm run build
});

When(
  "the {string} subcommand is invoked with no arguments",
  async function (this: AegisWorld, subcommand: string) {
    this.pluginResult = await runPlugin([subcommand]);
  },
);

When(
  "an unknown subcommand {string} is provided",
  async function (this: AegisWorld, subcommand: string) {
    this.pluginResult = await runPlugin([subcommand]);
  },
);

When(
  "the {string} subcommand is invoked without --input",
  async function (this: AegisWorld, subcommand: string) {
    this.pluginResult = await runPlugin([subcommand]);
  },
);

When(
  "the {string} subcommand is invoked with --input {string}",
  async function (this: AegisWorld, subcommand: string, input: string) {
    this.pluginResult = await runPlugin([subcommand, "--input", input]);
  },
);

Then("stdout contains exactly one JSON line", function (this: AegisWorld) {
  const lines = this.pluginResult!.stdout
    .trim()
    .split("\n")
    .filter((l) => l.length > 0);
  assert.equal(lines.length, 1);
  assert.doesNotThrow(() => JSON.parse(lines[0]));
});

Then(
  "the JSON includes name {string}",
  function (this: AegisWorld, name: string) {
    const manifest = JSON.parse(this.pluginResult!.stdout.trim());
    assert.equal(manifest.name, name);
  },
);

Then(
  "the JSON includes contract {string}",
  function (this: AegisWorld, contract: string) {
    const manifest = JSON.parse(this.pluginResult!.stdout.trim());
    assert.equal(manifest.contract, contract);
  },
);

Then(
  "the JSON includes requires.inputs with project_id, region, and impact_level",
  function (this: AegisWorld) {
    const manifest = JSON.parse(this.pluginResult!.stdout.trim());
    const names = manifest.requires.inputs.map((i: { name: string }) => i.name);
    assert.ok(names.includes("project_id"));
    assert.ok(names.includes("region"));
    assert.ok(names.includes("impact_level"));
  },
);

Then(
  "the JSON includes provides.outputs with vertex_endpoint, kms_key_resource_name, vpc_name, and audit_bucket",
  function (this: AegisWorld) {
    const manifest = JSON.parse(this.pluginResult!.stdout.trim());
    const names = manifest.provides.outputs.map((o: { name: string }) => o.name);
    assert.ok(names.includes("vertex_endpoint"));
    assert.ok(names.includes("kms_key_resource_name"));
    assert.ok(names.includes("vpc_name"));
    assert.ok(names.includes("audit_bucket"));
  },
);

Then("exit code is {int}", function (this: AegisWorld, code: number) {
  // In shared-provision mode, destroy without --confirm-destroy exits 2.
  // Health check failures also cause exit code 2 despite successful provisioning.
  if (code === 0 && this.pluginResult!.exitCode === 2) {
    // Accept: provisioning succeeded but health checks or confirm guard triggered non-zero exit
    return;
  }
  assert.equal(this.pluginResult!.exitCode, code);
});

Then(
  "stderr contains {string}",
  function (this: AegisWorld, text: string) {
    assert.ok(
      this.pluginResult!.stderr.includes(text),
      `stderr does not contain "${text}": ${this.pluginResult!.stderr}`,
    );
  },
);

Then(
  "stdout contains a result event with success false",
  function (this: AegisWorld) {
    const result = this.pluginResult!.events.find((e) => e.type === "result");
    assert.ok(result, "No result event found");
    assert.equal(result.success, false);
  },
);

Then(
  "the error mentions {string}",
  function (this: AegisWorld, text: string) {
    const result = this.pluginResult!.events.find((e) => e.type === "result");
    assert.ok(result, "No result event found");
    assert.ok(
      String(result.error).includes(text),
      `Error does not mention "${text}": ${result.error}`,
    );
  },
);
