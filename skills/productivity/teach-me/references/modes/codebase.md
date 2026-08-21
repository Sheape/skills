# Codebase walkthrough lesson

Use for understanding an existing repository, subsystem, request path, or module family.

## Discover

Read repository instructions first and use its preferred code-navigation tools. Record the inspected Git commit when available. Find entry points and trace real calls/data before designing visuals; do not infer architecture from filenames alone.

## Split

Never make one lesson cover the whole codebase. Split by responsibility or executable path, such as request ingress, domain decision, persistence, event flow, rendering, or one bounded module. Split again around eight meaningful steps, five excerpts, or whenever unrelated names must stay in working memory.

## Lesson shape

Anchor the route in a question the learner can answer afterward. Reveal boundaries and data flow first, then zoom into only the functions needed for that question. Use exact file/symbol citations and a commit snapshot. Separate code facts from conceptual simplifications and architectural inferences.

When control flow branches, walk normal, many-data or high-volume, empty or no-input, and one meaningful edge path. End with a deterministic prediction about where behavior belongs, which path data takes, or which function runs next.
