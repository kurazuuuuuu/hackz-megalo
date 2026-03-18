# playable-frontend Specification

## Purpose
TBD - created by archiving change add-playable-frontend-mvp. Update Purpose after archive.
## Requirements
### Requirement: Session Start Screen
The system SHALL present a start screen before beginning a gameplay session.

#### Scenario: Player starts a session
- **WHEN** the player opens the frontend
- **THEN** the UI shows a start control and only begins the gameplay session after the player chooses to start

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
The system SHALL let the player target Pods and explicitly end the authoritative gameplay session from desktop and WebXR play modes.

#### Scenario: WebXR session can be disconnected in immersive mode
- **WHEN** the player is inside WebXR mode
- **THEN** the frontend shows an in-world control that can explicitly terminate the gameplay session
- **AND** the same control exits the WebXR session

#### Scenario: Desktop disconnect explicitly ends the session
- **WHEN** the player presses the desktop disconnect control
- **THEN** the frontend explicitly requests gameplay session termination before closing the WebSocket

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
The system SHALL show a left wrist HUD while XR is active at a size that remains readable without feeling cramped.

#### Scenario: Player looks at the left wrist during XR
- **WHEN** WebXR mode is active and the left hand is tracked
- **THEN** the frontend renders the wrist HUD with enough scale and internal spacing to keep debug text readable

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

### Requirement: Gopher-Inspired XR Pod Visuals
The system SHALL render XR Pods with a gopher-inspired silhouette generated from local primitives instead of a generic stretched sphere.

#### Scenario: Pod appears in XR
- **WHEN** a live Pod is rendered on the XR board
- **THEN** the Pod uses a cyan gopher-inspired body with a vertically elongated silhouette, large round eyes, small rounded ears, and visible front teeth
- **AND** the Pod visual is generated in-scene without external model downloads

#### Scenario: Pod state changes without losing silhouette
- **WHEN** Pod status flags such as firewall, infected, or terminating change
- **THEN** the frontend preserves the gopher-inspired silhouette
- **AND** state changes are expressed through material accents or overlays rather than replacing the Pod with an unrelated shape

### Requirement: Upright XR Pod Motion
The system SHALL keep XR Pods basically upright during normal board simulation while preserving direct player repositioning.

#### Scenario: Pod moves under normal simulation
- **WHEN** a Pod receives idle simulation impulses or collides with the board
- **THEN** the Pod remains basically upright instead of freely toppling onto its side
- **AND** the Pod can still slide, rotate around the vertical axis, and move across the board

#### Scenario: Player repositions a Pod
- **WHEN** the player pinches or otherwise moves a Pod through XR interaction
- **THEN** the Pod can still be translated by the interaction system
- **AND** once released, the Pod settles back into an upright posture

### Requirement: Floor-Referenced XR Board Placement
The system SHALL place the XR board relative to the `local-floor` reference space instead of deriving height from the user's head pose.

#### Scenario: Player enters XR
- **WHEN** the player starts XR mode with `local-floor` available
- **THEN** the board appears in front of the player
- **AND** the board height is determined from a fixed floor-relative table height
- **AND** the board does not shift vertically based on the player's current head height

### Requirement: Minimal Desktop Console UI
The system SHALL present the connected desktop experience as a minimal monitoring console with monochrome surfaces and cyan accents.

#### Scenario: Desktop screen is connected and not in XR
- **WHEN** the session is connected in a non-XR browser context
- **THEN** the UI shows only operational information such as session state, Pod list, selected Pod details, and recent activity
- **AND** the screen omits explanatory marketing-style copy or long instructional paragraphs

#### Scenario: Cyan is used as the primary accent
- **WHEN** the desktop console renders controls and emphasis states
- **THEN** the base interface remains grayscale or near-grayscale
- **AND** cyan matching the Go gopher palette is used as the primary accent for focus, status emphasis, and primary actions

### Requirement: Pre-Session Background Artwork Blend
The system SHALL blend the machine illustration into the pre-session home screen background without reducing the legibility of the primary UI.

#### Scenario: Start screen is shown before a session begins
- **WHEN** the frontend renders the home screen before a session is started
- **THEN** the screen shows `machine-colorized.svg` as low-opacity background artwork behind the start-screen UI
- **AND** the artwork is visually blended with the existing surface gradients instead of appearing as a hard-edged standalone image

#### Scenario: Start screen remains readable on smaller viewports
- **WHEN** the pre-session home screen is rendered on a narrow viewport
- **THEN** the illustration remains visible as a subdued background accent
- **AND** the title, status text, and start button remain readable and usable without overlap issues

### Requirement: Fingertip Pod Identification in XR
The system SHALL identify Pods touched by a pointing fingertip and show that target both on the wrist HUD and on the pointed Pod itself.

#### Scenario: Pointing fingertip touches a Pod
- **WHEN** the player is in XR, the hand is recognized as pointing, and a fingertip collider intersects a live Pod
- **THEN** the frontend determines the contacted Pod ID
- **AND** the left wrist debug HUD displays that Pod ID as the current fingertip contact target
- **AND** the contacted Gopher is rendered with an in-world outline highlight while it remains the active fingertip target

