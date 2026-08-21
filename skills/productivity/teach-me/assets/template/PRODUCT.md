# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite+, React, TypeScript, React Router data mode, Motion, Tailwind CSS, local shadcn/ui source, Shiki, CodeMirror 6, React Flow, dnd-kit, and Mermaid.

## User and purpose

One learner uses a local, agent-authored course to understand code, systems, mathematics, algorithms, documents, and codebases. A lesson succeeds when the learner can inspect a mechanism, make a checkable prediction, and transfer the idea to a different problem.

## Operating model

The agent researches and verifies material, writes a frozen lesson snapshot, runs automated checks, operates the exact route in ego-lite, and serves the finished application. The browser renders authored semantic states. Code walkthroughs look and behave like a debugger but do not execute code. Editable code is an ungraded scratchpad with verified or clearly illustrative output beside it.

## Constraints

- Every lesson has a stable `/<topic>/lesson-NNN` route.
- Each lesson has at least one deterministic graded activity.
- The runtime is frontend-only and may persist local progress and drafts.
- Remote presentation assets are allowed. Teaching claims do not refresh at runtime.
- No backend, database, authentication, arbitrary code execution, or multi-device synchronization.

## Brand and access

Light mode follows Notion's document surfaces. Dark mode follows Vercel's technical interface. Prose uses Geist. Code uses JetBrains Mono Nerd Font Propo from a CDN.

Every interaction supports keyboard use, visible focus, reduced motion, sufficient contrast, narrow viewports, reset, and non-visual labels for meaningful visual relationships.
