import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// rtmx:req REQ-GCG-009

/**
 * Verifies that the plugin consumes @aegis-cli/infra-sdk correctly:
 * - AC1: Plugin implements 3 port interfaces and calls createPluginCli
 * - AC5: SDK owns the contract version (plugin does not hardcode protocol)
 * - AC6: No protocol, lifecycle, or CLI dispatch code in plugin source
 */

const SRC_DIR = path.resolve(__dirname, "..");

function readSource(file: string): string {
  return fs.readFileSync(path.join(SRC_DIR, file), "utf-8");
}

const PLUGIN_SOURCE_FILES = ["index.ts", "csp-client.ts", "engine.ts", "health.ts", "stack.ts"];

describe("SDK integration (REQ-GCG-009)", () => {
  it("index.ts calls createPluginCli from @aegis-cli/infra-sdk", () => {
    const index = readSource("index.ts");
    expect(index).toContain('import { createPluginCli } from "@aegis-cli/infra-sdk"');
    expect(index).toContain("createPluginCli(");
  });

  it("csp-client.ts implements CspClient port interface", () => {
    const src = readSource("csp-client.ts");
    expect(src).toContain("import type { CspClient");
    expect(src).toMatch(/class\s+GcpClient\s+implements\s+CspClient/);
  });

  it("engine.ts implements IaCEngine port interface", () => {
    const src = readSource("engine.ts");
    expect(src).toContain("import type { IaCEngine");
    expect(src).toMatch(/class\s+GcpPulumiEngine\s+implements\s+IaCEngine/);
  });

  it("health.ts implements HealthChecker port interface", () => {
    const src = readSource("health.ts");
    expect(src).toContain("import type { HealthChecker");
    expect(src).toMatch(/class\s+GcpHealthChecker\s+implements\s+HealthChecker/);
  });

  it("plugin source contains no protocol emission or CLI dispatch code", () => {
    for (const file of PLUGIN_SOURCE_FILES) {
      const src = readSource(file);
      expect(src, `${file} should not contain StdoutEmitter`).not.toContain("StdoutEmitter");
      expect(src, `${file} should not contain parseSubcommand`).not.toContain("parseSubcommand");
      expect(src, `${file} should not contain process.argv parsing`).not.toMatch(
        /process\.argv\.(slice|indexOf)/,
      );
    }
  });

  it("plugin declares all three port implementations in createPluginCli call", () => {
    const index = readSource("index.ts");
    expect(index).toContain("cspClient:");
    expect(index).toContain("engine:");
    expect(index).toContain("healthChecker:");
  });

  it("@aegis-cli/infra-sdk is a production dependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC_DIR, "..", "package.json"), "utf-8"));
    expect(pkg.dependencies).toHaveProperty("@aegis-cli/infra-sdk");
  });
});
