## 1. Implementation
- [x] 1.1 Add OpenSpec deltas for Cloudflare Access JWT authentication on master-service
- [x] 1.2 Add master-service Cloudflare Access JWT verification middleware and key-fetch logic
- [x] 1.3 Add config loading/validation for Cloudflare Access auth settings
- [x] 1.4 Add/adjust tests for authorized and unauthorized request flows
- [x] 1.5 Update deployment manifests for development and production auth configuration
- [x] 1.6 Validate with `openspec validate --strict` and targeted Go tests (`./libs/config`, `./apps/master-service/cmd/server`)
