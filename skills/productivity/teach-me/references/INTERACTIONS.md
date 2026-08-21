# Deterministic interactions

Read this for every lesson. A lesson is interactive when the learner makes a decision that changes inspectable state and receives authored, deterministic feedback.

## Required activity

Include at least one required graded activity. Use one to three unless the lesson genuinely needs more. Good checks include stable-ID choices, ordering, matching, numeric targets with an exact value, range, or tolerance, trace predictions, next-line or next-state predictions, and semantic graph construction.

Essay responses and scratchpad code remain ungraded. A learner may reveal an explanation and continue after attempting an activity. Route navigation never locks.

## Feedback loop

Use the shared grading controller. Each activity supplies a deterministic checker and specific feedback.

- First wrong submission: show feedback and the first hint.
- Second wrong submission: keep retries open and show the full authored explanation.
- Correct submission: mark the stable activity ID solved and run a short visual confirmation.
- Revealed help never marks an activity solved. The learner still submits the correct state.

Allow unlimited retries. Keep feedback tied to the mismatched choice, pair, checkpoint, value, or connection rather than saying only "incorrect."

## Persistence and reset

Persist solved activity IDs per lesson. Keep wrong attempts and temporary feedback in memory. `Mark complete` unlocks when every required activity passes. `Mark incomplete` changes completion only.

Every activity has a local reset. Lesson reset names and clears solved activities, completion, scratchpad drafts, debugger position, diagram positions and edges, and revealed help. Ask for confirmation only when the lesson has saved state.

Provide a non-drag control for every drag interaction. Ordering uses Move up and Move down. Matching and graph construction use select-and-connect controls. Test keyboard paths against the same checker as pointer paths.

## Motion

Animate semantic changes with Motion. Keep ordinary transitions near 180 to 350 milliseconds and celebrations near 650 milliseconds. Controls stay usable during animation. Reduced motion changes state immediately with color, icon, and text cues. Performance scores and bundle-size warnings do not block a lesson, but freezes, runaway animation, inaccessible controls, clipping, and broken narrow layouts do.
