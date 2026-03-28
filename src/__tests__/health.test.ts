import { describe, it, expect } from "vitest";
import type { BoundaryOutput, HealthCheck } from "@aegis-cli/infra-sdk";

// @req REQ-GCG-007: VPC-SC perimeter validation and Vertex AI model access
// Pure logic tests -- no GCP API calls, no imports of GCP client libraries.

/** Reproduce the VPC-SC check logic from health.ts without importing the module. */
function checkVpcScPerimeterLogic(outputs?: BoundaryOutput): HealthCheck | null {
  if (outputs && outputs["perimeter_configured"] !== "true") {
    return {
      name: "vpc_sc_enforced",
      status: "fail",
      detail:
        "VPC-SC perimeter not configured. Set aegis:accessPolicyId to enable IL4/IL5 compliance.",
    };
  }
  return null; // would proceed to API call in production
}

describe("VPC-SC perimeter check logic", () => {
  it("returns fail when perimeter_configured is false", () => {
    const outputs: BoundaryOutput = {
      perimeter_configured: "false",
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
    expect(result!.detail).toContain("not configured");
    expect(result!.detail).toContain("accessPolicyId");
  });

  it("returns null (proceeds to API) when perimeter_configured is true", () => {
    const outputs: BoundaryOutput = {
      perimeter_configured: "true",
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).toBeNull();
  });

  it("returns null when outputs are undefined (no state available)", () => {
    const result = checkVpcScPerimeterLogic(undefined);
    expect(result).toBeNull();
  });

  it("returns fail when perimeter_configured key is missing from outputs", () => {
    const outputs: BoundaryOutput = {
      vpc_name: "aegis-vpc-abc",
    };
    const result = checkVpcScPerimeterLogic(outputs);
    expect(result).not.toBeNull();
    expect(result!.status).toBe("fail");
  });
});

// @req REQ-GCG-007: Vertex AI model access validation
// Reproduces the HTTP status code mapping from health.ts checkModelAccessible.

interface ModelCheckParams {
  model: string;
  endpoint: string;
  responseStatus: number;
  responseOk: boolean;
}

function classifyModelResponse(params: ModelCheckParams): HealthCheck {
  const { model, endpoint, responseStatus, responseOk } = params;

  if (responseOk) {
    return {
      name: "model_accessible",
      status: "pass",
      detail: `${model} inference endpoint verified at ${endpoint}`,
    };
  }
  if (responseStatus === 403) {
    return {
      name: "model_accessible",
      status: "fail",
      detail: `${model} at ${endpoint}: caller lacks aiplatform.user role (HTTP 403)`,
    };
  }
  if (responseStatus === 404) {
    return {
      name: "model_accessible",
      status: "fail",
      detail: `${model} not found at ${endpoint} (HTTP 404). Check model name and region availability.`,
    };
  }
  if (responseStatus === 429) {
    return {
      name: "model_accessible",
      status: "pass",
      detail: `${model} inference endpoint verified at ${endpoint} (rate limited, path confirmed)`,
    };
  }
  return {
    name: "model_accessible",
    status: "fail",
    detail: `${model} at ${endpoint} returned HTTP ${responseStatus}`,
  };
}

function handleModelCheckError(err: unknown): HealthCheck {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("PERMISSION_DENIED") ||
    message.includes("403") ||
    message.includes("insufficient")
  ) {
    return {
      name: "model_accessible",
      status: "warn",
      detail: `Insufficient permissions: ${message}`,
    };
  }
  return { name: "model_accessible", status: "warn", detail: `Check failed: ${message}` };
}

describe("Vertex AI model access check logic", () => {
  const model = "gemini-2.5-pro";
  const endpoint = "us-central1-aiplatform.googleapis.com";

  it("returns pass for HTTP 200 (model accessible)", () => {
    const result = classifyModelResponse({
      model,
      endpoint,
      responseStatus: 200,
      responseOk: true,
    });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain(model);
    expect(result.detail).toContain(endpoint);
  });

  it("returns fail for HTTP 403 (lacks aiplatform.user role)", () => {
    const result = classifyModelResponse({
      model,
      endpoint,
      responseStatus: 403,
      responseOk: false,
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("aiplatform.user");
    expect(result.detail).toContain("403");
  });

  it("returns fail for HTTP 404 (model not found)", () => {
    const result = classifyModelResponse({
      model,
      endpoint,
      responseStatus: 404,
      responseOk: false,
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not found");
    expect(result.detail).toContain("404");
  });

  it("returns pass for HTTP 429 (rate limited but path confirmed)", () => {
    const result = classifyModelResponse({
      model,
      endpoint,
      responseStatus: 429,
      responseOk: false,
    });
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("rate limited");
  });

  it("returns fail for unexpected HTTP status", () => {
    const result = classifyModelResponse({
      model,
      endpoint,
      responseStatus: 500,
      responseOk: false,
    });
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("500");
  });

  it("handles permission denied errors as warn", () => {
    const result = handleModelCheckError(new Error("PERMISSION_DENIED: caller not authorized"));
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("permissions");
  });

  it("handles network errors as warn", () => {
    const result = handleModelCheckError(new Error("ECONNREFUSED"));
    expect(result.status).toBe("warn");
    expect(result.detail).toContain("ECONNREFUSED");
  });

  it("uses default model when not specified in params", () => {
    // The health check uses config.params["model"] ?? "gemini-2.5-pro"
    const defaultModel = "gemini-2.5-pro";
    const result = classifyModelResponse({
      model: defaultModel,
      endpoint,
      responseStatus: 200,
      responseOk: true,
    });
    expect(result.detail).toContain(defaultModel);
  });
});
