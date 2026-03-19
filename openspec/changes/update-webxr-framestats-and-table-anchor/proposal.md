# Change: add WebXR frame stats HUD and anchored table repositioning

## Why
The XR debug HUD currently lacks real-time frame diagnostics, which makes it hard to judge rendering cost while tuning the scene.
The table can only be adjusted by height, so repositioning it to a precise real-world location is awkward and unstable for room-scale XR use.

## What Changes
- Add XR wrist HUD diagnostics for FPS and frame time metrics, including CPU and GPU timings when available.
- Reflow the left wrist HUD layout so the added diagnostics remain readable without crowding the existing interaction debug fields.
- Add a table move workflow driven from the wrist HUD: arm the move mode from the HUD, preview the board at the right hand, and confirm placement with a pinch.
- Use WebXR spatial anchors when available so a confirmed table placement is fixed to the real-world location during the XR session.

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
