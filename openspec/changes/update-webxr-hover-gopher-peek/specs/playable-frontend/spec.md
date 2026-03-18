## ADDED Requirements

### Requirement: Desktop Hover Gopher Accent
The system SHALL show a small decorative gopher accent that follows near the mouse cursor while the player hovers supported desktop UI surfaces.

#### Scenario: Player hovers a supported desktop surface
- **WHEN** the pre-session or connected desktop UI is visible and the player hovers a supported panel, pill, button, or Pod row
- **THEN** the frontend shows `blue.svg` near the mouse cursor instead of anchoring it to the hovered component bounds
- **AND** the accent does not block pointer interaction or cover the main label content
- **AND** the mascot size remains subdued enough to avoid dominating the hovered UI
