# Change: update webxr render scale, pod squash, and table height controls

## Why
The current WebXR scene still spends more rendering budget than necessary, Pod elimination by hand lacks a convincing physical squash response, and the board height is fixed even though hand-tracked XR sessions benefit from quick per-player adjustment.

## What Changes
- Reduce the frontend renderer's internal pixel resolution to 80% of the capped device pixel ratio for better performance
- Add a slime-like squash response when a live Pod is crushed by an open palm in XR before it is marked gone
- Add a hand-tracked slider on the left wrist HUD so players can adjust the XR table height during play

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
