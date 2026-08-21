# Verification contract

No lesson reaches the learner before every applicable check passes.

## Automated gate

Run `vp check`, `vp test`, and `vp build`. Test each new activity's wrong answer, correct answer, retry, first hint, second explanation, reset, keyboard path, and solved-state reload. Test debugger controls and cases, editor copy and reset, output labels, annotation focus, drawer behavior, completion gating, and semantic diagram relationships when present.

Verify authored case tables, formulas, and deterministic calculations independently when a wrong value could teach the wrong model. Bundle-size and performance-score warnings do not fail the gate. A freeze, runaway animation, inaccessible control, broken interaction, clipping, or narrow-layout failure does.

## Ego-lite browser gate

Start the production-equivalent app and use ego-lite to open the exact `/<topic>/lesson-NNN` route. This pass is mandatory for every lesson. Operate, rather than merely inspect:

- every step and representative case forward and backward;
- wrong, hint, explanation, retry, correct, completion, local reset, and lesson reset paths;
- debugger controls, case switching, scratchpad editing and copy controls, citations, annotations, drawer, and graph controls when present;
- keyboard controls without hijacking inputs;
- topic and adjacent navigation plus direct URL reload;
- system, light, dark, reduced motion, and a narrow viewport;
- diagram fit, labels, connectors, overlaps, clipping, selection, movement, connection, and reset;
- browser console and failed resource requests.

A screenshot proves appearance only. Interactions need an operated browser check. Fix every failure before recording a pass.

## Lesson record

Each lesson's `VERIFICATION.md` records:

```md
# Verification

## Snapshot

- Authored: YYYY-MM-DD
- Subject revisions/versions: ...
- Source capture: ...

## Material verification

- Environment or Docker image: ...
- Commands/checks and result: ...
- Representative cases: ...

## Application verification

- `vp check`: pass
- `vp test`: pass
- `vp build`: pass
- Browser route: /topic/lesson-NNN
- Browser interactions/viewports: ...

## Diagram fidelity

- Preserved relationships: ...
- Merged or omitted: ...
- Interaction/style adaptations: ...

## Limitations

- None, or a precise boundary such as unavailable hardware.
```

Write observed results. Fix failures before recording pass. After the gate is green, commit the complete lesson with a Conventional Commit message.
