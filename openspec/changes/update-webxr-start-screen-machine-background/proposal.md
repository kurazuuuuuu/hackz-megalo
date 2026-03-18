# Change: blend machine illustration into the pre-session start screen

## Why
The pre-session home screen currently uses gradients only, so the newly prepared machine illustration is not visible. We need to blend that artwork into the start screen background without overpowering the session status and primary action.

## What Changes
- Blend `public/assets/machine-colorized.svg` into the pre-session start screen background with reduced opacity
- Preserve readability of the start screen copy, status line, and primary action button
- Keep the effect responsive so the artwork still feels integrated on smaller screens

## Impact
- Affected specs: `playable-frontend`
- Affected code: `apps/frontend-webxr/src/style.css`
