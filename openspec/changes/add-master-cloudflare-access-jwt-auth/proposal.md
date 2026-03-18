# Change: add Cloudflare Access JWT auth to master-service

## Why
`master-service` currently accepts requests without authentication. Both development and production are exposed through Cloudflare Tunnel, so origin requests should be validated with Cloudflare Access application JWTs to prevent unauthenticated access.

## What Changes
- Add Cloudflare Access JWT verification middleware to `master-service` HTTP and WebSocket endpoints
- Verify token signature using Cloudflare team JWKS (`/cdn-cgi/access/certs`)
- Enforce `iss` (team domain) and `aud` (application audience tag) checks
- Add configuration for enabling auth and supplying Cloudflare Access parameters
- Update Kubernetes manifests so development and production deployments can enable the auth flow
- Add tests for authorization success and failure paths

## Impact
- Affected specs: `master-service-access-auth`
- Affected code: `apps/master-service`, `libs/config`, `k8s-manifests/overlays/local`, `k8s-manifests/overlays/production`
