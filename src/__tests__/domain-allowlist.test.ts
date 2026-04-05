import { describe, it, expect } from "vitest";
import { isDomainAllowed, GCP_ALLOWED_DOMAINS } from "../fetch-retry.js";

// rtmx:req REQ-GCG-012: Domain allowlist

describe("isDomainAllowed", () => {
  const domains = GCP_ALLOWED_DOMAINS;

  it("allows us-central1-aiplatform.googleapis.com", () => {
    expect(isDomainAllowed("https://us-central1-aiplatform.googleapis.com/v1/test", domains)).toBe(
      true,
    );
  });

  it("allows cloudresourcemanager.googleapis.com", () => {
    expect(
      isDomainAllowed("https://cloudresourcemanager.googleapis.com/v1/projects", domains),
    ).toBe(true);
  });

  it("allows exact match oauth2.googleapis.com", () => {
    expect(isDomainAllowed("https://oauth2.googleapis.com/token", domains)).toBe(true);
  });

  it("allows exact match accounts.google.com", () => {
    expect(isDomainAllowed("https://accounts.google.com/auth", domains)).toBe(true);
  });

  it("blocks attacker.com", () => {
    expect(isDomainAllowed("https://attacker.com/exfil?token=abc", domains)).toBe(false);
  });

  it("blocks googleapis.com.evil.com (subdomain bypass attempt)", () => {
    expect(isDomainAllowed("https://googleapis.com.evil.com/exfil", domains)).toBe(false);
  });

  it("blocks evil-googleapis.com (partial match bypass)", () => {
    expect(isDomainAllowed("https://evil-googleapis.com/exfil", domains)).toBe(false);
  });

  it("passes through when allowedDomains is undefined", () => {
    expect(isDomainAllowed("https://anything.com/test", undefined)).toBe(true);
  });

  it("passes through when allowedDomains is empty", () => {
    expect(isDomainAllowed("https://anything.com/test", [])).toBe(true);
  });

  it("returns false for invalid URL", () => {
    expect(isDomainAllowed("not-a-url", domains)).toBe(false);
  });
});
