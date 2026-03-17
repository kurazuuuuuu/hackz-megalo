# Change: update webxr hand model and frontend flow polish

## Why
The current WebXR mode renders hand-tracking as line skeletons and exposes an XR entry point on the homepage. We need to align the hand visuals with Meta-compatible standard hand model assets and simplify the session flow so players always start by creating a session first.

## What Changes
- Replace skeleton-line hand rendering with 3D hand models based on standard WebXR input profile assets
- Serve WebXR hand model assets locally from the frontend static assets so hand meshes are available without runtime external fetches
- Render Pods as simple vertically stretched sphere meshes generated in-scene, without external model downloads
- Use Rapier physics in XR for dynamic Pod motion and collision management
- Add hand colliders (palm, thumb, index, middle) as Rapier sensors to drive open-palm touch and future pinch/grab extension points
- Keep hand-tracking-only interaction logic, including collider-based open-palm Pod touch and pinch-based wrist HUD disconnect
- Remove desktop 3D field rendering path and keep desktop in monitoring-only mode
- Optimize homepage-to-session flow to `Start Session -> connect WebSocket -> show main screen`, with WebXR entry shown from the main screen
- Make reconnect initialization explicit so stale WebSocket callbacks from previous sessions do not corrupt a new session startup
- Update desktop (non-XR) visual style to a monochrome base with a Golang-like cyan accent palette

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/main.ts`, `apps/frontend-webxr/src/scene.ts`, `apps/frontend-webxr/src/style.css`
