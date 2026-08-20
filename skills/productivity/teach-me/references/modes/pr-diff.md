# Pull-request diff lesson

Use for a GitHub pull request, branch comparison, commit, or patch.

## Snapshot

For GitHub, inspect with `gh`. Fetch the latest available PR state once during authoring and record repository, PR number, base SHA, head SHA, capture time, changed paths, and relevant discussion/check context. The lesson is a frozen explanation of those SHAs and must not poll GitHub at runtime.

## Split and teach

Group changes by responsibility and execution path, not raw file order. Split into multiple lessons when one route would exceed roughly eight meaningful steps, five excerpts, or a comfortable working-memory unit.

Explain:

1. the user-visible or architectural intent;
2. before and after behavior;
3. the path through changed modules/functions;
4. important line-level changes;
5. risks, invariants, and tests.

Use a synchronized diff and authored trace where code behavior matters. Include three to five representative cases: normal, many-data/high-volume, empty/no-input, and a meaningful edge or failure. Distinguish observed facts from inferred intent. Cite the PR, commits, files/lines, and authoritative API docs used to interpret it.
