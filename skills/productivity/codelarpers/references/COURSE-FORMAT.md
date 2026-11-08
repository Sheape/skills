# Course format

Every file an author writes, and where the app shows it. A complete worked example lives in [`assets/example-course/wc`](../assets/example-course/wc): copy its patterns.

## Data directory

```text
~/.local/share/codelarpers/          ($CODELARPERS_HOME overrides)
  courses/<slug>/                   you write these
  repos/<slug>.git                  the learner's local remote; `dev publish` creates it
  progress/<slug>/events.jsonl      the learner's history; append-only, never edit
  runs/<slug>/latest.json           last test run, shown in the Logs drawer
  lib/codelarpers_test.py            Python test helper, written by the harness
```

The catalog lists courses oldest first by `created`, so the third project's challenge is the third card.

## course.json

```json
{
  "slug": "rustc-lexer",
  "name": "Build your own rustc lexer",
  "short": "Learn about tokens, spans and raw strings",
  "kind": "codebase",
  "languages": ["rust"],
  "created": "2026-11-08",
  "icon": "icon.svg",
  "source": { "project": "/Users/me/code/rust", "repository": "https://github.com/rust-lang/rust", "commit": "<sha>", "subject": "rustc_lexer" },
  "extensions": [{ "slug": "literals", "name": "Literals", "description": "Numbers, chars and raw strings." }],
  "stages": [
    { "id": "kp1", "name": "Tokenize identifiers", "difficulty": "very_easy" },
    { "id": "rs4", "name": "Raw strings", "difficulty": "hard", "extension": "literals" }
  ]
}
```

| field | shown as | rule |
| -- | -- | -- |
| `name` | catalog card, overview hero, sidebar | "Build your own X" |
| `short` | catalog card, overview subtitle | one line, "Learn about A, B and more" |
| `kind` | badges; code-example wording; lint rules | `codebase` or `tutorial` |
| `languages` | "using Rust" | usually one; several means the learner picks on the Introduction page |
| `source` | overview Source box, profile timeline | `project` is the absolute path `dev find` matches |
| `icon`, `iconBackground` | catalog, sidebar, overview | the course logo; see [Logo](#logo). Without one the app draws a letter tile |
| `extensions` | sidebar groups with an on/off switch | optional deep dives, listed after base stages |
| `stages` | sidebar, overview list | `dev new-stage` appends; `--after <id>` inserts |

A stage `id` is permanent: progress is keyed on it. Reorder stages freely, never rename an id, and never delete a stage the learner has completed (its points go with it). Difficulty sets the points: `very_easy` 10, `easy` 20, `medium` 40, `hard` 80.

## Files

```text
courses/<slug>/
  course.json
  overview.md          description, then FAQ sections
  introduction.md      the Introduction page
  icon.<ext>           the logo, written by `dev set-icon`
  assets/              images for overview or introduction
  starters/<lang>/     the learner's initial repository
  solution/<lang>/     cumulative reference solution (author-only; never served)
  stages/<id>/
    instructions.md    the stage page's "Your Task" card and `codelarpers task`
    tests.json         declarative cases          } at least one of these;
    test.py            scripted test (or .sh/.mjs) } see TESTS.md
    hints.md           the hint ladder
    resources.md       links, free to open
    examples/NN-*.md   code examples, gated
    assets/            images used by instructions.md (relative paths)
    near-misses/<lang>/<bug>/  the solution with one plausible bug (author-only; never served)
```

## Logo

Every challenge shows its subject's real logo, found in this order:

1. **Codebase: the project's own mark.** `codelarpers dev find-icon --project <dir>` ranks images the README shows, files named logo, icon or brand (the project's own, full-colour, square variants first), and the GitHub owner's avatar. Open the top candidates (Read shows images) and pick the square mark; skip wordmarks and screenshots.
2. **Tutorial, or a codebase with no logo: the technology's official logo.** [devicon](https://devicon.dev) has full-colour SVGs for most languages and tools, at `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/<name>/<name>-original.svg`. Otherwise use the logo from the project's official site or repository.
3. **Nothing fits: leave `icon` unset.** The app draws a two-letter tile from the subject ("rustc lexer" becomes RL). Never draw a logo yourself.

```bash
codelarpers dev set-icon <slug> <file-or-url> [--background "#ffffff"]
```

`set-icon` copies a file or downloads a URL (svg, png, webp, jpg, gif or ico, under 1.5 MB), stores it as `icon.<ext>` and updates `course.json`. A logo that is black, dark or single-colour disappears on one of the two themes: pass `--background` with a contrasting colour to draw it on a tile. Check the catalog card in both themes in step 7.

