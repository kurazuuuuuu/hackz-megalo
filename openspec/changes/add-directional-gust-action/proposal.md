# Change: add directional gust action

## Why
The 3D Pod scene currently supports crushing, grabbing, and pointing interactions, but it does not provide a shared action that feels equivalent between immersive WebXR play and desktop fallback play. We need a directional gust interaction that can be triggered naturally with hand tracking in XR and from a keyboard binding on desktop.

## What Changes
- Add a directional gust gameplay action that launches a short-lived wide wind volume through the scene and pushes intersected Pods away
- Trigger the gust in WebXR when a tracked hand is open, held roughly vertical, and swept like a fanning motion toward the Pods
- Trigger the same gust action on desktop from the `E` key while the desktop 3D scene is active
- Reuse one gust simulation path so WebXR and desktop apply equivalent force and Pod reactions
- Render visible Three.js wind streak particles for the gust so the effect reads clearly in the scene
- Increase Pod launch force so gusted Pods are more likely to fly off the board
- Allow grabbed Pods to follow full hand-driven orientation changes instead of staying axis-locked
- Spawn Pods with a random initial facing direction
- Surface the gust activation state in the frontend interaction layer without requiring motion controllers

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr`
- Interaction note: this change consumes the previously reserved desktop `E` binding for an active gameplay action
