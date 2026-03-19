# Change: increase WebXR table height range

## Why
The current XR table height cap is too low for room setups where the player wants to place the board around normal desk height.
This makes the new table move workflow less useful in practice.

## What Changes
- Raise the maximum XR table surface height to around 100 cm.
- Keep the existing wrist HUD slider and move workflow, but let them reach the higher range.

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
