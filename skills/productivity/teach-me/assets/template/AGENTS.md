# Teaching workspace

This is a local, frontend-only lesson application. Favor clean breaks over compatibility shims.

## Before authoring

Read every file in `src/teaching/`, then the topic mission, resources, notes, glossary, and learning records. Choose a primary mode for this lesson. A topic does not have one permanent mode.

## Lesson contract

- Put each lesson at `src/topics/<topic>/lessons/lesson-NNN/` with `meta.ts`, `route.tsx`, `sources.ts`, and `VERIFICATION.md`.
- Use the next unused three-digit number. Preserve existing lesson numbers.
- Freeze claims, excerpts, diffs, source metadata, and authored teaching states. Runtime may fetch presentation assets but never reinterprets live sources.
- Include at least one required deterministic activity. Presentation controls and scratchpad editing do not count.
- Prefer shared semantic components. Add a lesson-local component when the mechanism needs one.
- Label exact, simplified, and conceptual models beside the state they qualify.
- Keep every interaction resettable, repeatable, keyboard-accessible, and side-effect free.

## Definition of done

Run `vp check`, `vp test`, and `vp build`. Use ego-lite on the exact lesson route. Operate every state, case, answer path, reset, keyboard control, drawer, annotation, direct reload, narrow layout, and reduced-motion path. Inspect diagram placement and connectors, browser errors, and failed requests. Record observed evidence and limitations in the lesson `VERIFICATION.md`, then commit with a Conventional Commit message. Present the lesson only when every check passes.
