## ADDED Requirements

### Requirement: Cloudflare Access JWT Verification
The system SHALL require `master-service` requests (except health checks) to present a valid Cloudflare Access application token and verify it against Cloudflare-published signing keys.

#### Scenario: Valid token
- **WHEN** a request includes a valid Cloudflare Access JWT for the configured team domain and audience
- **THEN** `master-service` accepts the request and continues normal processing

#### Scenario: Missing token
- **WHEN** a request is sent without Cloudflare Access JWT credentials
- **THEN** `master-service` rejects the request as unauthorized

#### Scenario: Invalid token
- **WHEN** a request includes an expired, malformed, or signature-invalid JWT, or a JWT with mismatched issuer/audience
- **THEN** `master-service` rejects the request as unauthorized

### Requirement: Health Check Compatibility
The system SHALL keep `master-service` health checks available without Cloudflare Access JWT validation.

#### Scenario: Health check without token
- **WHEN** a caller accesses `/healthz` without JWT credentials
- **THEN** `master-service` responds successfully if the process is healthy
