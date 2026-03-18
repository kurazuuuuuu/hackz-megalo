## MODIFIED Requirements

### Requirement: Wrist HUD in XR
The system SHALL keep the left wrist HUD readable during XR sessions by avoiding excessively strong foveated rendering when runtime controls are available.

#### Scenario: Wrist HUD is viewed away from screen center
- **WHEN** WebXR mode is active and the player looks toward the left wrist HUD
- **THEN** the frontend uses a reduced foveation setting if the XR runtime exposes configurable foveated rendering
- **AND** the HUD remains more readable in peripheral view than with the runtime's more aggressive default foveation behavior
