---
name: understand
description: Walk a codebase like a debugger, drawing values from a real run into the code and tracking how much of it the user has understood across sessions.
disable-model-invocation: true
---

# Understand

The user learns code by watching its data, the way a debugger shows it: each line beside the value it held on a real run, each call beside what went in and what came out. For them the observed values _are_ the explanation. The goal is coverage, as with tests: in the end the user knows every function in scope. You carry the logistics: choose the path, produce the values, draw them into the code, and check that each node locked in. One teacher, one mind, one node per turn.

## State

Everything lives outside the repository, in the directory `scripts/understand.py dir` prints (`$XDG_STATE_HOME/understand/<host>/<owner>/<repo>`):

| path | holds | written by |
| -- | -- | -- |
| `map.md` | entry points, the call tree being walked, walk order, marks | you |
| `harness.md` | how this project yields values: run commands, seams, fixtures, gotchas | you |
| `progress.json` | per function: status, evidence, body hash | `mark` |
| `scope.json` | globs kept out of or brought into coverage | `coverage --exclude/--include` |
| `current.json` | snapshot, worktree path, scenario and node in progress | `worktree`, you |
| `traces/<scenario>.json` | observed values per probe | `collect` |
| `cassettes/` | recorded responses of paid calls | you |

A function's status is `known` (passed a lock-in check), `edge` (traced, check thin or missed), `unknown`, or `skipped` (out of the goal by the user's word: dead code, a helper they waived). Marks follow the function's body, not the commit: a mark goes **stale** once the body hash changes, and only then does it lapse.

Name functions as `coverage --list` prints them, `<path from repo root>::<item path>`, e.g. `backend/src/service/list/view.rs::view` or `backend/src/web/extract.rs::Tenant::require`.

## 1. Resume

Run `scripts/understand.py status` and `coverage`; read `map.md`, `harness.md` and `current.json` when present. Tell the user in a few lines: coverage so far, where they stopped, which functions went stale (offer to walk their diff first), and the next node. Complete when the user has agreed on the node to walk.

## 2. Map

`coverage` is the inventory: every function in the repository, grouped by directory, with what is known and what is left. Tests, CI, build tooling and generated code are out of scope unless the user asks for them (`--tests` once, `--include <glob>` to keep); a whole area the user waives (vendored UI, scripts) goes out with `--exclude <glob>`.

Walk the code the way a contributor reads an unfamiliar repository: start at the top, where execution starts, and follow only what that function calls.

