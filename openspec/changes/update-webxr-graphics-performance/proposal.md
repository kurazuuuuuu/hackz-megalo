# Change: improve WebXR graphics performance

## Why
The WebXR frontend consumes significant frame budget when many pods are created/removed, when gust effects are spammed, and when HUD debug rendering runs every frame.
These patterns can cause unnecessary allocations and unstable frame timing, especially on mobile headsets.

## What Changes
- Reuse Pod geometry and base materials across spawn/despawn cycles so repeated pod churn does not allocate per-instance rendering assets.
- Throttle and coalesce wrist HUD canvas redraws so expensive 2D texture updates do not run unnecessarily.
- Enable pod physics bodies to sleep when idle and wake only when required by interactions/forces.
- Pool gust VFX visual/collision objects to avoid repeated allocation when gust actions are triggered in bursts.

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/scene.ts`
