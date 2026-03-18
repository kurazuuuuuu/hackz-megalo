# Change: update webxr wrist hud scale and point highlight

## Why
The current left wrist HUD feels cramped, and the fingertip target feedback relies too heavily on the HUD text alone. XR play will be easier to read if the wrist HUD is slightly larger and the pointed Gopher is highlighted directly in-world.

## What Changes
- Increase the left wrist HUD size to improve readability and spacing
- Add an in-world outline highlight for the currently pointed Gopher when fingertip pointing contact is active

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
