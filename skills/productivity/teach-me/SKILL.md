---
name: teach-me
description: Research, author, test, and serve a visual interactive lesson as a route in a local React teaching workspace.
---

# Teach me

<IMPORTANT>
Present a lesson only after its material, automated checks, production build, and exact browser route pass verification. A plausible draft is not a lesson.
</IMPORTANT>

Build or extend one local, frontend-only course. Each lesson is a React Router data-mode route at `/<topic>/lesson-NNN`, never a standalone HTML file.

## 1. Open the workspace

Look upward for `.teach-me-template`. If absent, run `scripts/bootstrap.sh` from this skill. In an existing Git repository it creates an independently versioned `.lessons/` app and adds `/.lessons/` to the outer repository's local exclude file. In an empty directory it uses that directory. It refuses to overwrite unmarked content.

Read the workspace `AGENTS.md`, every file in `src/teaching/`, and [APP-CONTRACT.md](./references/APP-CONTRACT.md). For an existing topic, also read its mission, notes, resources, glossary, and active learning records.

## 2. Set the target and evidence

Create or tighten the topic mission with [MISSION-FORMAT.md](./references/MISSION-FORMAT.md). Pick the next unused three-digit lesson number and preserve existing lesson numbers.

For technologies, use a user-pinned version. Otherwise default to latest stable. Ask when mainstream tracks change the lesson, such as Node LTS versus Current or language standards.

Follow [SOURCES.md](./references/SOURCES.md). Capture current primary sources while authoring, then freeze their revision, capture date, claims, excerpts, code, and PR data into the lesson. The finished route never discovers or interprets live teaching material.

Verify libraries, languages, and frameworks with the real version in a disposable environment. Install locally when practical and use Docker when the host lacks it. Hardware, payment, or authentication boundaries use authoritative sources instead. Do not involve the learner in login or purchase merely to verify a lesson.

## 3. Choose this lesson's mode

Mode belongs to the lesson, not the topic. Choose one primary mode and read only its reference:

- [technology](./references/modes/technology.md): library, language, or framework
- [pr-diff](./references/modes/pr-diff.md): pull request or code diff
- [math](./references/modes/math.md): mathematical concept or formula
- [algorithm](./references/modes/algorithm.md): algorithm or data structure
- [document-plan](./references/modes/document-plan.md): PRD, plan, or document
- [codebase](./references/modes/codebase.md): codebase walkthrough
- [generic](./references/modes/generic.md): anything else

Modes may borrow each other's visuals. Read [PEDAGOGY.md](./references/PEDAGOGY.md), then teach one useful capability just above the learner's demonstrated floor.

## 4. Design the interaction

Read [INTERACTIONS.md](./references/INTERACTIONS.md) for every lesson. Each lesson needs at least one deterministic, checkable learner decision. Stepping, panning, opening an annotation, and editing an unexecuted scratchpad are presentation controls, not the required activity.

Read the matching branch only when the lesson needs it:

- [CODE-WALKTHROUGHS.md](./references/CODE-WALKTHROUGHS.md) for source, diffs, authored traces, or editable scratchpads.
- [DIAGRAMS.md](./references/DIAGRAMS.md) for architecture, data flow, ERDs, state machines, plots, geometry, or graph construction.
- [ANNOTATIONS.md](./references/ANNOTATIONS.md) for do, don't, warning, or note explanations.

Create `src/topics/<topic>/lessons/lesson-NNN/` with `meta.ts`, `route.tsx`, `sources.ts`, and `VERIFICATION.md`. Add walkthrough data, tests, visuals, or lesson-local components when required. Compose the shared runtime first. A new lesson may add a specialized component; move it into `src/app/components/` only when it represents repeated lesson behavior.

## 5. Prove the complete lesson

Add the smallest automated checks that fail when the new content or interactions break. Run:

```bash
vp check
vp test
vp build
```

Follow [VERIFICATION.md](./references/VERIFICATION.md). Use ego-lite to open the exact route and operate every relevant state, case, answer path, reset, keyboard path, direct reload, drawer, annotation, citation, and completion action. Check narrow layout, reduced motion, console errors, failed requests, clipping, and diagram connectors. Fix every issue before continuing.

If the `unslop` skill is installed, use it for the final learner-facing copy pass. Commit the green lesson in the nested workspace with a Conventional Commit message. Do not add a remote or push.

## 6. Deliver, then learn

If the `tailscale-serve` skill is installed, run it for the verified app and perform no other exposure workflow. If missing, keep the app running locally and open the exact route with ego-lite.

Update learning records only after interaction supplies evidence such as demonstrated understanding, relevant prior knowledge, a corrected misconception, or a changed mission. Coverage alone is not learning.
