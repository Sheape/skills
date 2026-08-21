# Application contract

Read this when bootstrapping, changing discovery, or changing shared runtime behavior. The runnable implementation in `assets/template/` is authoritative.

## Runtime boundary

Use Vite+, React, TypeScript, React Router data mode, Motion, Tailwind CSS, local shadcn/ui source, Shiki, CodeMirror 6, React Flow, dnd-kit, Mermaid, ordinary React state, and namespaced `localStorage`. Node 20 or newer is required.

Keep the app frontend-only. Presentation assets may load remotely. Freeze or deterministically calculate teaching states, source interpretation, excerpts, diffs, and calculations in the lesson.

## Workspace

```text
src/
├── app/                         # discovery, router, layouts, shared runtime
├── teaching/                    # learner, pedagogy, design, component catalog
└── topics/<topic>/
    ├── topic.ts
    ├── MISSION.md
    ├── NOTES.md
    ├── RESOURCES.md
    ├── GLOSSARY.md
    ├── learning-records/
    ├── reference/
    ├── assets/
    └── lessons/lesson-NNN/
        ├── meta.ts
        ├── route.tsx
        ├── sources.ts
        └── VERIFICATION.md
```

Only the four lesson files shown above are mandatory. Add walkthrough data, tests, visuals, and lesson-local components when the lesson needs them.

## Discovery and routes

Vite literal `import.meta.glob` calls eagerly load `topic.ts` and `meta.ts`, then lazily load `route.tsx`. Paths provide topic slug, lesson ID, order, and `/<topic>/lesson-NNN` URL. Reject malformed paths and orphaned metadata or route pairs. Sort by numeric suffix. Never register a lesson manually.

Each `route.tsx` exports `Component`. Topic layouts own the overlay lesson drawer and `<Outlet>`. The topic index redirects to the first incomplete lesson, or the first lesson when all are complete.

## Shared runtime

The template shares behavior used across most lessons:

- lesson shell, closed-by-default overlay drawer, adjacent navigation, completion, reset, and theme;
- stepped scenes and deterministic choice, order, match, slider, trace, and semantic diagram activities;
- Shiki code blocks, authored debugger walkthroughs, and CodeMirror scratchpads;
- React Flow canvas, last-resort Mermaid renderer, citations, fidelity, and teaching annotations.

`/__catalog` renders a deterministic example of every shared component and important state. It is a test fixture, not a learner lesson. Keep the topic list empty in the template.

New lessons may create specialized components. Keep plots, memory views, timelines, diff views, and unusual diagrams lesson-local until repeated lesson behavior justifies promotion. Add promoted components to the catalog and tests.

## Visual contract

The lesson page stays full width. Its narrow overlay drawer starts closed and persists local choice. The annotation inspector and drawer close each other.

Use Notion-like paper light mode, Vercel-like ink dark mode, Geist prose, and JetBrains Mono Nerd Font Propo code loaded remotely. Respect visible focus, contrast, narrow layouts, text alternatives, and reduced motion. Motion explains changes but never carries the only explanation.

## Git contract

The generated workspace is its own local repository. Bootstrap creates `chore: bootstrap teaching workspace`; each complete lesson gets a later Conventional Commit. Use ordinary deletion commits for recovery through Git history. Do not maintain revision files, configure a remote, or push.
