import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  deriveHmacKey,
  computeStateHmac,
  writeStateIntegrity,
  verifyStateIntegrity,
} from "../state-integrity.js";

// rtmx:req REQ-GCG-012: State integrity

function createTempState(): string {
  const dir = mkdtempSync(join(tmpdir(), "aegis-state-test-"));
  writeFileSync(join(dir, "stack.json"), '{"resources":[]}');
  writeFileSync(join(dir, "config.json"), '{"project":"test"}');
  return dir;
}

describe("deriveHmacKey", () => {
  it("returns consistent value", () => {
    expect(deriveHmacKey()).toBe(deriveHmacKey());
  });

  it("returns 64-char hex string", () => {
    expect(deriveHmacKey()).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("computeStateHmac", () => {
  it("computes HMAC for a state directory", () => {
    const dir = createTempState();
    const hmac = computeStateHmac(dir);
    expect(hmac).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns same HMAC for same content", () => {
    const dir = createTempState();
    expect(computeStateHmac(dir)).toBe(computeStateHmac(dir));
  });
});

describe("verifyStateIntegrity", () => {
  it("returns true when no integrity file exists (first run)", () => {
    const dir = createTempState();
    expect(verifyStateIntegrity(dir)).toBe(true);
  });

  it("returns true for unmodified state", () => {
    const dir = createTempState();
    writeStateIntegrity(dir);
    expect(verifyStateIntegrity(dir)).toBe(true);
  });

  it("detects file modification", () => {
    const dir = createTempState();
    writeStateIntegrity(dir);
    writeFileSync(join(dir, "stack.json"), '{"resources":[{"hacked":true}]}');
    expect(verifyStateIntegrity(dir)).toBe(false);
  });

  it("detects file addition", () => {
    const dir = createTempState();
    writeStateIntegrity(dir);
    writeFileSync(join(dir, "injected.json"), '{"backdoor":true}');
    expect(verifyStateIntegrity(dir)).toBe(false);
  });

  it("detects file deletion", () => {
    const dir = createTempState();
    writeStateIntegrity(dir);
    unlinkSync(join(dir, "config.json"));
    expect(verifyStateIntegrity(dir)).toBe(false);
  });
});
