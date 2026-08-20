# Teaching workspace

This is a local, frontend-only lesson application. Favor clean breaks over compatibility shims.

## Before authoring a lesson

Read `src/teaching/LEARNER.md`, `PEDAGOGY.md`, `DESIGN-SYSTEM.md`, and `COMPONENT-CATALOG.md`, then read the topic mission, resources, notes, and learning records. Choose a primary mode for this lesson; a topic does not have one permanent mode.

## Lesson contract

- Put each lesson at `src/topics/<topic>/lessons/lesson-NNN/` with `meta.ts`, `route.tsx`, `sources.ts`, and `VERIFICATION.md`.
- Use the next unused three-digit lesson number. Never renumber an existing lesson.
- Freeze teaching claims, code excerpts, diffs, and source metadata at authoring time. Runtime may fetch presentation assets, but must not reinterpret live sources.
- Prefer authored semantic states and `SteppedScene`. Label exact, simplified, and conceptual models.
- Keep every interaction resettable, repeatable, keyboard-accessible, and side-effect free.
- Keep a mode-specific component inside its lesson. Move it into `src/app/components/` only after a second real lesson reuses it.

## Definition of done

Run `vp check`, `vp test`, and `vp build`. Interactively test the exact lesson route, all states and cases, reset, keyboard controls, direct reload, a narrow viewport, reduced motion, and the browser console. Record evidence and limitations in the lesson's `VERIFICATION.md`, then commit with a Conventional Commit message. Do not present a lesson before every check is green.
