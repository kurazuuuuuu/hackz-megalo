## MODIFIED Requirements

### Requirement: Wrist HUD in XR
The system SHALL show a left wrist HUD while XR is active at a size that remains readable without feeling cramped.

#### Scenario: Player looks at the left wrist during XR
- **WHEN** WebXR mode is active and the left hand is tracked
- **THEN** the frontend renders the wrist HUD with enough scale and internal spacing to keep debug text readable

### Requirement: Fingertip Pod Identification in XR
The system SHALL identify Pods touched by a pointing fingertip and show that target both on the wrist HUD and on the pointed Pod itself.

#### Scenario: Pointing fingertip touches a Pod
- **WHEN** the player is in XR, the hand is recognized as pointing, and a fingertip collider intersects a live Pod
- **THEN** the frontend determines the contacted Pod ID
- **AND** the left wrist debug HUD displays that Pod ID as the current fingertip contact target
- **AND** the contacted Gopher is rendered with an in-world outline highlight while it remains the active fingertip target
