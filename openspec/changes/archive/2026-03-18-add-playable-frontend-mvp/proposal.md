# Change: add playable frontend mvp

## Why
The repo has backend transport and session lifecycle, but the frontend is still the default Vite starter. We need a minimum playable browser UI so a single player can start a session, observe Pod state, and interact with Pods in real time.

## What Changes
- Replace the frontend starter page with a game-oriented UI for session start, Pod observation, and Pod interactions
- Add a desktop-first Three.js Pod field with selection and action controls
- Connect the frontend to existing master-service HTTP and WebSocket endpoints
- Add CORS handling on master-service so the separately hosted frontend can call the backend

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr`, `apps/master-service`
