## MODIFIED Requirements

### Requirement: Wrist HUD in XR
The system SHALL show a left wrist debug HUD while XR is active with a monochrome translucent base, subtle cyan overlay accents, and live XR interaction data.

#### Scenario: Player looks at the left wrist during XR
- **WHEN** WebXR mode is active and the left hand is tracked
- **THEN** the frontend displays a watch-like debug HUD attached near the left wrist
- **AND** the HUD uses a monochrome translucent visual design with restrained cyan accent overlays inspired by the Go gopher palette
- **AND** the HUD shows live session state and current hand interaction diagnostics useful for XR debugging

## ADDED Requirements

### Requirement: Fingertip Pod Identification in XR
The system SHALL identify Pods touched by a pointing fingertip and surface that identity on the left wrist debug HUD.

#### Scenario: Pointing fingertip touches a Pod
- **WHEN** the player is in XR, the hand is recognized as pointing, and a fingertip collider intersects a live Pod
- **THEN** the frontend determines the contacted Pod ID
- **AND** the left wrist debug HUD displays that Pod ID as the current fingertip contact target
