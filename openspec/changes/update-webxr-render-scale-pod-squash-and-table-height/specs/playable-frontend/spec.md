## MODIFIED Requirements

### Requirement: Wrist HUD in XR
The system SHALL show a left wrist debug HUD while XR is active with live XR diagnostics and a hand-tracked table-height slider.

#### Scenario: Player looks at the left wrist during XR
- **WHEN** WebXR mode is active and the left hand is tracked
- **THEN** the frontend displays a watch-like debug HUD attached near the left wrist
- **AND** the HUD shows live session state and current hand interaction diagnostics useful for XR debugging
- **AND** the HUD includes a slider that can be manipulated with hand tracking to adjust the XR table height

### Requirement: Floor-Referenced XR Board Placement
The system SHALL place the XR board relative to the `local-floor` reference space using a floor-relative table height that remains adjustable from the left wrist HUD.

#### Scenario: Player enters XR
- **WHEN** the player starts XR mode with `local-floor` available
- **THEN** the board appears in front of the player
- **AND** the board height is derived from a floor-relative table height instead of the player's current head height

#### Scenario: Player adjusts table height from the wrist HUD
- **WHEN** WebXR mode is active and the player drags the wrist HUD slider
- **THEN** the frontend updates the board height in real time
- **AND** the board remains floor-referenced while moving up or down

## ADDED Requirements

### Requirement: Reduced Frontend Render Resolution
The system SHALL render the frontend at approximately 80% of the capped device pixel ratio to improve performance without changing the layout dimensions.

#### Scenario: Frontend renderer is initialized
- **WHEN** the frontend creates or resizes the Three.js renderer
- **THEN** the renderer uses an internal pixel ratio equal to 80% of the capped device pixel ratio
- **AND** the CSS display size of the canvas remains unchanged

### Requirement: Slime-Like XR Pod Crush Feedback
The system SHALL squash a live XR Pod like soft slime when it is crushed by an open palm before treating that Pod as gone.

#### Scenario: Open palm crushes a live Pod
- **WHEN** an open palm crush interaction is recognized on a live Pod in XR
- **THEN** the frontend visibly flattens the Pod vertically and spreads it outward along the board surface
- **AND** the effect is driven by the XR interaction/physics system rather than a simple instant removal
- **AND** the frontend reports the Pod as gone after the crush interaction completes
