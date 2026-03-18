## 1. Implementation
- [x] 1.1 Add OpenSpec deltas for session lifecycle observability logs
- [x] 1.2 Add Redis logs for active session create, read, delete, slave-state write, and metrics updates
- [x] 1.3 Add `controller-service` logs for registration and state-driven shutdown flow
- [x] 1.4 Add `master-service` logs for WebSocket session lifecycle and frontend-driven pod state updates
- [x] 1.5 Run `openspec validate update-session-lifecycle-observability-logs --strict`
- [x] 1.6 Run `golangci-lint run`
- [x] 1.7 Run `docker compose build master-service controller-service` at the repository root
