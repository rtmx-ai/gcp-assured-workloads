# REQ-GCG-012: Plugin-Side Security Hardening

## Overview

Implements plugin-specific mitigations for 3 attack vectors:
1. **State poisoning** (Attack 4) -- attacker modifies Pulumi state files in ~/.aegis/state/
2. **Token exfiltration** (Attack 6) -- health check sends ADC token to non-Google endpoint
3. **Output injection** (Attack 3) -- engine returns malicious output values

## Specification

### State Integrity HMAC

After every Pulumi state write, compute HMAC-SHA256 of the state directory contents and store in `.aegis-integrity`. Before every state read, verify the HMAC. Key derived from a stable local identifier (machine-id or hostname hash).

Implementation: `src/state-integrity.ts` with `computeStateHmac()` and `verifyStateIntegrity()`. Wired into `engine.ts` before `getStack()`.

### Domain Allowlist in fetchWithRetry

`fetchWithRetry` gains an optional `allowedDomains` parameter. When set, any URL whose hostname does not match an allowed pattern is rejected before the network call.

```typescript
const ALLOWED_DOMAINS = ["*.googleapis.com", "oauth2.googleapis.com", "accounts.google.com"];
```

Pattern matching: `*.googleapis.com` matches `us-central1-aiplatform.googleapis.com` but NOT `googleapis.com.evil.com`.

### Scoped Tokens

`getAdcToken()` gains an optional `scope` parameter. Default remains `cloud-platform` for backward compatibility. Health checks call `getAdcToken("cloud-platform.read-only")`. Engine operations call `getAdcToken()` (full scope).

Tokens are cached per-scope independently.

### Output Validation Patterns

`index.ts` declares `outputValidation` in the `createPluginCli` config:

```typescript
outputValidation: {
  vertex_endpoint: /^[a-z0-9-]+-aiplatform\.googleapis\.com$/,
  kms_key_resource_name: /^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/keyRings\/.+\/cryptoKeys\/.+$/,
  vpc_name: /^[a-z][a-z0-9-]{0,62}$/,
  audit_bucket: /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/,
  perimeter_configured: /^(true|false)$/,
}
```

### Enhanced plugin.json

Add author and security metadata per REQ-SDK-010.

### Exact SDK Version Pinning

Change `package.json` from `"@aegis-cli/infra-sdk": "^0.1.0"` to `"@aegis-cli/infra-sdk": "0.1.0"`.

## BDD Scenarios

### Scenario 1: State tampering detected
- Given a valid Pulumi state with matching HMAC
- When an attacker modifies a state file
- And the plugin runs any stateful subcommand
- Then the HMAC mismatch is detected
- And the result has error "State integrity check failed"

### Scenario 2: Non-Google domain blocked
- Given fetchWithRetry with allowedDomains ["*.googleapis.com"]
- When a fetch targets "https://evil.com/exfil"
- Then the call throws before any network request

### Scenario 3: Subdomain bypass blocked
- Given allowedDomains ["*.googleapis.com"]
- When a fetch targets "https://googleapis.com.evil.com/exfil"
- Then the call throws (not a subdomain of googleapis.com)

### Scenario 4: Scoped token for health checks
- Given getAdcToken called with "cloud-platform.read-only"
- Then the token is cached under the read-only scope key
- And a subsequent call with the same scope returns the cached token

### Scenario 5: Output regex catches injection
- Given outputValidation with vertex_endpoint pattern
- And engine returns vertex_endpoint "evil-proxy.attacker.com"
- Then the SDK rejects the output before emission

## TDD Test Signatures

- `computeStateHmac`: HMAC-SHA256 of state directory
- `verifyStateIntegrity`: Compare computed HMAC to stored value
- `isDomainAllowed`: Pattern matching for domain allowlist
- `getAdcToken` with scope: Per-scope caching
- Plugin manifest security metadata test

## Acceptance Criteria

- [AC1] State tampering produces a clear error, not silent corruption
- [AC2] Health checks cannot reach non-Google domains
- [AC3] Subdomain bypass attempts are blocked
- [AC4] Health check tokens are read-only scoped
- [AC5] All GCP-specific output values are validated by regex
- [AC6] SDK dependency uses exact version (no ^)
- [AC7] plugin.json contains author and security metadata

## Traceability

- Tests: src/__tests__/state-integrity.test.ts, src/__tests__/domain-allowlist.test.ts, src/__tests__/scoped-tokens.test.ts
- Attacks: 3 (Output Injection), 4 (State Poisoning), 6 (Token Exfiltration)
