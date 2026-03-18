## ADDED Requirements
### Requirement: WDXL Lubrifont JP N UI Typography
The system SHALL load and use `WDXL Lubrifont JP N` as the primary non-monospace UI font for the pre-session screen and connected desktop console.

#### Scenario: Frontend screen is rendered
- **WHEN** the player opens the frontend before or during a desktop session
- **THEN** the main UI typography uses `WDXL Lubrifont JP N`
- **AND** diagnostic or identifier text that depends on monospace alignment remains on the existing monospace stack
