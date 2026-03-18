## ADDED Requirements

### Requirement: Session Start Screen
The system SHALL present a start screen before beginning a gameplay session.

#### Scenario: Player starts a session
- **WHEN** the player opens the frontend
- **THEN** the UI shows a start control and only begins the gameplay session after the player chooses to start

### Requirement: Real-Time Pod Field
The system SHALL display active Pod state in a real-time playable field.

#### Scenario: Initial state is loaded
- **WHEN** a session starts
- **THEN** the frontend fetches the active session and active slave states and renders them in the game field

#### Scenario: State updates stream into the field
- **WHEN** the backend publishes slave state updates over WebSocket
- **THEN** the frontend updates the rendered Pod state without reloading the page

### Requirement: Pod Interaction Controls
The system SHALL let the player target Pods and trigger gameplay actions.

#### Scenario: Player targets and acts on a Pod
- **WHEN** the player selects a Pod and uses an action control
- **THEN** the frontend sends the matching event request to the backend for that Pod

### Requirement: Desktop-First MVP Fallback
The system SHALL make the minimum playable frontend work without WebXR.

#### Scenario: Browser does not support WebXR
- **WHEN** the player opens the frontend in a normal desktop browser
- **THEN** the player can still observe and interact with Pods using standard pointer input

### Requirement: Cross-Origin Frontend Access
The system SHALL allow the hosted frontend to access master-service APIs from another origin.

#### Scenario: Browser frontend calls master-service
- **WHEN** the frontend sends HTTP requests from a different origin
- **THEN** master-service responds with the required CORS headers
