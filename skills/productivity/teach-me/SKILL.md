---
name: teach-me
description: Research, author, test, and serve a visual interactive lesson as a route in a local React teaching workspace.
disable-model-invocation: true
argument-hint: "What should I teach you?"
---

# Teach me

<IMPORTANT>
Do not present a lesson until its content, automated checks, production build, and exact browser route are all verified. A plausible draft is not a lesson.
</IMPORTANT>

Build or extend one local, frontend-only course. Each lesson is a React Router data-mode route at `/<topic>/lesson-NNN`; it is never a standalone HTML file.

## 1. Find or bootstrap the workspace

Look upward for `.teach-me-template`. If absent, run `scripts/bootstrap.sh` from this skill. In an existing Git repository it creates a nested `.lessons/` app, adds `/.lessons/` to the outer repository's `.git/info/exclude`, and initializes independent local Git history. In a truly empty directory it uses that directory. Never overwrite an unmarked non-empty destination.

Read the workspace `AGENTS.md`, all files in `src/teaching/`, and [APP-CONTRACT.md](./references/APP-CONTRACT.md). For an existing topic also read `MISSION.md`, `NOTES.md`, `RESOURCES.md`, `GLOSSARY.md`, and every active learning record.

## 2. Establish the target

Create or tighten the topic mission using [MISSION-FORMAT.md](./references/MISSION-FORMAT.md). Pick the next unused three-digit lesson number and never renumber old lessons.

For technologies, default to the latest stable release. Ask only when several mainstream choices materially change the lesson, such as Node LTS versus Current, Java releases, or C++ standards. A user-pinned version always wins.

## 3. Research and verify the material

Follow [SOURCES.md](./references/SOURCES.md). Use current primary sources during authoring and freeze their revision, capture date, claims, excerpts, code, and PR data into the lesson. The finished route must not discover or reinterpret live teaching material.

For any library, language, or framework, verify with the real version in a disposable environment instead of guessing. Install it locally when practical; use Docker when the host lacks it. If hardware, payment, or authentication makes that unreasonable, use authoritative sources and record the limitation. Never ask the learner to sign in or buy something merely to verify a lesson.

## 4. Choose this lesson's mode

Mode belongs to the lesson, not its topic. Choose one primary mode and read only its reference:

- [technology](./references/modes/technology.md): library, language, or framework
- [pr-diff](./references/modes/pr-diff.md): pull request or code diff
- [math](./references/modes/math.md): mathematical concept or formula
- [algorithm](./references/modes/algorithm.md): algorithm or data structure
- [document-plan](./references/modes/document-plan.md): PRD, plan, or document
- [codebase](./references/modes/codebase.md): codebase walkthrough
- [generic](./references/modes/generic.md): anything else

Modes may borrow each other's visuals. Read [PEDAGOGY.md](./references/PEDAGOGY.md), then teach one useful capability just above the learner's demonstrated floor.

## 5. Author the complete lesson

Create `src/topics/<topic>/lessons/lesson-NNN/` with:

- `meta.ts`: title, summary, and primary mode
- `route.tsx`: named `Component` export
- `sources.ts`: frozen citation records
- `VERIFICATION.md`: evidence using [VERIFICATION.md](./references/VERIFICATION.md)

Add lesson-local state, SVG, plots, diff views, or components when required. Compose the shared runtime first; promote a lesson component to `src/app/components/` only after a second real lesson needs the same behavior. Agents author semantic states, not animation choreography.

Every interaction must be side-effect free, deterministic, resettable, keyboard-accessible, and reproducible. Separate literal output, program state, and conceptual visualization. Put `exact`, `simplified`, or `conceptual` next to the state it qualifies.

## 6. Prove it

Add the smallest automated test that would fail if each new interaction broke. Run:

```bash
vp check
vp test
vp build
```

Then follow [VERIFICATION.md](./references/VERIFICATION.md): open the exact route in a browser and exercise every state, representative case, reset, keyboard path, direct reload, narrow layout, reduced-motion behavior, citation interaction, and completion action. Check the console. Fix every issue before continuing.

Commit the green lesson in the nested workspace with a Conventional Commit message. Do not add a remote or push.

## 7. Deliver, then learn

If the `tailscale-serve` skill is installed, run it for the verified lesson app and perform no alternative serving workflow. If it is missing, start the app and open the exact lesson route using the available browser workflow.

Update learning records only after interaction supplies evidence: demonstrated understanding, relevant prior knowledge, a corrected misconception, or a changed mission. Coverage alone is not learning.
