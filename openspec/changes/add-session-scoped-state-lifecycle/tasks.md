## 1. Implementation
- [ ] 1.1 Add OpenSpec deltas for WebSocket-scoped session lifecycle
- [ ] 1.2 Add `SessionMeta`, `SessionMetrics`, and session-scoped `SlaveState` fields to shared schemas
- [ ] 1.3 Update Redis key design to use `session_id` for metadata, metrics, and active slaves
- [ ] 1.4 Add master-side WebSocket session creation, single-client enforcement, and session teardown flow
- [ ] 1.5 Add controller-side session metrics ownership for slave registration and terminal state updates
- [ ] 1.6 Add session-aware internal state inspection and event injection behavior
- [ ] 1.7 Add validation and tests for session creation, cleanup, reconnect, and metrics updates
