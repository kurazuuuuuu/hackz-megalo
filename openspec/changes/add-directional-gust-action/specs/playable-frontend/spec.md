## MODIFIED Requirements

### Requirement: Pod Interaction Controls
The system SHALL let the player target Pods, trigger the directional gust action, and explicitly end the authoritative gameplay session from desktop and WebXR play modes.

#### Scenario: WebXR session can be disconnected in immersive mode
- **WHEN** the player is inside WebXR mode
- **THEN** the frontend shows an in-world control that can explicitly terminate the gameplay session
- **AND** the same control exits the WebXR session

#### Scenario: Desktop disconnect explicitly ends the session
- **WHEN** the player presses the desktop disconnect control
- **THEN** the frontend explicitly requests gameplay session termination before closing the WebSocket

#### Scenario: Desktop player triggers the gust action
- **WHEN** the player is in the desktop 3D scene and presses `E`
- **THEN** the frontend launches the directional gust action from the current desktop aim direction
- **AND** intersected live Pods are pushed away by frontend-applied physics

#### Scenario: XR player triggers the gust action
- **WHEN** the player is in WebXR, the tracked hand is open, roughly vertical, and swept in a fanning motion
- **THEN** the frontend launches the directional gust action from that hand
- **AND** intersected live Pods are pushed away by frontend-applied physics

## ADDED Requirements

### Requirement: Shared Directional Gust Simulation
The system SHALL use one shared gust simulation path for desktop and WebXR so the Pod response is materially equivalent across both modes.

#### Scenario: Gust volume intersects Pods
- **WHEN** a gust action is triggered from either input mode
- **THEN** the frontend emits a short-lived wide gust volume in the chosen direction
- **AND** the scene renders visible gust particles aligned to that wind direction
- **AND** each live Pod intersected by that volume receives a directional impulse away from the source
- **AND** the gust is strong enough to visibly launch Pods across or off the board instead of only nudging them
- **AND** the gust does not require direct fingertip or palm contact with the Pod body

#### Scenario: Gust action is spammed
- **WHEN** the player repeatedly attempts the gesture or key binding faster than the allowed cadence
- **THEN** the frontend enforces a cooldown
- **AND** the scene avoids stacking duplicate gust launches every frame from one continuous motion

## MODIFIED Requirements

### Requirement: Upright XR Pod Motion
The system SHALL keep XR Pods readable during calm board simulation while allowing full orientation changes during direct manipulation and strong gust interactions.

#### Scenario: Pod moves under calm simulation
- **WHEN** a Pod receives idle simulation impulses or light board collisions
- **THEN** it stays reasonably readable on the board instead of instantly tumbling into chaotic motion
- **AND** the frontend does not hard-lock the Pod to a single world-axis orientation

#### Scenario: Player rotates a grabbed Pod
- **WHEN** the player pinches and rotates a Pod through XR interaction
- **THEN** the grabbed Pod follows the hand-driven orientation change across all axes
- **AND** the interaction does not constrain the Pod to yaw-only rotation while it is held

#### Scenario: Pod spawns into the board
- **WHEN** a Pod first appears in the frontend field
- **THEN** it starts with a random facing direction instead of always spawning with the same forward orientation
