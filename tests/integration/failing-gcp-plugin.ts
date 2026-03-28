#!/usr/bin/env node

/**
 * Failing GCP plugin with configurable failure modes.
 * Controlled via FAIL_MODE environment variable.
 *
 * Modes:
 *   credentials    - validateCredentials returns false
 *   access         - checkAccess returns false
 *   enable_error   - enableApi throws
 *   api_disabled   - getApiState returns DISABLED (blocks preview)
 *   engine_error   - up/destroy throw
 *   health_fail    - one health check returns "fail"
 *   health_error   - checkAll throws
 *   health_partial - mixed pass/fail checks
 */

import { createPluginCli } from "@aegis-cli/infra-sdk";
import type { CspClient, IaCEngine, HealthChecker } from "@aegis-cli/infra-sdk";
import type { InfraConfig, BoundaryOutput, HealthCheck } from "@aegis-cli/infra-sdk";

const FAIL_MODE = process.env["FAIL_MODE"] ?? "";

const failingCspClient: CspClient = {
  async validateCredentials(): Promise<boolean> {
    if (FAIL_MODE === "credentials") return false;
    return true;
  },
  async checkAccess(_config: InfraConfig): Promise<boolean> {
    if (FAIL_MODE === "access") return false;
    return true;
  },
  async getApiState(_config: InfraConfig, _api: string): Promise<"ENABLED" | "DISABLED"> {
    if (FAIL_MODE === "api_disabled" || FAIL_MODE === "enable_error") return "DISABLED";
    return "ENABLED";
  },
  async enableApi(_config: InfraConfig, api: string): Promise<void> {
    if (FAIL_MODE === "enable_error") {
      throw new Error(`Failed to enable ${api}: HTTP 403 Permission denied`);
    }
  },
};

const storedOutputs: BoundaryOutput = {
  vertex_endpoint: "us-central1-aiplatform.googleapis.com",
  kms_key_resource_name:
    "projects/test-project/locations/us-central1/keyRings/aegis-keyring/cryptoKeys/aegis-cmek-key",
  vpc_name: "aegis-vpc",
  audit_bucket: "aegis-audit-logs-test-project",
  perimeter_configured: "true",
};

const failingEngine: IaCEngine = {
  async preview(_config: InfraConfig): Promise<void> {
    if (FAIL_MODE === "engine_error") {
      throw new Error("Pulumi crashed: resource creation failed");
    }
  },
  async up(_config: InfraConfig): Promise<BoundaryOutput> {
    if (FAIL_MODE === "engine_error") {
      throw new Error("Pulumi crashed: resource creation failed");
    }
    return storedOutputs;
  },
  async destroy(_config: InfraConfig): Promise<void> {
    if (FAIL_MODE === "engine_error") {
      throw new Error("Pulumi crashed: resource deletion failed");
    }
  },
  async getOutputs(_config: InfraConfig): Promise<BoundaryOutput | undefined> {
    return storedOutputs;
  },
};

const failingHealthChecker: HealthChecker = {
  async checkAll(_config: InfraConfig, _outputs?: BoundaryOutput): Promise<HealthCheck[]> {
    if (FAIL_MODE === "health_error") {
      throw new Error("Health check crashed: unexpected network error");
    }
    if (FAIL_MODE === "health_fail") {
      return [
        { name: "kms_key_active", status: "pass", detail: "aegis-cmek-key is ENABLED" },
        { name: "vpc_sc_enforced", status: "fail", detail: "VPC-SC perimeter not configured" },
        { name: "audit_sink_flowing", status: "pass", detail: "Audit bucket exists" },
        { name: "model_accessible", status: "pass", detail: "Endpoint verified" },
      ];
    }
    if (FAIL_MODE === "health_partial") {
      return [
        { name: "kms_key_active", status: "pass", detail: "aegis-cmek-key is ENABLED" },
        { name: "vpc_sc_enforced", status: "fail", detail: "VPC-SC perimeter not configured" },
        {
          name: "audit_sink_flowing",
          status: "fail",
          detail: "No aegis-audit-logs bucket found",
        },
        { name: "model_accessible", status: "pass", detail: "Endpoint verified" },
      ];
    }
    return [
      { name: "kms_key_active", status: "pass", detail: "aegis-cmek-key is ENABLED" },
      { name: "vpc_sc_enforced", status: "pass", detail: "VPC-SC perimeter active" },
      { name: "audit_sink_flowing", status: "pass", detail: "Audit bucket exists" },
      { name: "model_accessible", status: "pass", detail: "Endpoint verified" },
    ];
  },
};

createPluginCli({
  name: "gcp-assured-workloads",
  version: "0.2.0",
  description: "IL4/IL5 Assured Workloads boundary in Google Cloud",
  credentials: ["gcp-adc"],
  inputs: [
    { name: "project_id", type: "string", required: true },
    { name: "region", type: "string", default: "us-central1" },
    { name: "impact_level", type: "enum", values: ["IL4", "IL5"], default: "IL4" },
    { name: "model", type: "string", default: "gemini-2.5-pro" },
    { name: "access_policy_id", type: "string" },
  ],
  outputs: [
    "vertex_endpoint",
    "kms_key_resource_name",
    "vpc_name",
    "audit_bucket",
    "perimeter_configured",
  ],
  cspClient: failingCspClient,
  engine: failingEngine,
  healthChecker: failingHealthChecker,
  outputValidation: {
    vertex_endpoint: /^[a-z0-9-]+-aiplatform\.googleapis\.com$/,
    kms_key_resource_name:
      /^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/.+\/cryptoKeys\/.+$/,
    vpc_name: /^[a-z][a-z0-9-]{0,62}$/,
    audit_bucket: /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
    perimeter_configured: /^(true|false)$/,
  },
  requiredApis: [
    "compute.googleapis.com",
    "cloudkms.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "accesscontextmanager.googleapis.com",
  ],
});
