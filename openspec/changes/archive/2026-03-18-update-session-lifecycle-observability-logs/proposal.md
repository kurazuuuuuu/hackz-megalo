# Change: Strengthen session lifecycle observability logs

## Why
Intermittent "active session not found" failures still occur after Pod restart, and the current logs do not show whether Redis actually created, retained, read, or deleted the active session. The failure path spans `master-service`, `controller-service`, and Redis-backed session state, so operators need correlated logs to identify where the session disappeared.

## What Changes
- Add structured lifecycle logs around active session creation, lookup, grace-period resume, and deletion in `master-service`
- Add registration and state-transition logs in `controller-service` for active session lookup and slave registration
- Add Redis client logs for session key writes, reads, deletes, slave-state writes, and metrics updates that affect session tracking

## Impact
- Affected specs: `session-lifecycle`
- Affected code: `apps/master-service/cmd/server/main.go`, `apps/controller-service/cmd/server/main.go`, `libs/app/controller/service.go`, `libs/infra/redis/redis.go`
