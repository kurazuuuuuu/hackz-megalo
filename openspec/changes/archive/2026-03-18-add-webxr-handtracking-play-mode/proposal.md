# Change: add webxr handtracking play mode

## Why
The frontend currently provides a desktop-first Three.js field, but the target play environment is Meta Quest Browser on Quest Pro. We need a dedicated WebXR mode that preserves the existing session flow while adding passthrough AR presentation, hand-tracking-only interaction, and an immersive Pod board.

## What Changes
- Add a homepage control to enter and exit a WebXR mode from the existing frontend
- Add an immersive passthrough WebXR experience for Meta Quest Browser using hand tracking only and no motion controllers
- Render the Pod field as a tabletop board in front of the player, with Pods moving physically on the board and falling deaths when they leave the field
- Attach an in-XR left wrist HUD that shows session state such as session ID and surviving Pod counts and provides a disconnect control that closes the WebSocket session and exits WebXR
- Treat frontend-originated Pod deaths as authoritative state updates and send them to `master-service` over the gameplay WebSocket
- Make `master-service` overwrite Redis slave state from frontend `GONE` updates and let `controller-service` dispatch shutdown from Redis state transitions
- Preserve the existing desktop fallback flow so the frontend remains playable outside WebXR

## Impact
- Affected specs: `playable-frontend`, `session-lifecycle`
- Affected code: `apps/frontend-webxr`, `apps/master-service`, `apps/controller-service`
