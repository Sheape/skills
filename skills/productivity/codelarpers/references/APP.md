# The codelarper app

For changes to the platform itself: UI, CLI, harness, server. Authoring a course never needs this file.

## Layout

```text
skills/productivity/codelarpers/
  cli/                      Rust crate, binary `codelarper` (clap)
    src/main.rs             command definitions
    src/cli.rs              learner commands (submit/test/task/ping/open/serve) and `dev` commands
    src/course.rs           course files, ordering, lint
    src/progress.rs         event log, points, streaks (unit-tested)
    src/tester.rs           the harness: compile, tests.json cases, script protocol
    src/tester/codelarper_test.py   Python helper, embedded and written to <home>/lib
    src/server.rs           axum JSON API, SSE change feed, embedded UI
    src/scaffold.rs         new-course / new-stage templates and language kits
    src/repo.rs             codelarper.yml, local bare remotes
    src/icons.rs            course logos: find-icon ranking, set-icon (copy, download, sniff)
    src/termmd.rs           markdown for `codelarper task`
    build.rs                embeds ../web/dist (or $CODELARPER_WEB_DIST) via rust-embed
  web/                      React 19 + React Router 7 + Tailwind 4 UI, built by Vite into web/dist
  assets/logo.svg           the CodeLarpers mark (also web/public/logo.svg, favicon.svg, and LogoMark in ui.tsx)
  scripts/                  install.sh, test-e2e.sh, test-install.sh
  assets/example-course/wc  fixture course for the e2e test and the authoring docs
.github/workflows/codelarper.yml
```

## Release

The workflow builds the UI, then for each target (aarch64/x86_64 macOS and Linux) runs unit tests, the e2e test and a release build, and uploads `codelarper-<target>` as an artifact kept for 90 days. `install.sh` downloads the newest green run on `main` with `gh`, and falls back to a source build.

Bump `version` in `cli/Cargo.toml` with every change to `cli/` or `web/`: `install.sh` replaces an installed binary only when its version differs, and refuses an artifact whose version doesn't match the skill. A running server restarts itself on the next `serve --detach` when the binary changes (its build id is the version plus the binary's mtime).

## Local development

```bash
pnpm --dir web install && pnpm --dir web build
cargo build --manifest-path cli/Cargo.toml
CODELARPER_HOME="$(mktemp -d)" CODELARPER_PORT=7399 cli/target/debug/codelarper serve
CODELARPER_PORT=7399 pnpm --dir web dev       # hot reload; proxies /api
cargo test --manifest-path cli/Cargo.toml
scripts/test-e2e.sh cli/target/debug/codelarper
scripts/test-install.sh
```

Use a throwaway `CODELARPER_HOME` and port for development so the user's real challenges stay untouched.

## Data model

All state is an append-only `progress/<slug>/events.jsonl`. State is a fold over the events after the last `reset`; stage points are frozen in the `complete` event, so formula changes never rewrite history.

| type | fields | written by |
| -- | -- | -- |
| `intro` | `answers` | Introduction page |
| `ping` | `cwd` | `codelarper ping`, first test run |
| `attempt` | `stage`, `mode`, `passed`, `failedStage`, `run` | every `test`/`submit` |
| `complete` | `stage`, `points` | passing `submit` |
| `hint` | `stage`, `n` | revealing hint n |
| `examples` | `stage` | unlocking code examples before passing |
| `rating` | `stage`, `value` | the "How did this stage feel?" bar |
| `extension` | `ext`, `enabled` | sidebar switch |
| `reset` | none | course menu |

## HTTP API (bound to 127.0.0.1)

| route | returns |
| -- | -- |
| `GET /api/health` | app, build, home, pid |
| `GET /api/meta` | user name (git), totals |
| `GET /api/catalog` | course summaries |
| `GET /api/profile`, `GET /api/activity` | totals, per-day activity, timeline |
| `GET /api/courses/:slug` | course detail with stage statuses and progress |
| `GET /api/courses/:slug/stages/:id` | instructions, hints (bodies only once revealed), worth |
| `GET /api/courses/:slug/stages/:id/examples` | 403 until completed or unlocked |
| `POST .../unlock-examples`, `.../reveal-hint`, `.../rating`, `/introduction`, `/extensions/:ext`, `/reset` | append an event |
| `GET /api/courses/:slug/run` | latest test run lines |
| `GET /api/events` | SSE; one message per change under the data directory |

## Decisions

- The product is "CodeLarpers"; the binary, data directory and env vars are `codelarper`. The mark is a masquerade mask whose eyes read `</>`: you put on the author's mask and play their part.
- Course logos are real logos (project, then technology) or letters; never a drawn substitute.
- Single user, local only: no accounts and no leaderboard. Per-course points and the GitHub-style activity graph take their place.
- The layout and flows follow CodeCrafters (catalog, overview, sidebar of stages, test runner bar, logs drawer, gated code examples), while the name, logo and all copy are original. Keep it that way: import no CodeCrafters assets or text.
- Failed attempts are free; hints cost 10% each and early code examples 50%, with a floor of 10%.
- The server, harness and UI ship as one binary so installing is one file and nothing else runs.
