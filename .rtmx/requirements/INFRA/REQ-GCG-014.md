# REQ-GCG-014: E2E Test Infrastructure and GCP Test Harness

## Overview

The plugin's E2E tests run against a real GCP project (`aegis-cli-demo`) and must manage GCP resources that have heterogeneous lifecycles. Some resources (KMS KeyRings) are immutable once created. Others (GCS buckets) are fully ephemeral. The test harness must separate long-lived shared fixtures from per-run ephemeral resources to keep E2E runs fast, repeatable, and cost-effective.

## Design Principles

1. **Shared fixtures are provisioned once, reused across runs.** They survive `afterAll` and are checked/repaired at the start of each run.
2. **Ephemeral resources are created and destroyed per test run.** They use a run-specific suffix for isolation.
3. **No test run assumes prior state.** The harness converges: it creates what's missing and reuses what exists.
4. **Cleanup is mandatory.** Ephemeral resources are destroyed in `afterAll` even on test failure.
5. **Cost is near-zero at rest.** Shared fixtures (KMS keys, IAM config) incur no ongoing cost when idle.

## Specification

### Resource Classification

| Resource | Lifecycle | Reason | Managed By |
|----------|-----------|--------|------------|
| Enabled APIs (compute, kms, storage, iam, crm) | Shared | Enabling is slow (~30s per API); once enabled, free to keep | Harness setup |
| KMS KeyRing | Shared | Cannot be deleted; accumulating KeyRings wastes namespace | Harness setup (create once) |
| KMS CryptoKey | Shared | Cannot be deleted; lives inside the shared KeyRing | Harness setup (create once) |
| IAM Audit Config | Shared | Project-global; setting is idempotent, no cost | Harness setup |
| CMEK IAM Binding | Ephemeral | Depends on project number; cheap, fast to create | Plugin under test |
| VPC Network | Ephemeral | Quick to create/destroy; tests need clean network state | Plugin under test |
| Subnet | Ephemeral | Part of VPC; destroyed with network | Plugin under test |
| GCS Audit Bucket | Ephemeral | Tests need fresh bucket; CMEK-encrypted, must destroy cleanly | Plugin under test |
| VPC-SC Perimeter | Conditional | Requires org-level access policy; skip when unavailable | Plugin under test (if accessPolicyId provided) |

### Harness Architecture

```
tests/
  e2e/
    harness/
      shared-fixtures.ts    -- Ensures shared resources exist (APIs, KMS, IAM audit)
      config.ts             -- Test project config (project ID, region, run ID)
      cleanup.ts            -- Ephemeral resource cleanup
    steps/
      protocol.steps.ts     -- Cucumber step definitions for contract.feature
      provisioning.steps.ts -- Step definitions for boundary.feature, initialization.feature
      lifecycle.steps.ts    -- Step definitions for unified-lifecycle.feature
      health.steps.ts       -- Step definitions for health.feature, vpc-sc-vertex.feature
      state.steps.ts        -- Step definitions for state.feature
    support/
      world.ts              -- Cucumber World with plugin runner and event parser
      hooks.ts              -- Before/After hooks for setup and cleanup
```

### Shared Fixtures Stack

A separate Pulumi stack (`e2e-shared-fixtures`) manages long-lived resources:

```typescript
// Idempotent: createOrSelect, never destroys
const stack = await LocalWorkspace.createOrSelectStack({
  stackName: "e2e-shared-fixtures",
  projectName: "gcp-assured-workloads-e2e",
  program: async () => {
    // KMS KeyRing (cannot be deleted, reuse always)
    const keyRing = new gcp.kms.KeyRing("e2e-keyring", {
      location: "us-central1",
      project: projectId,
    });
    // CryptoKey (cannot be deleted, reuse always)
    new gcp.kms.CryptoKey("e2e-cmek-key", {
      keyRing: keyRing.id,
      rotationPeriod: "2592000s",
    });
    // IAM Audit Config (idempotent, project-global)
    new gcp.projects.IAMAuditConfig("e2e-audit-config", {
      project: projectId,
      service: "allServices",
      auditLogConfigs: [
        { logType: "ADMIN_READ" },
        { logType: "DATA_READ" },
        { logType: "DATA_WRITE" },
      ],
    });
  },
});
await stack.up(); // Converges: no-op if already provisioned
```

