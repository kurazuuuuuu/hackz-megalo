## ADDED Requirements

### Requirement: WebSocket-Scoped Session
The system SHALL define one gameplay session as the lifetime of a single WebSocket connection to `master-service`.

#### Scenario: Session starts on WebSocket connection
- **WHEN** a client establishes a WebSocket connection to `master-service`
- **THEN** the system creates a new `session_id` and marks the session as active

#### Scenario: Session ends on disconnect
- **WHEN** that WebSocket connection is closed for any reason
- **THEN** the system marks the session as ended and treats the session as finished

### Requirement: Reconnect Creates a New Session
The system SHALL create a new session after every reconnect instead of resuming a previous session.

#### Scenario: Client reconnects after disconnect
- **WHEN** a client connects again after a prior session ended
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
