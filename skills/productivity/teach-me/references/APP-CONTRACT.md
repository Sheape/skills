# Application contract

Read this when bootstrapping, changing discovery, or changing shared runtime behavior. The runnable implementation in `assets/template/` is authoritative.

## Runtime boundary

Use Vite+, React, TypeScript, React Router data mode, Motion for React, Tailwind CSS, local shadcn/ui source, ordinary React state, and optional namespaced `localStorage`. Do not add a backend, database, authentication, SSR, WebContainers, Pyodide, DAP, arbitrary code execution, or multi-device synchronization.

Presentation assets may load remotely. Teaching states, source interpretation, excerpts, diffs, and calculations must be frozen or deterministic in the lesson.

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

Vite literal `import.meta.glob` calls eagerly load `topic.ts` and `meta.ts`, then lazily load `route.tsx`. Paths provide topic slug, lesson ID, order, and `/<topic>/lesson-NNN` URL. Reject malformed paths and orphaned metadata/route pairs. Sort by numeric suffix. Never manually register a lesson in the router.

Each `route.tsx` exports `Component`. Topic layouts own the sidebar and `<Outlet>`. The topic index redirects to the first incomplete lesson, or the first lesson when all are complete.

## Shared runtime

The template deliberately shares only:

- application/topic/lesson shells and navigation
- stepped scene controls with bounded keyboard movement and reset
- prediction and challenge activities
- citation, source, and fidelity UI
- local completion and theme preference

The synthetic `/__catalog` route renders these behaviors for testing but is not a lesson. Code viewers, diagrams, plots, diff views, and document maps begin lesson-local. Promote one after a second real reuse, with its tests and catalog state.

`SteppedScene` owns index, bounds, reset, dots, Previous/Next, Home/End, and Left/Right. Lessons own immutable semantic step data and rendering. Motion explains state changes; it is never required to understand or operate the lesson.

## Visual contract

Use the template theme: Notion-like paper light mode, Vercel-like ink dark mode, Geist prose, and JetBrains Mono Nerd Font Propo code loaded remotely. System theme is the default and an explicit toggle persists locally. Respect narrow layouts, visible focus, semantic controls, text alternatives, contrast, and reduced motion.

## Git contract

The generated workspace is its own local repository. The bootstrap commit is `chore: bootstrap teaching workspace`; every complete lesson gets a later Conventional Commit. Use normal deletion commits for recovery through Git history. Do not maintain revision-number files, configure a remote, or push.