### Ephemeral Run Isolation

Each test run generates a short run ID (e.g., `e2e-1711500000`) derived from the Unix timestamp. The plugin under test uses this as a suffix for ephemeral resource names:

```typescript
const runId = `e2e-${Math.floor(Date.now() / 1000)}`;
const input = {
  project_id: "aegis-cli-demo",
  region: "us-central1",
  impact_level: "IL4",
  // Run-specific isolation is handled by Pulumi stack name
};
```

Pulumi stack name for ephemeral resources: `e2e-run-{runId}`. This ensures parallel runs don't collide.

### Cleanup Contract

| Phase | Action |
|-------|--------|
| `beforeAll` | Ensure shared fixtures exist (idempotent `up`) |
| `beforeAll` | Verify API enablement (poll, no enable -- APIs are shared) |
| `beforeEach` | No-op (each scenario gets a fresh subcommand invocation) |
| `afterAll` | Destroy ephemeral stack (`e2e-run-{runId}`) |
| `afterAll` | Shared fixtures are NOT destroyed |
| On failure | `afterAll` still runs; ephemeral cleanup is best-effort |

### Test Project Configuration

```typescript
// tests/e2e/harness/config.ts
export const E2E_CONFIG = {
  projectId: process.env["E2E_PROJECT_ID"] ?? "aegis-cli-demo",
  region: process.env["E2E_REGION"] ?? "us-central1",
  impactLevel: "IL4",
  // Optional: set to enable VPC-SC scenarios
  accessPolicyId: process.env["E2E_ACCESS_POLICY_ID"],
  // Timeout for Pulumi operations
  pulumiTimeoutMs: 300_000,
};
```

### CI via Workload Identity Federation

E2E tests run in CI using GCP Workload Identity Federation (WIF). No stored secrets.

**GCP Resources (provisioned in `aegis-cli-demo`):**

| Resource | Value |
|----------|-------|
| WIF Pool | `projects/385266150638/locations/global/workloadIdentityPools/github-actions` |
| OIDC Provider | `projects/385266150638/locations/global/workloadIdentityPools/github-actions/providers/rtmx-ai` |
| Service Account | `e2e-runner@aegis-cli-demo.iam.gserviceaccount.com` |
| Attribute Condition | `assertion.repository_owner == 'rtmx-ai'` |
| Principal Binding | `attribute.repository/rtmx-ai/gcp-assured-workloads` |

**Service Account Roles:**

| Role | Purpose |
|------|---------|
| `roles/cloudkms.admin` | Create/manage KMS KeyRings and CryptoKeys |
| `roles/compute.networkAdmin` | Create/destroy VPC and subnets |
| `roles/storage.admin` | Create/destroy GCS audit buckets |
| `roles/serviceusage.serviceUsageAdmin` | Check/enable APIs |
| `roles/iam.securityAdmin` | Manage IAM audit config |
| `roles/resourcemanager.projectIamAdmin` | Manage project IAM bindings |
| `roles/aiplatform.user` | Vertex AI model access health check |

**E2E Workflow (`.github/workflows/e2e.yml`):**

Triggers:
- `workflow_dispatch` (manual)
- `push` to tags matching `v*` (releases)

Requires `id-token: write` permission for OIDC token exchange.

**Execution modes:**
- **CI**: Triggered by release tag or manual dispatch; authenticates via WIF
- **Local**: Developer runs `npm run test:e2e` with local ADC (`gcloud auth application-default login`)
- **Guard**: `E2E_PROJECT_ID` env var must be set, otherwise tests skip gracefully

## Acceptance Criteria

- [AC1] Shared fixtures stack exists and is idempotent (running twice is a no-op)
- [AC2] Ephemeral resources use run-specific Pulumi stack names
- [AC3] `afterAll` destroys ephemeral stack even on test failure
- [AC4] E2E tests skip gracefully when `E2E_PROJECT_ID` is not set
- [AC5] All 7 feature files have step definitions
- [AC6] E2E tests pass against `aegis-cli-demo` with valid ADC
- [AC7] Shared fixtures cost $0/month when idle

## Traceability

- Parent: REQ-GCG-001 through REQ-GCG-007 (E2E test rows in database)
- Depends on: GCP project `aegis-cli-demo` in rtmx-ai organization
- Deliverables: tests/e2e/ directory, cucumber.js config, step definitions
