/**
 * State directory integrity verification via HMAC-SHA256.
 * Detects tampering of Pulumi state files (Attack 4: state poisoning).
 *
 * Implements: REQ-GCG-012
 */

import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { hostname } from "node:os";

const INTEGRITY_FILE = ".aegis-integrity";

/** Derive a stable HMAC key from the local machine identity. */
export function deriveHmacKey(): string {
  return createHmac("sha256", "aegis-state-integrity").update(hostname()).digest("hex");
}

/**
 * Compute HMAC-SHA256 of all files in a state directory.
 * Excludes the integrity file itself. Files sorted for determinism.
 */
export function computeStateHmac(stateDir: string): string {
  const key = deriveHmacKey();
  const hmac = createHmac("sha256", key);

  const files = readdirSync(stateDir)
    .filter((f) => f !== INTEGRITY_FILE)
    .sort();

  for (const file of files) {
    const filePath = join(stateDir, file);
    const content = readFileSync(filePath);
    hmac.update(file);
    hmac.update(content);
  }

  return hmac.digest("hex");
}

/** Write integrity HMAC to the state directory. */
export function writeStateIntegrity(stateDir: string): void {
  const hmac = computeStateHmac(stateDir);
  writeFileSync(join(stateDir, INTEGRITY_FILE), hmac);
}

/**
 * Verify state directory integrity.
 * Returns true if HMAC matches or if no integrity file exists (first run).
 */
export function verifyStateIntegrity(stateDir: string): boolean {
  const integrityPath = join(stateDir, INTEGRITY_FILE);
  if (!existsSync(integrityPath)) {
    return true; // First run, no integrity file yet
  }

  const storedHmac = readFileSync(integrityPath, "utf-8").trim();
  const computedHmac = computeStateHmac(stateDir);
  return storedHmac === computedHmac;
}
