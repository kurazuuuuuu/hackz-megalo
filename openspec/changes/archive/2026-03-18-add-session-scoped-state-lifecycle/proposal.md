# Change: add session scoped state lifecycle

## Why
The backend now models slave identity and transport, but the gameplay session boundary is still implicit. We need a clear session lifecycle tied to the single WebSocket client so that Redis data, slave state, and aggregate counts are scoped consistently and cleaned up deterministically.

## What Changes
- Define a gameplay session as one WebSocket connection from connect until disconnect
- Add session-scoped Redis data for session metadata, aggregate metrics, and active slave state
- Define reconnect behavior as creating a brand new session instead of resuming the old one
- Assign controller ownership for live and gone slave counters
- Require Redis cleanup for ended sessions

## Impact
- Affected specs: `session-lifecycle`
- Affected code: `apps/master-service`, `apps/controller-service`, `apps/slave-service`, `libs/domain`, `libs/infra/redis`, `libs/transport/grpc`
