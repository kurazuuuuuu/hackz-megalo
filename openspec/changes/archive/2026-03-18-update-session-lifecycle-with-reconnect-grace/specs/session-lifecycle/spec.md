## MODIFIED Requirements

### Requirement: WebSocket-Scoped Session
The system SHALL define one gameplay session as the lifetime of a single active WebSocket client connection plus a configurable temporary reconnect grace period after an unexpected disconnect.

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

### Requirement: Reconnect Creates a New Session
The system SHALL resume the same session if the client reconnects during the disconnect grace period, and create a new session only after the previous session has actually ended.

#### Scenario: Client reconnects during grace
- **WHEN** a client reconnects while the previous session is still inside the disconnect grace period
- **THEN** the system resumes the existing `session_id`

#### Scenario: Client reconnects after session ended
- **WHEN** a client connects again after the prior session ended
- **THEN** the system creates a different `session_id` for the new connection
