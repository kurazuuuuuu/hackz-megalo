# Change: update frontend ui font to WDXL Lubrifont JP N

## Why
The current frontend uses a mixed sans-serif stack that does not match the requested visual direction. We need the start screen and desktop console to consistently use `WDXL Lubrifont JP N`.

## What Changes
- Load `WDXL Lubrifont JP N` as a web font in `apps/frontend-webxr`
- Update the frontend typography tokens so the start screen and connected desktop console use the requested font as their primary face
- Keep the existing monospace stack for IDs and diagnostic-style text

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/index.html`, `apps/frontend-webxr/src/style.css`
