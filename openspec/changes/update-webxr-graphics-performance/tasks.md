## 1. Implementation
- [x] 1.1 Add OpenSpec delta for `playable-frontend` performance improvements
- [x] 1.2 Introduce shared Pod rendering asset cache in `apps/frontend-webxr/src/scene.ts` (`createPodMesh`, `disposePodEntry`, `removePodEntry` updates)
- [x] 1.3 Add coalesced/throttled wrist HUD update path in `apps/frontend-webxr/src/scene.ts` (`drawHud`/`refreshHud`/`setHudData`/`updateHudDebugState`)
- [x] 1.4 Enable pod physics sleeping behavior in `apps/frontend-webxr/src/scene.ts` (`createPodPhysics`, interaction wake paths)
- [x] 1.5 Implement gust VFX pooling for gust visuals/colliders in `apps/frontend-webxr/src/scene.ts` (`launchGust`, `removeGust`, `clearGusts`)
- [x] 1.6 Run `vp check` in `apps/frontend-webxr`
- [x] 1.7 Run repository root `docker compose build <frontend-webxr-service> --no-cache` for build verification
