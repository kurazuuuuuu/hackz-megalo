## ADDED Requirements

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
