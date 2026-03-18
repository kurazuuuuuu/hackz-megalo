# Change: update desktop hover gopher cursor companion

## Why
The desktop frontend currently changes hover states only through color and elevation. We need a more characterful reaction that reuses the supplied `blue.svg` gopher artwork without hurting readability or interaction.

## What Changes
- Add a desktop UI hover treatment that shows a small `blue.svg` mascot near the mouse cursor while supported surfaces are hovered
- Keep the mascot purely decorative so it never blocks clicks or obscures primary content
- Avoid panel-specific anchoring so the mascot placement stays consistent across different component sizes

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/main.ts`, `apps/frontend-webxr/src/style.css`
