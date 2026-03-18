# Change: update webxr wrist debug box and touch id feedback

## Why
The current left wrist HUD is functional but visually too close to a general status card and does not expose enough hand-tracking debug context. We also need immediate XR feedback that identifies which Pod is being touched by a pointing fingertip.

## What Changes
- Restyle the left wrist debug box to a monochrome translucent surface with a subtle gopher-like cyan overlay
- Expand wrist debug data so the HUD shows richer hand-tracking and interaction context during XR
- Detect fingertip collider contact while the player is pointing and display the contacted Pod ID on the debug box

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
