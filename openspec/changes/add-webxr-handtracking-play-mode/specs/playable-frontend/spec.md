## MODIFIED Requirements

### Requirement: Real-Time Pod Field
The system SHALL display active Pod state in a real-time playable field in both desktop and WebXR modes.

#### Scenario: Initial state is loaded
- **WHEN** a session starts
- **THEN** the frontend fetches the active session and active slave states and renders them in the game field

#### Scenario: State updates stream into the field
- **WHEN** the backend publishes slave state updates over WebSocket
- **THEN** the frontend updates the rendered Pod state without reloading the page

#### Scenario: WebXR field is presented as a tabletop board
- **WHEN** the player enters WebXR mode on a supported browser
- **THEN** the frontend presents the Pod field as a board placed in front of the player in immersive space
- **AND** the field uses passthrough presentation suitable for Meta Quest Browser

### Requirement: Pod Interaction Controls
The system SHALL let the player target Pods and report authoritative Pod death states in desktop and WebXR play modes.

#### Scenario: Player crushes a Pod
- **WHEN** the player selects a Pod and crushes it from the frontend
- **THEN** the frontend marks that Pod as `SLAVE_STATUS_GONE`
- **AND** the frontend sends the updated state to the backend over the gameplay WebSocket

#### Scenario: Pod falls from the board
- **WHEN** a Pod leaves the board surface and falls out of the play area
- **THEN** the frontend marks that Pod as `SLAVE_STATUS_GONE`
- **AND** the frontend sends the updated state to the backend over the gameplay WebSocket

#### Scenario: WebXR session can be disconnected in immersive mode
- **WHEN** the player is inside WebXR mode
- **THEN** the frontend shows an in-world control that can disconnect the WebSocket session
- **AND** the same control exits the WebXR session

## ADDED Requirements

### Requirement: WebXR Entry Control
The system SHALL provide a visible homepage control for entering WebXR mode when the browser supports the required capabilities.

#### Scenario: Supported browser opens the homepage
- **WHEN** the player opens the homepage in a WebXR-capable browser
- **THEN** the start screen shows a control to enter WebXR mode in addition to the normal session start flow

### Requirement: Hand-Tracking-Only XR Mode
The system SHALL support immersive play in Meta Quest Browser using hand tracking only.

#### Scenario: Player enters XR on Quest Pro
- **WHEN** the player starts WebXR mode from Meta Quest Browser on Quest Pro
- **THEN** the frontend requests an immersive XR session that uses hand tracking
- **AND** the XR experience does not depend on motion controllers

### Requirement: Wrist HUD in XR
The system SHALL show live session state on a left wrist HUD while XR is active.

#### Scenario: Player looks at the left wrist during XR
- **WHEN** WebXR mode is active and the left hand is tracked
- **THEN** the frontend displays the current session ID and live Pod counts on a watch-like HUD attached near the left wrist

### Requirement: XR Pod Board Physics
The system SHALL simulate Pod motion on the XR board surface.

#### Scenario: Pods roam on the board
- **WHEN** WebXR mode is active
- **THEN** each visible Pod moves around the board with physically simulated motion and random wandering behavior

#### Scenario: Pod falls from the board
- **WHEN** a Pod leaves the board surface and falls out of the play area
- **THEN** that Pod is treated as dead by the frontend authoritative state
- **AND** the frontend reports the `GONE` state to the backend

### Requirement: Frontend-Authoritative Pod Death Sync
The system SHALL allow the frontend to send authoritative `GONE` Pod state updates to the backend over the gameplay WebSocket.

#### Scenario: Frontend sends a `GONE` update
- **WHEN** the frontend determines that a Pod is gone because it was crushed or fell
- **THEN** the frontend sends the Pod state update over the gameplay WebSocket
- **AND** the backend overwrites the Redis slave state with the frontend-provided `GONE` state

### Requirement: XR Pod Visual Identity
The system SHALL render Pods in XR with a distinct stylized appearance.

#### Scenario: Pod is rendered in XR
- **WHEN** a Pod appears on the XR board
- **THEN** it is rendered as a light-blue cylindrical character with a simple creature-like silhouette