## overview.md

One or two paragraphs (what the subject is, what the learner ends up with, "Along the way, you'll learn about…"), then one `## ` section per FAQ. The overview page renders each section as an accordion. Use these four: *What exactly will I build?*, *What exactly will I learn?*, *Why should I build such a project?*, *What are the prerequisites for this challenge?*

## instructions.md

````markdown
In this stage, you'll <one capability, one sentence>.

### <Concept>

<details>
<summary>Click to expand/collapse</summary>

<What it is, its exact format or rules, a worked example with different values than the tests use.>

</details>

### Tests

The tester will run your program like this:

```bash
$ ./your_program.sh <command> <args>
```

It'll expect stdout to be:

```
<exact output>
```

### Notes

- <Edge cases the tests check.>
- <Codebase challenges: where the real implementation lives, `path/to/file.rs`.>
````

- Every check in the tests must be derivable from this page; the learner should be able to reproduce each one by hand.
- Teach the concept and leave the code to the learner: no function signatures to fill in, no pseudo-code of the solution.
- The page adds "How to pass this stage", the test runner, hints and resources itself.

## hints.md

One `## <title>` per hint, two to four, ordered from nudge to near-answer: a question to ask, then the specific rule they are probably missing, then the gotcha most attempts trip on. Each reveal costs 10% of the stage's points. The last hint names the gotcha; the code stays the learner's.

## resources.md

A markdown list of links that help without giving the answer: specs, official docs, the studied file at the pinned commit. Free to open.

## examples/*.md

````markdown
---
title: How the real lexer advances its cursor
source: rust-lang/rust
path: compiler/rustc_lexer/src/cursor.rs
lines: 40-88
commit: <full sha of the pinned commit>
url: https://github.com/rust-lang/rust/blob/<sha>/compiler/rustc_lexer/src/cursor.rs#L40-L88
license: MIT OR Apache-2.0
language: rust
kind: codebase
---
One paragraph: what to notice, and how it maps to what the learner just built.

```rust
<verbatim excerpt>
```
````

- `kind: codebase` quotes the studied codebase verbatim at the pinned commit; `path` and `commit` are required.
- `kind: professional` (tutorial challenges) quotes permissively licensed open-source code verbatim; `source`, `url` (a permalink at a commit) and `license` are required.
- `lines` is the excerpt's range in the source file (`40-88`); its first number starts the line numbering. Keep excerpts focused, up to about 60 lines.
- Give every stage at least one example; lint warns when a stage has none.
- Unlocking examples before passing costs 50% of the stage, so they are the reveal: how the real thing does what the learner just struggled through.

## starters/<lang> and solution/<lang>

`dev new-course` writes both with build plumbing for rust, go, python, javascript, typescript, c and cpp (other languages get stubs to fill):

| file | purpose |
| -- | -- |
| `.codelarpers/compile.sh` | optional; runs once per test run from the repository root |
| `.codelarpers/run.sh` | required and executable; runs the program for every test from a temporary directory, so it must not depend on the working directory |
| `your_program.sh` | runs compile then run locally |
| `README.md` | entry point and the test/submit loop |

The starter compiles, writes "Logs from your program will appear here!" to stderr and exits non-zero, so every stage starts red. The solution keeps the starter's structure and implements every stage. `codelarpers.yml` is added at publish time; leave it out of both.

## Near-misses

A near-miss is the solution with the bug a learner is most likely to ship for this stage: the gotcha the last hint names, an off-by-one, an edge case from the Notes. It proves the tests catch that bug. Put it in `stages/<id>/near-misses/<lang>/<bug>/`, named after the bug (`counts-unterminated-last-line`). Inside, copy only the solution files you change, at their solution paths (`app/main.py`). `dev validate` copies `solution/<lang>/`, lays these files over it, and requires the result to:

- compile, so it fails because of the bug and not a typo
- pass every earlier stage, so the bug belongs to this stage
- fail this stage on every seed of `--repeat`, so the tests catch the bug every time, not by luck

Lint requires at least one near-miss per stage for each language that has a solution. The learner never sees them: the app serves only `assets/` folders.

## Extending a published challenge

Add stages with `dev new-stage` (`--after <id>` to insert) and extensions with `dev new-extension`, extend `solution/<lang>/` to pass them, give each new stage its near-misses, and validate again. The learner's repository already exists, and their current stage moves on to the new stages by itself.
