/**
 * Step definitions for:
 *   tests/features/status/health.feature
 *   tests/features/status/vpc-sc-vertex.feature
 *
 * @req REQ-GCG-003, REQ-GCG-007
 */

import { Given, When, Then } from "@cucumber/cucumber";
import { strict as assert } from "node:assert";
import { runPlugin, findResult, findChecks, findDiagnostics } from "../harness/plugin-runner.js";
import { E2E_CONFIG, e2eInput } from "../harness/config.js";
import type { AegisWorld } from "../support/world.js";

// --- Given steps ---

Given(
  "a fully provisioned and healthy boundary",
  async function (this: AegisWorld) {
    const input = e2eInput();
    const result = await runPlugin(["up", "--input", input]);
    assert.equal(result.exitCode, 0, `Provisioning failed: ${result.stderr}`);
    this.provisioned = true;
    this.input = input;
  },
);

Given("a fully provisioned boundary", async function (this: AegisWorld) {
  const input = e2eInput();
  const result = await runPlugin(["up", "--input", input]);
  assert.equal(result.exitCode, 0, `Provisioning failed: ${result.stderr}`);
  this.provisioned = true;
  this.input = input;
});

Given(
  "a provisioned boundary without accessPolicyId configured",
  async function (this: AegisWorld) {
    // Default e2eInput does not include access_policy_id
    const input = e2eInput();
    const result = await runPlugin(["up", "--input", input]);
    assert.equal(result.exitCode, 0, `Provisioning failed: ${result.stderr}`);
    this.provisioned = true;
    this.input = input;
  },
);

Given(
  "a provisioned boundary with an active VPC-SC perimeter",
  async function (this: AegisWorld) {
    if (!E2E_CONFIG.accessPolicyId) {
      return "skipped";
    }
    this.input = JSON.stringify({
      project_id: E2E_CONFIG.projectId,
      region: E2E_CONFIG.region,
      impact_level: E2E_CONFIG.impactLevel,
      access_policy_id: E2E_CONFIG.accessPolicyId,
    });
    const result = await runPlugin(["up", "--input", this.input]);
    assert.equal(result.exitCode, 0, `Provisioning failed: ${result.stderr}`);
    this.provisioned = true;
  },
);

Given(
  "the caller has aiplatform.user role on the project",
  function (this: AegisWorld) {
    // e2e-runner SA has aiplatform.user
  },
);

Given("input without accessPolicyId", function (this: AegisWorld) {
  this.input = e2eInput(); // No access_policy_id
});

// --- Then steps for health checks ---

Then(
  "{int} check events are emitted",
  function (this: AegisWorld, count: number) {
    const checks = findChecks(this.pluginResult!.events);
    assert.equal(checks.length, count, `Expected ${count} checks, got ${checks.length}`);
  },
);

Then(
  "all check events have status {string}",
  function (this: AegisWorld, status: string) {
    const checks = findChecks(this.pluginResult!.events);
    for (const check of checks) {
      assert.equal(check.status, status, `Check ${check.name} has status ${check.status}`);
    }
  },
);

Then(
  "the result summary says {string}",
  function (this: AegisWorld, summary: string) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event");
    assert.ok(
      String(result.summary).includes(summary),
      `Summary does not contain "${summary}": ${result.summary}`,
    );
  },
);

Then(
  "result success is true",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event");
    assert.equal(result.success, true);
  },
);

Then(
  "result success is false",
  function (this: AegisWorld) {
    const result = findResult(this.pluginResult!.events);
    assert.ok(result, "No result event");
    assert.equal(result.success, false);
  },
);

Then(
  "the {word} check has status {string}",
  function (this: AegisWorld, checkName: string, status: string) {
    const checks = findChecks(this.pluginResult!.events);
    const check = checks.find((c) => c.name === checkName);
    assert.ok(check, `Check "${checkName}" not found`);
    assert.equal(check.status, status);
  },
);

Then(
  "detail mentions {string}",
  function (this: AegisWorld, text: string) {
    const checks = findChecks(this.pluginResult!.events);
    const hasDetail = checks.some((c) => String(c.detail).includes(text));
    assert.ok(hasDetail, `No check detail mentions "${text}"`);
  },
);

