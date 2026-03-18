## ADDED Requirements

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
