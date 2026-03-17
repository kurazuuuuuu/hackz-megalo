# Change: add master internal test api

## Why
The backend transport foundation is in place, but validating slave registration and event processing still requires direct Redis inspection or ad-hoc commands. A small internal HTTP API on `master-service` will make internal testing and debugging easier without changing the public gameplay API surface.

## What Changes
- Add internal test HTTP endpoints to `master-service`
- Allow listing and reading canonical slave states from Redis through master
- Add an internal event injection endpoint separate from the public-facing event API
- Document the internal test API behavior in OpenSpec

## Impact
- Affected specs: `master-internal-test-api`
- Affected code: `apps/master-service`, `libs/infra/redis`
