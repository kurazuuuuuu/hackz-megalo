# Change: update webxr pod styling with gopher-inspired silhouette and minimal console ui

## Why
The current XR Pod is still a stretched sphere and the desktop monitor screen contains explanatory copy that makes the console feel heavier than intended. We need a clearer visual identity for Pods and a denser desktop layout that matches a monochrome operations console.

## What Changes
- Redesign XR Pods as locally generated gopher-inspired meshes with a more vertically elongated silhouette, large round eyes, small ears, visible front teeth, and a cyan body palette
- Keep XR Pods basically upright during normal board simulation while still allowing player-driven movement such as pinch/grab repositioning
- Place the XR desk/board at a floor-referenced height derived from the `local-floor` reference space instead of the user's head height
- Keep the desktop monitor screen monochrome-first and reserve cyan as the only strong accent color
- Remove instructional prose from the desktop-connected screen and replace it with dense console-style pod monitoring panels
- Keep the current session flow and XR entry behavior, while making the start screen visually simpler

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/main.ts`, `apps/frontend-webxr/src/scene.ts`, `apps/frontend-webxr/src/style.css`
