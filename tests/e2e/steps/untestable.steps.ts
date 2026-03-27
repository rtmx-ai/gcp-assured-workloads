/**
 * Step definitions for scenarios that require destructive or untestable GCP state.
 * These scenarios are skipped in automated E2E runs.
 *
 * Covers:
 *   - Expired credentials
 *   - API propagation delays
 *   - Nonexistent projects
 *   - Partial provision recovery
 *   - Manually deleted resources
 *   - KMS key disabled
 *   - Missing IAM permissions
 *   - VPC-SC blocking traffic
 */

import { Given, When, Then } from "@cucumber/cucumber";
import type { AegisWorld } from "../support/world.js";

// --- Untestable Given steps (skip scenario) ---

Given("expired GCP ADC credentials", function (this: AegisWorld) {
  return "skipped";
});

Given(
  "valid credentials lacking Cloud KMS Viewer role",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "the KMS API was just enabled and returns {int} on first poll",
  function (this: AegisWorld, _status: number) {
    return "skipped";
  },
);

Given(
  "the Compute API never transitions to ENABLED within {int} seconds",
  function (this: AegisWorld, _seconds: number) {
    return "skipped";
  },
);

Given(
  "the Compute API is disabled on the project",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  /a previous "up" that created KMS and VPC but failed on the audit bucket/,
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "the audit bucket was manually deleted after provisioning",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "a provisioned boundary where the CMEK key has been disabled",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "a boundary where only the audit bucket has been deleted",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "a provisioned boundary where VPC-SC blocks outbound traffic",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "the caller lacks aiplatform.user role",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Given(
  "input with project_id {string}",
  function (this: AegisWorld, _projectId: string) {
    // Used by nonexistent project scenario
    return "skipped";
  },
);

// --- Untestable When steps ---

When(
  "resources are inspected",
  function (this: AegisWorld) {
    return "skipped";
  },
);

// --- Untestable Then steps ---

Then(
  "the error mentions {string} or {string}",
  function (this: AegisWorld, _text1: string, _text2: string) {
    return "skipped";
  },
);

Then(
  "the error mentions {string} or {string} or {string}",
  function (this: AegisWorld, _t1: string, _t2: string, _t3: string) {
    return "skipped";
  },
);

Then("no subsequent state transitions occur", function (this: AegisWorld) {
  return "skipped";
});

Then(
  "the API_ENABLEMENT state retries polling",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "the KMS API eventually reports {string}",
  function (this: AegisWorld, _status: string) {
    return "skipped";
  },
);

Then(
  "provisioning succeeds after the delay",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "no resources are created",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "PREFLIGHT passes \\(credentials and project still valid)",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "API_ENABLEMENT passes \\(APIs still enabled)",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "PROVISION creates only the missing resources",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then(
  "PROVISION detects the missing bucket and recreates it",
  function (this: AegisWorld) {
    return "skipped";
  },
);

Then("VERIFY runs health checks", function (this: AegisWorld) {
  return "skipped";
});

Then(
  "the result outputs include perimeter_configured {string} or {string}",
  function (this: AegisWorld, _v1: string, _v2: string) {
    return "skipped";
  },
);

// "a diagnostic event indicates {string} state" is defined in lifecycle.steps.ts
