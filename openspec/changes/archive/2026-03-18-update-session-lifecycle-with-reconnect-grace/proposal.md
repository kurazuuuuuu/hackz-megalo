# Change: update session lifecycle with reconnect grace

## Why
The current session model ends immediately when the gameplay WebSocket disconnects. That makes transient disconnects and Pod restarts race against session cleanup, so restarted slave Pods can fail to register with `active session not found` even though the player experience should still be recoverable.

## What Changes
- Add a configurable disconnect grace period for `master-service` session cleanup
- Keep the active session available during short unintentional disconnects so restarted slave Pods can still register
- Allow the client to resume the same session when reconnecting during the grace window
- Keep explicit user-driven disconnect as an immediate session end path

## Impact
- Affected specs: `session-lifecycle`, `playable-frontend`
- Affected code: `apps/master-service/cmd/server/main.go`, `apps/master-service/cmd/server/main_test.go`, `libs/config/config.go`, `libs/config/config_test.go`, `apps/frontend-webxr/src/api.ts`, `apps/frontend-webxr/src/main.ts`
