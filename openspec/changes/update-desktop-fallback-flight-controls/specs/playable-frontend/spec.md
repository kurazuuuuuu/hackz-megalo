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

#### Scenario: Desktop reticle eliminates a Pod
- **WHEN** the player is in the desktop 3D scene and left-clicks while the center reticle is over a live Pod
- **THEN** the frontend marks that Pod as `SLAVE_STATUS_GONE`
- **AND** the frontend sends the updated state to the backend over the gameplay WebSocket

### Requirement: Desktop-First MVP Fallback
The system SHALL make the playable frontend work without immersive WebXR support.

#### Scenario: Browser does not support WebXR
- **WHEN** the player opens the frontend in a normal desktop browser without immersive WebXR support
- **THEN** the player can still enter the 3D Pod scene after starting a session
- **AND** the player can observe and interact with Pods using desktop keyboard and mouse controls

## ADDED Requirements

### Requirement: Desktop Free-Flight Controls
The system SHALL provide direct desktop 3D navigation controls while immersive WebXR is inactive.

#### Scenario: Desktop player navigates the scene
- **WHEN** the player is viewing the non-XR 3D scene on desktop
- **THEN** `W`, `A`, `S`, and `D` move the camera in a free-flight scheme
- **AND** holding the right mouse button and moving the mouse rotates the camera view
- **AND** double-clicking the scene enters pointer lock so keyboard and mouse look stay captured for desktop play
- **AND** pressing `Escape` exits the pointer-locked desktop look mode
- **AND** a visible reticle stays centered to indicate the current target point

#### Scenario: Desktop reserved action keys are pressed
- **WHEN** the player presses `E` or `R` while the desktop 3D scene is active
- **THEN** the frontend routes those inputs through reserved bindings for future gameplay events
