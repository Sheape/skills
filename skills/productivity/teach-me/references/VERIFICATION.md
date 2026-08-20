# Verification contract

No lesson reaches the learner before all applicable checks pass.

## Automated gate

Run `vp check`, `vp test`, and `vp build`. Test each new interactive component with the smallest meaningful behavioral test. Verify deterministic calculations or authored case tables independently when a wrong value could teach the wrong model.

## Browser gate

Start the production-equivalent app and open the exact `/<topic>/lesson-NNN` route. Test:

- every step and representative case forward and backward;
- reset and repeatability;
- keyboard controls without hijacking inputs;
- prediction, reveal, hint, answer, citations, and explicit completion when present;
- topic/adjacent navigation and direct URL reload;
- narrow viewport and no horizontal clipping;
- system/light/dark theme, visible focus, and reduced motion;
- console errors and failed resource requests.

Use the repository-mandated browser tooling. A screenshot is evidence of appearance, not evidence that interactions work.

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

## Limitations

- None, or a precise boundary such as unavailable hardware.
```

Write observed results, not intended checks. Fix failures before recording pass. After the gate is green, commit the complete lesson with a Conventional Commit message.
