## Context
The current XR HUD already renders pod/debug information and supports a table-height slider, but it has no performance telemetry and no way to move the whole board to an arbitrary real-world pose.
The new behavior needs to fit into the existing hand-tracking pinch interactions without disrupting pod grab, gust, or disconnect flows.

## Goals / Non-Goals
- Goals:
  - Show FPS plus CPU/GPU frame timings on the left wrist HUD.
  - Keep the HUD readable after adding those metrics.
  - Allow the player to arm table relocation from the HUD and place the board using the right hand.
  - Create a spatial anchor for the confirmed board pose when the browser exposes WebXR anchors.
- Non-Goals:
  - Persist anchors across browser restarts.
  - Add a separate world-space UI outside the wrist HUD.

## Decisions
- Decision: Sample FPS and CPU frame time from the render loop, smoothing over recent frames to avoid unreadable per-frame jitter.
  - Alternatives considered: showing raw per-frame timings every frame was rejected because the HUD becomes noisy and redraws too often.
- Decision: Attempt GPU timings through `EXT_disjoint_timer_query_webgl2`, but fall back to `N/A` when the extension is unavailable or a query is still pending.
  - Alternatives considered: estimating GPU time heuristically was rejected because it would misrepresent actual rendering cost.
- Decision: Reuse the existing wrist HUD interaction model by adding a second button that arms table-move mode and then use a right-hand pinch to confirm the preview pose.
  - Alternatives considered: dedicated gesture-only placement was rejected because accidental activation would be too easy.
- Decision: Use session-scoped WebXR spatial anchors when available and keep the current board pose when anchors are unavailable.
  - Alternatives considered: persistent anchor storage was deferred to keep the scope limited.

## Risks / Trade-offs
- GPU timer queries are not guaranteed on every device/browser, so the HUD must clearly show fallback status.
- Spatial anchors may fail or be unavailable, so the board placement flow must remain usable without them.
- Adding more HUD content increases redraw cost, so the existing throttled HUD update path must remain in place.

## Migration Plan
1. Extend the XR HUD state with frame diagnostics and table-placement state.
2. Add the table move interaction and preview pose updates.
3. Create/update/detach a session anchor on placement confirmation when supported.
4. Validate with `vp check` and Docker build.

## Open Questions
- None.
