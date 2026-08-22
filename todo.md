- [x] Add subtle multi-depth star and particle motion that remains lightweight on mobile.
- [x] Refine slow orbital and planetary movement without changing the existing visual structure.
- [x] Add cinematic completion, XP, level-up, and cosmic-unlock feedback states.
- [x] Verify desktop and mobile motion behavior, including reduced-motion support.

## Verification refinement
- [x] Inspect current motion and milestone feedback against the requested cinematic behavior.
- [x] Add targeted refinements without changing the app’s layout, features, or local-first architecture.
- [x] Run existing checks and validate desktop, mobile, and reduced-motion behavior.

## Automated productivity tests
- [x] Extract pure timer and productivity state logic while preserving current application behavior.
- [x] Add fake-timer tests for timer controls, completion, XP, levels, streaks, and persistence.
- [x] Add the npm test command and run the full automated suite plus build checks.

## Goal and reset tests
- [x] Add deterministic goal editing, deletion, and reset-confirmation helpers to the local productivity domain.
- [x] Add Vitest coverage for goal editing, deletion, and accepted or declined reset confirmation.
- [x] Run the complete suite, type check, and production build.

## Goal idempotency and analytics tests
- [x] Add deterministic analytics helpers while preserving the current dashboard calculations.
- [x] Add Vitest coverage for goal-completion XP idempotency and daily/monthly analytics.
- [x] Run the complete test suite, TypeScript check, and production build.

## Universe progression tests
- [x] Extract the existing star, planet, moon, comet, and universe-level thresholds into testable local logic.
- [x] Add deterministic Vitest coverage for threshold boundaries, non-premature unlocks, and reload persistence.
- [x] Run the full test suite, TypeScript check, and production build.
