## MODIFIED Requirements

### Requirement: WebSocket-Scoped Session
The system SHALL define one gameplay session as the lifetime of a single active WebSocket client connection plus a configurable temporary reconnect grace period after an unexpected disconnect, and SHALL emit diagnostic logs that allow operators to trace active-session persistence across `master-service`, `controller-service`, and Redis.

#### Scenario: Session starts on WebSocket connection
- **WHEN** a client establishes a WebSocket connection to `master-service`
- **THEN** the system creates a new `session_id` and marks the session as active

#### Scenario: Session enters reconnect grace after unexpected disconnect
- **WHEN** the active WebSocket connection closes without an explicit client session-end request
- **THEN** the system keeps the session active for a configured disconnect grace period
- **AND** the active session remains queryable during that grace period

#### Scenario: Session ends after grace expires
- **WHEN** the reconnect grace period expires without a client reconnect
- **THEN** the system marks the session as ended and treats the session as finished

#### Scenario: Explicit disconnect ends immediately
- **WHEN** the client explicitly requests session termination
- **THEN** the system ends the session immediately without waiting for the reconnect grace period

#### Scenario: Operators trace active session through logs
- **WHEN** a session is created, looked up, resumed, or deleted, or a slave registers against it
- **THEN** `master-service`, `controller-service`, and Redis-backed session operations emit logs containing enough identifiers to correlate the transition
