#!/usr/bin/env node

/**
 * Mock GCP plugin that uses createPluginCli with in-memory implementations.
 * Mirrors the real gcp-assured-workloads plugin's inputs, outputs, and requiredApis
 * but replaces all GCP calls with mocks.
 *
 * Used by integration tests to verify end-to-end protocol behavior as a real subprocess.
 */

import { createPluginCli } from "@aegis-cli/infra-sdk";
import type { CspClient, IaCEngine, HealthChecker } from "@aegis-cli/infra-sdk";
import type { InfraConfig, BoundaryOutput, HealthCheck } from "@aegis-cli/infra-sdk";

const mockCspClient: CspClient = {
  async validateCredentials(): Promise<boolean> {
    return true;
  },
  async checkAccess(_config: InfraConfig): Promise<boolean> {
    return true;
  },
  async getApiState(_config: InfraConfig, _api: string): Promise<"ENABLED" | "DISABLED"> {
    return "ENABLED";
  },
  async enableApi(_config: InfraConfig, _api: string): Promise<void> {
    // no-op
  },
};

let provisioned = false;
const storedOutputs: BoundaryOutput = {
  vertex_endpoint: "us-central1-aiplatform.googleapis.com",
  kms_key_resource_name:
    "projects/test-project/locations/us-central1/keyRings/aegis-keyring/cryptoKeys/aegis-cmek-key",
  vpc_name: "aegis-vpc",
  audit_bucket: "aegis-audit-logs-test-project",
  perimeter_configured: "true",
};

const mockEngine: IaCEngine = {
  async preview(_config: InfraConfig): Promise<void> {
    // no-op, preview produces no outputs
  },
  async up(_config: InfraConfig): Promise<BoundaryOutput> {
    provisioned = true;
    return storedOutputs;
  },
  async destroy(_config: InfraConfig): Promise<void> {
    provisioned = false;
  },
  async getOutputs(_config: InfraConfig): Promise<BoundaryOutput | undefined> {
    return provisioned ? storedOutputs : undefined;
  },
};

const mockHealthChecker: HealthChecker = {
  async checkAll(_config: InfraConfig, _outputs?: BoundaryOutput): Promise<HealthCheck[]> {
    return [
      { name: "kms_key_active", status: "pass", detail: "aegis-cmek-key is ENABLED" },
      {
        name: "vpc_sc_enforced",
        status: "pass",
        detail: "aegis-vpc network exists with VPC-SC perimeter active",
      },
      {
        name: "audit_sink_flowing",
        status: "pass",
        detail: "Audit bucket aegis-audit-logs-test-project exists",
      },
      {
        name: "model_accessible",
        status: "pass",
        detail: "gemini-2.5-pro inference endpoint verified",
      },
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
  cspClient: mockCspClient,
  engine: mockEngine,
  healthChecker: mockHealthChecker,
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
