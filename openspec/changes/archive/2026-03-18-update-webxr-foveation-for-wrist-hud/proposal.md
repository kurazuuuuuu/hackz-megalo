# Change: update webxr foveation for wrist hud readability

## Why
The current XR presentation leaves the center area sharp while peripheral regions become too blurry, which makes the left wrist debug HUD difficult to read during immersive use.

## What Changes
- Reduce WebXR foveated rendering strength during immersive play when the runtime supports explicit foveation control
- Preserve wrist HUD readability as a higher priority than aggressive peripheral quality reduction

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
