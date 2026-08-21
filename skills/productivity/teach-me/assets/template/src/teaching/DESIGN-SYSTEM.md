# Design system

Light mode uses Notion-like paper surfaces: warm `#f6f5f4`, white cards, quiet hairlines, dark ink, and restrained blue actions. Dark mode uses Vercel-like black and `#111` surfaces, white ink, and precise gray borders. System preference is the default and the explicit toggle persists locally.

Use Geist for prose and JetBrains Mono Nerd Font Propo for code through the remote font declarations in `src/index.css`. Remote images, videos, SVGs, icons, and fonts are allowed presentation assets.

The lesson drawer overlays the page and starts closed. The annotation inspector uses the right side on wide screens and a bottom sheet on narrow screens. They close each other.

Motion explains semantic change. Normal transitions stay near 180 to 350 milliseconds and celebrations near 650 milliseconds. Reduced motion changes state immediately. Do not fail a lesson for a performance score or bundle warning. Fix freezes, broken controls, clipping, poor focus, and narrow-layout failures.

Active code lines use a full-width mint or emerald rectangle, strong gutter bar, and `ACTIVE` badge. Keep exact output, program state, and conceptual visuals in separate panels. Teaching annotations pair color with an icon and visible label.
