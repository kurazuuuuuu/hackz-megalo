# session-lifecycle Specification

## Purpose
TBD - created by archiving change add-session-scoped-state-lifecycle. Update Purpose after archive.
## Requirements
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

### Requirement: Single Active Client
The system SHALL allow at most one active WebSocket client per deployed session environment.

#### Scenario: Second client connects while a session is active
- **WHEN** a second WebSocket connection is attempted while another session is still active
- **THEN** the system rejects the new connection

### Requirement: Session-Scoped Redis Data
The system SHALL store session state in Redis under the active `session_id`.

#### Scenario: Session metadata is created
- **WHEN** a session starts
- **THEN** the system stores session metadata keyed by `session_id`

#### Scenario: Active slave state is scoped to the session
- **WHEN** a slave is registered or updated during a session
- **THEN** the system stores that slave state under the current `session_id`

### Requirement: Controller-Owned Session Metrics
The system SHALL make `controller-service` the owner of aggregate slave counters for the active session.

#### Scenario: Live count increases on slave registration
- **WHEN** `controller-service` accepts a slave registration for a session
- **THEN** it increments that session's live slave count

#### Scenario: Gone count increases on terminal slave state
- **WHEN** `controller-service` records a slave as gone for a session
- **THEN** it decrements the live count and increments the gone count for that session

### Requirement: Session Cleanup
The system SHALL delete session Redis data when a session ends.

#### Scenario: Ended session data is removed
- **WHEN** a session ends
- **THEN** the system deletes that session's Redis metadata, metrics, and active slave state records

#### Scenario: Ended session cannot be queried as active
- **WHEN** a caller requests active session data after that session ended
- **THEN** the system does not return the removed session state as active data

