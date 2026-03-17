# Change: add slave state registration schema

## Why
`slave-service` is the main gameplay entity, but its identity and lifecycle are not modeled yet. We need a canonical slave state schema and a registration flow so that controller, master, Redis, and gRPC all describe the same entity consistently.

## What Changes
- Add a canonical `SlaveState` schema with logical slave identity and Kubernetes metadata
- Add slave self-registration from `slave-service` to `controller-service`
- Add controller-side UUID issuance and Redis state publication
- Extend gRPC definitions to support registration and richer state responses
- Model lifespan-related terminal states in the schema

## Impact
- Affected specs: `slave-lifecycle`
- Affected code: `apps/controller-service`, `apps/slave-service`, `apps/master-service`, `libs/domain`, `libs/config`, `libs/infra/redis`, `libs/transport/grpc`
