## MODIFIED Requirements

### Requirement: WebXR Entry Control
The system SHALL provide a homepage flow that starts a gameplay session first, then allows WebXR entry from the connected main screen.

#### Scenario: Player starts from homepage
- **WHEN** the player opens the homepage and starts a new session
- **THEN** the frontend begins WebSocket connection setup for the session
- **AND** the main gameplay screen is shown only after the session connection is completed
- **AND** the WebXR entry button is provided from the connected main screen

#### Scenario: Player reconnects after disconnect
- **WHEN** the player disconnects and starts a new session again
- **THEN** the frontend explicitly resets session runtime state before reconnecting
- **AND** stale WebSocket callbacks from previous sessions do not overwrite the new session state

### Requirement: Hand-Tracking-Only XR Mode
The system SHALL support immersive play in Meta Quest Browser using hand tracking only and render tracked hands with standard 3D hand model assets.

#### Scenario: Player enters XR on Quest Pro
- **WHEN** the player starts WebXR mode from Meta Quest Browser on Quest Pro
- **THEN** the frontend requests an immersive XR session that uses hand tracking
- **AND** the XR experience does not depend on motion controllers
- **AND** tracked hands are rendered as 3D hand models rather than line-based skeletons

#### Scenario: Hand assets are served from frontend static files
- **WHEN** the player enters WebXR mode
- **THEN** the frontend loads left/right hand mesh assets from local static files bundled with the frontend
- **AND** hand rendering does not depend on external runtime downloads

### Requirement: XR Pod Visual Identity
The system SHALL render Pod objects as simple locally generated meshes.

#### Scenario: Pod is rendered in XR
- **WHEN** a Pod appears on the XR board
- **THEN** it is rendered as a vertically stretched sphere mesh generated in-scene
- **AND** the Pod visual does not require external model downloads

### Requirement: XR Physics and Collider Lifecycle
The system SHALL run XR Pod simulation with Rapier and keep render objects in sync with physics lifecycle.

#### Scenario: Pod simulation uses Rapier rigid bodies
- **WHEN** a Pod is active in XR
- **THEN** the frontend simulates it with a Rapier dynamic rigid body and collider
- **AND** Pod mesh transforms are synchronized from Rapier each frame

#### Scenario: Gone Pod is removed from XR scene
- **WHEN** a Pod becomes `SLAVE_STATUS_GONE` (or is marked eliminated by XR runtime state)
- **THEN** its render mesh is removed from the XR board
- **AND** its Rapier rigid body/collider is removed from the physics world

### Requirement: Hand Collider Interactions
The system SHALL evaluate hand interactions in XR using Rapier hand colliders.

#### Scenario: Open-palm touch uses palm collider
- **WHEN** a tracked hand is open and its palm collider intersects a live Pod collider
- **THEN** the frontend triggers the same Pod hit behavior as prior open-palm touch logic

#### Scenario: Pinch candidate is tracked for future grab
- **WHEN** thumb and index colliders intersect the same Pod and pinch distance is below threshold
- **THEN** the frontend records a pinch candidate per hand for future grab/pinch actions

### Requirement: Desktop Monitoring-Only Mode
The system SHALL keep desktop mode as monitoring UI and reserve 3D field rendering for XR sessions.

#### Scenario: Desktop mode is not presenting XR
- **WHEN** the app is connected but not presenting WebXR
- **THEN** the desktop UI shows session/pod monitoring panels only
- **AND** desktop does not render or interact with the 3D Pod field
