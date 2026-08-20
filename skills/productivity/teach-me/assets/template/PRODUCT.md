# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite+, React, TypeScript, React Router in data mode, Motion for React, Tailwind CSS, and local shadcn/ui source components.

## Users

One learner uses a local, agent-authored course to understand code, systems, mathematics, algorithms, documents, and codebases through visual, stepped lessons.

## Product purpose

Render lessons as routes in one frontend application. Success means the learner can inspect a mechanism, predict what happens next, and transfer the idea to a different problem.

## Positioning

The agent authors the exact state the learner should perceive at each step. The browser renders those semantic states without pretending to be a debugger, code sandbox, or live tutoring backend.

## Operating context

An agent researches and verifies lesson material, writes a frozen lesson snapshot, runs checks, and serves the finished local application. The learner progresses through the lesson in a browser and discusses open-ended work with the agent.

## Capabilities and constraints

- Every lesson has a stable `/<topic>/lesson-NNN` route.
- The runtime is frontend-only and may persist progress in `localStorage`.
- Lessons may load remote presentation assets, but they do not discover or reinterpret live teaching sources.
- Code traces may be exact, simplified, or conceptual and label their fidelity.
- No backend, database, authentication, arbitrary code execution, or multi-device synchronization.

## Brand commitments

Light mode follows Notion's calm document surfaces. Dark mode follows Vercel's restrained technical interface. Prose uses Geist. Code uses JetBrains Mono Nerd Font Propo from a CDN.

## Product principles

- Reveal mechanisms progressively.
- Keep prose subordinate to the visual model.
- Make authored fidelity explicit.
- Prefer reproducible state over runtime cleverness.
- Treat accessibility and reset behavior as part of correctness.

## Accessibility & inclusion

All interactions support keyboard use, visible focus, reduced motion, sufficient contrast, narrow viewports, and non-visual labels for visual relationships.