Then(
  "the detail mentions {string} and {string}",
  function (this: AegisWorld, text1: string, text2: string) {
    const checks = findChecks(this.pluginResult!.events);
    const matching = checks.find(
      (c) => String(c.detail).includes(text1) && String(c.detail).includes(text2),
    );
    assert.ok(matching, `No check detail mentions both "${text1}" and "${text2}"`);
  },
);

Then(
  "the detail includes the perimeter name",
  function (this: AegisWorld) {
    const checks = findChecks(this.pluginResult!.events);
    const vpcSc = checks.find((c) => c.name === "vpc_sc_enforced");
    assert.ok(vpcSc, "vpc_sc_enforced check not found");
    assert.ok(String(vpcSc.detail).length > 0, "Detail is empty");
  },
);

Then(
  "the detail includes the model name",
  function (this: AegisWorld) {
    const checks = findChecks(this.pluginResult!.events);
    const model = checks.find((c) => c.name === "model_accessible");
    assert.ok(model, "model_accessible check not found");
    assert.ok(
      String(model.detail).includes("gemini"),
      `Detail does not include model name: ${model.detail}`,
    );
  },
);

Then(
  "the detail includes the endpoint URL",
  function (this: AegisWorld) {
    const checks = findChecks(this.pluginResult!.events);
    const check = checks.find(
      (c) => String(c.detail).includes("aiplatform.googleapis.com"),
    );
    assert.ok(check, "No check detail includes endpoint URL");
  },
);

Then(
  "{int} checks have status {string}",
  function (this: AegisWorld, count: number, status: string) {
    const checks = findChecks(this.pluginResult!.events);
    const matching = checks.filter((c) => c.status === status);
    assert.equal(matching.length, count);
  },
);

Then(
  "{int} check has status {string}",
  function (this: AegisWorld, count: number, status: string) {
    const checks = findChecks(this.pluginResult!.events);
    const matching = checks.filter((c) => c.status === status);
    assert.equal(matching.length, count);
  },
);

Then(
  "detail includes the endpoint URL",
  function (this: AegisWorld) {
    const checks = findChecks(this.pluginResult!.events);
    const check = checks.find(
      (c) => String(c.detail).includes("aiplatform.googleapis.com"),
    );
    assert.ok(check, "No check detail includes endpoint URL");
  },
);

Then(
  "the detail mentions {string} or {string}",
  function (this: AegisWorld, text1: string, text2: string) {
    const checks = findChecks(this.pluginResult!.events);
    const matching = checks.find(
      (c) => String(c.detail).includes(text1) || String(c.detail).includes(text2),
    );
    assert.ok(matching, `No check detail mentions "${text1}" or "${text2}"`);
  },
);

Then(
  "a diagnostic event with severity {string} appears during PROVISION",
  function (this: AegisWorld, severity: string) {
    const diagnostics = findDiagnostics(this.pluginResult!.events);
    const matching = diagnostics.filter((d) => d.severity === severity);
    assert.ok(matching.length > 0, `No diagnostic with severity "${severity}"`);
  },
);

Then(
  /the message mentions "(.+)"/,
  function (this: AegisWorld, text: string) {
    const diagnostics = findDiagnostics(this.pluginResult!.events);
    const matching = diagnostics.find((d) => String(d.message).includes(text));
    assert.ok(matching, `No diagnostic message mentions "${text}"`);
  },
);

Then(
  "the result outputs include perimeter_configured {string}",
  function (this: AegisWorld, value: string) {
    const result = findResult(this.pluginResult!.events) as Record<string, unknown>;
    const outputs = result.outputs as Record<string, string>;
    assert.ok(outputs, "No outputs in result");
    assert.ok(
      outputs.perimeter_configured === "true" || outputs.perimeter_configured === "false",
      `perimeter_configured is ${outputs.perimeter_configured}`,
    );
  },
);

Then(
  "the {string} subcommand completes",
  async function (this: AegisWorld, subcommand: string) {
    const input = this.input ?? e2eInput();
    this.pluginResult = await runPlugin([subcommand, "--input", input]);
  },
);
