/**
 * E2E test configuration.
 * Guards: tests skip when E2E_PROJECT_ID is not set.
 */

export const E2E_CONFIG = {
  projectId: process.env["E2E_PROJECT_ID"] ?? "",
  region: process.env["E2E_REGION"] ?? "us-central1",
  impactLevel: "IL4" as const,
  accessPolicyId: process.env["E2E_ACCESS_POLICY_ID"],
  pulumiTimeoutMs: 300_000,
};

export function isE2eEnabled(): boolean {
  return E2E_CONFIG.projectId.length > 0;
}

export function e2eInput(): string {
  return JSON.stringify({
    project_id: E2E_CONFIG.projectId,
    region: E2E_CONFIG.region,
    impact_level: E2E_CONFIG.impactLevel,
  });
}

export function runId(): string {
  return `e2e-${Math.floor(Date.now() / 1000)}`;
}
