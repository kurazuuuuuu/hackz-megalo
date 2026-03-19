## ADDED Requirements

### Requirement: Reusable Pod Rendering Assets
The system SHALL render Pod visuals using shared geometry and base materials where possible so repeated Pod spawn and removal cycles do not allocate per-instance rendering assets.

#### Scenario: Pod churn under load
- **WHEN** a session runs in the frontend and Pods are created and removed repeatedly
- **THEN** new Pods reuse preconfigured Pod meshes/materials from a shared cache instead of creating brand-new geometry and base material instances each time
- **AND** Pod visuals stay visually stable across churn without flashing or sudden material regressions

#### Scenario: Pod removed and re-added with same silhouette
- **WHEN** a Pod is removed from the active set and later appears again in the same session
- **THEN** the visual style (silhouette and colors for state) remains consistent
- **AND** the recreated Pod does not require a fresh heavy geometry/material build path

### Requirement: Throttled Wrist HUD Canvas Rendering
The system SHALL coalesce and throttle wrist HUD canvas redraws so full 2D texture rebuilds are not executed every render frame unless debug content changes.

#### Scenario: No wrist-debug state change
- **WHEN** WebXR is active and wrist debug values (tracker status, gestures, counters) do not change for multiple frames
- **THEN** the HUD texture is not redrawn each frame
- **AND** interactive 3D scene updates continue at normal motion cadence

#### Scenario: HUD state changes
- **WHEN** tracked values or interaction targets change
- **THEN** the HUD texture updates immediately to reflect the latest values
- **AND** debug text and slider state remain readable

### Requirement: Dormant Pod Physics Should Sleep
The system SHALL allow inactive Pod physics bodies to sleep and wake them only when gameplay interaction, gusts, or active impulses require simulation.

#### Scenario: Pods are mostly idle
- **WHEN** Pods have low movement and no interactions
- **THEN** their physics simulation is reduced by sleeping idle bodies
- **AND** CPU cost for unchanged Pods is lower than continuously simulating all Pod bodies each frame

#### Scenario: Interaction wakes body
- **WHEN** a sleeping Pod is grabbed, gusted, or receives a new impulse
- **THEN** the Pod resumes active simulation immediately
- **AND** interaction behavior is preserved without one-frame lag

### Requirement: Gust Visuals and Colliders Use Reuse
The system SHALL reuse gust collider and VFX objects from pools so burst gust actions do not constantly allocate new objects.

#### Scenario: Repeated gust spam
- **WHEN** multiple gust actions are triggered quickly in succession
- **THEN** gust visuals/colliders are recycled from reusable objects instead of rebuilt on every trigger
- **AND** burst gusts remain visually consistent
- **AND** the effect does not introduce visible frame spikes from repeated allocation
