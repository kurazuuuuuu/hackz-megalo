# Change: update desktop fallback flight controls

## Why
The current frontend only exposes the immersive 3D scene through WebXR, so desktop browsers without WebXR support cannot enter the playable scene. We need a desktop fallback that still shows the 3D Pod board and provides direct interaction controls.

## What Changes
- Render the Three.js Pod board as the default non-XR scene after the session starts
- Add desktop free-flight controls with WASD movement, reticle aiming, right-mouse camera look, and double-click pointer lock
- Allow desktop left click to mark the Pod under the reticle as gone
- Allow `Escape` to leave the desktop pointer-lock look mode cleanly
- Reserve `E` and `R` desktop bindings so future gameplay events can be attached without reworking the input layer

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr`
