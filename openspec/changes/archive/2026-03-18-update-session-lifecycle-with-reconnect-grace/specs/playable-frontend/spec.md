## MODIFIED Requirements

### Requirement: Pod Interaction Controls
The system SHALL let the player target Pods and explicitly end the authoritative gameplay session from desktop and WebXR play modes.

#### Scenario: WebXR session can be disconnected in immersive mode
- **WHEN** the player is inside WebXR mode
- **THEN** the frontend shows an in-world control that can explicitly terminate the gameplay session
- **AND** the same control exits the WebXR session

#### Scenario: Desktop disconnect explicitly ends the session
- **WHEN** the player presses the desktop disconnect control
- **THEN** the frontend explicitly requests gameplay session termination before closing the WebSocket
