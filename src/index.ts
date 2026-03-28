#!/usr/bin/env node

import { createPluginCli } from "@aegis-cli/infra-sdk";
import { GcpClient } from "./csp-client.js";
import { GcpPulumiEngine } from "./engine.js";
import { GcpHealthChecker } from "./health.js";

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
  cspClient: new GcpClient(),
  engine: new GcpPulumiEngine(),
  healthChecker: new GcpHealthChecker(),
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