- **Entry points** first, on a first run: `main`, routes, jobs, CLI commands, public API. List them all in `map.md`; the walk starts at the one the user names, else the one at the heart of what the product does.
- **The tree.** From the entry point, follow calls in execution order down to in-repo leaves. Tag each node with what running it needs: `[pure]`, `[db]`, `[net]`, `[paid: <provider>]`.
- **Order.** Depth first in execution order. The next node is the current node's first callee not yet known. When a subtree is known, move to the parent's next callee. Step over `[x]` nodes; their call annotations show what they returned.
- **When a tree is done**, `coverage` shows what is left. The next entry point is the one whose tree reaches the most of it. A function no entry point reaches gets its callers looked up (the language server's call hierarchy, or a search). Callers only in tests mean a test helper. No callers at all means dead code. Tell the user, and `mark` it `skipped` on their word.

```markdown
## GET /api/tenants/{slug}/list
- [ ] backend/src/service/list/handlers.rs::get :12 [db]
  - [ ] backend/src/service/list/view.rs::view :210 [db]
    - [~] backend/src/service/list/view.rs::private_notes :13 [db]
```

Marks: `[x]` known · `[~]` edge · `[ ]` unknown · `[!]` stale · `[-]` skipped. Complete when every in-repo node under the entry point carries a path, line and tag, and the user has seen the tree.

A node the user says they already know gets the lock-in check (step 6) before any trace; a pass marks it known untraced.

## 3. Scenario

Pick one concrete run that executes the node, cheapest first: an existing test covering the path, then seed or fixture data, then a cassette, then a live call. Prefer a scenario with a natural counterpart (a second user, another input), since the lock-in check runs it. Record the run command in `harness.md`, with anything that took digging (env, filters, build flags, tool trust).

Before running anything on a path with a `[paid]` or `[net]` node, read [`references/cassettes.md`](references/cassettes.md). Complete when the command runs locally and every paid call on the path is covered by a cassette, a fake, or the user's yes to a stated cost.

## 4. Trace

`scripts/understand.py worktree` snapshots the user's working tree, uncommitted changes included, into a disposable git worktree; every probe goes there, and the user's history stays untouched. It also turns on inlay hints in the worktree's Zed settings, so each binding and chain step shows its type.

Draw values and calls; leave types to the language server. The user reads a type's definition by hover, go-to-definition or fuzzy find, so draw no definitions. Write a probe spec in `specs/<scenario>.json`, its kinds listed above `cmd_probe` in the script:

- **value** at every state change: each binding, reassignment, branch condition, loop item and the return value. Print the whole value, so its type's field names show; label it `name: Type`. A type that cannot print itself gets a `patch` (e.g. `#[derive(Debug)]`) for the probe run only.
- **call** for every call into the repository's own code, effects or not: what went in → what came out, on each hit, with `callee` naming the function as the map does. The drawing points at the callee's line and its mark, so each call is a door the user can step through next. Name the arguments in the label (`assess(account, check, inherited)`) and project ones that would drown the box (`ctx` → its few fields that matter). A pure call is evaluated again by the probe (`args` + `call`). A call with effects (the database, the network, a moved value) is never run twice: its `args` print above it and its `result`, the binding it fills, below line `after`.
- **stages** for every chain (iterator, `Option`, builder): each adapter's output, element by element, then the result. Where an element is an id, show whose it is beside it.

Project a value only when its whole would drown the box (`len()` for a collection the node only counts), and name a projected tuple's fields in its label. Run the scenario command inside the worktree with stderr in a log, then `collect <log> --command "<command>"`; when one run covers several requests or calls, `--segment <label>:<n>` keeps the nth, each its own scenario. A probe that breaks the build (a moved value, a tail expression) moves with `before` or `after`. Relabelling needs no rerun: `probe` the edited spec, then `collect` the same log again.

Every ● comes from the run. A value the run cannot show gets an `inferred` entry with its `why`, drawn ○.

Complete when every statement of the node has a ● value, a ⊘ not reached, or a ○ with its reason; every in-repo call in it has its in → out; and every chain has its stages.

## 5. Show

`annotate <scenario>` rebuilds the probed files from the snapshot and draws the values. A short value is an inline `⟦● name = value⟧`. A long or repeated one is a box under its statement, and a call's box ends in `▸ file:line [mark]` for its callee. UUIDs draw as `01a1…6571` (`--full-ids` for whole ones).

Ask once where the user reads, and record it in `harness.md`. With `--checkout`, the drawing goes into their own checkout as well, for each file whose code still equals the snapshot's. `restore --checkout` takes it out again, Zed settings included. Otherwise they open the worktree (`open -a Zed <worktree>`). Name the file and line to start at, and give the legend the first time:

`●` observed on this run · `○` inferred · `⊘` not reached · `×N` one row per hit · `in ┊ out ┊` a call's arguments and result · `▸` where the callee lives, with its mark · `󰧔` replayed from a cassette · `󰇁` recorded from a live paid call

Then stop and let the user read. Answer questions with values: from the trace, or from a new probe when the trace lacks it.

## 6. Lock-in check

When the user has read the node, ask one counterfactual question through the harness's question tool (AskUserQuestion in Claude Code), with graded options and "I don't know": _if <input> differed, what would `<binding>` hold at line N?_ Choose one you can run, then trace the counterpart and draw its values beside the first scenario's so the answer shows in the code (`annotate <first> <counterpart>`).

| answer | status |
| -- | -- |
| right, sound reason | `known` |
| right but thin, or a near miss | `edge` |
| wrong, or I don't know | `unknown`; the callee or input whose value surprised them becomes the next node |

Record it with `scripts/understand.py mark <symbol> --status <status> --evidence "<question> → <answer>"`, update the node's mark in `map.md` and the node in `current.json`. Complete when all three agree; then report coverage in one line and go to the next node in walk order.

When the user is done, `clean` removes the worktree and keeps every other piece of state.
