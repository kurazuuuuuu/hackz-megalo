## ADDED Requirements

### Requirement: XR Wrist HUD Frame Diagnostics
The system SHALL show XR frame diagnostics on the left wrist HUD so rendering performance can be monitored during immersive play.

#### Scenario: Player checks XR performance on the wrist HUD
- **WHEN** WebXR mode is active and the left wrist HUD is visible
- **THEN** the HUD displays FPS plus CPU frame time
- **AND** the HUD displays GPU frame time when the browser/device exposes supported timing queries
- **AND** the HUD shows a readable fallback state when GPU timing is unavailable or pending

### Requirement: XR Table Repositioning Workflow
The system SHALL let the player reposition the XR table from the wrist HUD and confirm placement with hand tracking.

#### Scenario: Player repositions the board from the wrist HUD
- **WHEN** the player arms table move mode from the left wrist HUD
- **THEN** the board enters a preview state that follows the right hand pose in XR
- **AND** a right-hand pinch confirms the board placement at the preview pose

### Requirement: XR Table Spatial Anchor Fixing
The system SHALL attach the confirmed XR table placement to a spatial anchor when the browser exposes WebXR anchors.

#### Scenario: Anchors are available for confirmed placement
- **WHEN** the player confirms a new XR table pose and the XR session supports anchors
- **THEN** the frontend creates or updates a spatial anchor for that board pose
- **AND** the board remains fixed to that anchored real-world location for the active XR session

#### Scenario: Anchors are unavailable
- **WHEN** the player confirms a new XR table pose but the XR session does not support anchors
- **THEN** the frontend still applies the new board pose
- **AND** the HUD indicates that anchor fixing is unavailable
