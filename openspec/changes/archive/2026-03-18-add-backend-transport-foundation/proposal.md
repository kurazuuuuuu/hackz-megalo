# Change: add backend transport foundation

## Why
The backend services are not implemented yet, but the project needs a minimal transport foundation that matches the intended architecture. We need Redis-based coordination between `master-service` and `controller-service`, plus minimal gRPC communication from `controller-service` to `slave-service`.

## What Changes
- Add shared Go backend libraries under `libs/`
- Add minimal `master-service`, `controller-service`, and `slave-service` implementations
- Add Redis Pub/Sub state synchronization between master and controller
- Add `controller -> slave` gRPC transport with a minimal `ExecuteEvent` RPC
- Add per-service Dockerfiles, Air configs, and compose files for build and runtime verification

## Impact
- Affected specs: `backend-transport`
- Affected code: `apps/master-service`, `apps/controller-service`, `apps/slave-service`, `libs`, `compose.yml`, `build-compose.yml`, `mise.toml`
