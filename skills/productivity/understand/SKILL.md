---
name: understand
description: Walk a codebase like a debugger, drawing values from a real run into an annotated worktree and tracking what the user has understood across sessions.
disable-model-invocation: true
---

# Understand

The user learns code by watching its data, the way a debugger shows it: each line beside the value it held on a real run. For them the observed values _are_ the explanation. You carry the logistics: choose the path, produce the values, draw them into the code, and check that each node locked in. One teacher, one mind, one node per turn.

## State

Everything lives outside the repository, in the directory `scripts/understand.py dir` prints (`$XDG_STATE_HOME/understand/<host>/<owner>/<repo>`):

| path | holds | written by |
| -- | -- | -- |
| `map.md` | the map: entry points, call trees, walk order, marks | you |
| `harness.md` | how this project yields values: run commands, seams, fixtures, gotchas | you |
| `progress.json` | per function: status, evidence, body hash | `mark` |
| `current.json` | snapshot, worktree path, scenario and node in progress | `worktree`, you |
| `traces/<scenario>.json` | observed values per probe | `collect` |
| `cassettes/` | recorded responses of paid calls | you |

A function's status is `known` (passed a lock-in check), `edge` (traced, check thin or missed) or `unknown`. Marks follow the function's body, not the commit: `status` reports a function **stale** once its body hash changes, and only then does its mark lapse.

Name functions `<path from repo root>::<item path>`, e.g. `backend/src/service/list/view.rs::view`.

## 1. Resume

Run `scripts/understand.py status`; read `map.md`, `harness.md` and `current.json` when present. Tell the user in a few lines where they stopped, which functions went stale (offer to walk their diff first), and the next node. Complete when the user has agreed on the node to walk.

## 2. Map

On a first run, or when the user names an area the map lacks. List the entry points (routes, CLI commands, jobs, public API). For the chosen one, follow calls in execution order down to in-repo leaves, tagging each node with what running it needs: `[pure]`, `[db]`, `[net]`, `[paid: <provider>]`. Write it into `map.md`:

```markdown
## GET /api/tenants/{slug}/list
- [ ] backend/src/service/list/handlers.rs::get :12 [db]
  - [ ] backend/src/service/list/view.rs::view :210 [db]
    - [~] backend/src/service/list/view.rs::private_notes :13 [db]
```

Marks: `[x]` known, `[~]` edge, `[ ]` unknown, `[!]` stale. The walk follows execution order and steps over `[x]` nodes, showing only what they return. Complete when every in-repo node under the entry point carries a path, line and tag, and the user has seen the tree.

A node the user says they already know gets the lock-in check (step 6) before any trace; a pass marks it known untraced.

## 3. Scenario

Pick one concrete run that executes the node, cheapest first: an existing test covering the path, then seed or fixture data, then a cassette, then a live call. Prefer a scenario with a natural counterpart (a second user, another input), since the lock-in check runs it. Record the run command in `harness.md`, with anything that took digging (env, filters, build flags, tool trust).

Before running anything on a path with a `[paid]` or `[net]` node, read [`references/cassettes.md`](references/cassettes.md). Complete when the command runs locally and every paid call on the path is covered by a cassette, a fake, or the user's yes to a stated cost.

## 4. Trace

`scripts/understand.py worktree` snapshots the user's working tree, uncommitted changes included, into a disposable git worktree; every probe and annotation goes there, and the user's checkout and history stay untouched. It also sets the worktree's Zed settings so the language server answers types: inlay hints show each binding's and chain step's type, and hovering a type shows its whole definition (rust-analyzer otherwise stops at 5 fields).

The node must read without go-to-definition: every value, type and transformation the user meets in it is answered in place, by a hover or by the annotations. Write a probe spec in `specs/<scenario>.json`, its kinds listed above `cmd_probe` in the script:

- **value** at every state change: each binding, reassignment, branch condition, loop item and the return value. Print the whole value, so its type's field names show; label it `name: Type`. A type that cannot print itself gets a `patch` (e.g. `#[derive(Debug)]`) for the probe run only.
- **card** above a binding whose type, or a collection's element type, is written nowhere in the node at or above it. Its type then lives only in an inlay hint or a comment, and neither can be hovered. Also a card for a language with no language server, or a shape that only exists at runtime (a JSON blob, a dict). A type written in the code above gets none: hovering it shows the whole definition.
- **stages** for every chain (iterator, `Option`, builder): each adapter's output, element by element, then the result. Where an element is an id, show whose it is beside it.
- **call** for every pure in-repo call whose result feeds the node: its arguments → result on each hit. The callee stays a black box until the user steps into it; a call with effects is shown through the binding that receives it.

Project a value only when its whole would drown the box (`len()` for a collection the node only counts), and name a projected tuple's fields in its label. Run the scenario command inside the worktree with stderr in a log, then `collect <log> --command "<command>"`; when one run covers several requests or calls, `--segment <label>:<n>` keeps the nth, each its own scenario. A probe that breaks the build (a moved value, a tail expression) moves with `before` or `after`. Relabelling needs no rerun: `probe` the edited spec, then `collect` the same log again.

Every ● comes from the run. A value the run cannot show gets an `inferred` entry with its `why`, drawn ○.

Complete when every statement of the node has a ● value, a ⊘ not reached, or a ○ with its reason, and every chain and pure call in it has its stages or arguments → result.

## 5. Show

`annotate <scenario>` rebuilds the probed files from the snapshot and draws the values: a short value as an inline `⟦● name = value⟧`, a long or repeated one as a box under its statement, any type card as a `◆` box above the function. UUIDs draw as `01a1…6571` (`--full-ids` for whole ones). Open the worktree in Zed (`open -a Zed <worktree>`; if it was already open, the user runs `editor: restart language server` so the hover settings apply), name the file and line to start at, and give the legend the first time:

`◆` a type's definition · `●` observed on this run · `○` inferred · `⊘` not reached · `×N` one row per hit · `󰧔` replayed from a cassette · `󰇁` recorded from a live paid call

Then stop and let the user read. Answer questions with values: from the trace, or from a new probe when the trace lacks it.

## 6. Lock-in check

When the user has read the node, ask one counterfactual question through the harness's question tool (AskUserQuestion in Claude Code), with graded options and "I don't know": _if <input> differed, what would `<binding>` hold at line N?_ Choose one you can run, then trace the counterpart and draw its values beside the first scenario's so the answer shows in the code (`annotate <first> <counterpart>`).

| answer | status |
| -- | -- |
| right, sound reason | `known` |
| right but thin, or a near miss | `edge` |
| wrong, or I don't know | `unknown`; the callee or input whose value surprised them becomes the next node |

Record it with `scripts/understand.py mark <symbol> <file> <line> --status <status> --evidence "<question> → <answer>"`, update the node's mark in `map.md` and the node in `current.json`. Complete when all three agree; then the next node in walk order.

When the user is done, `clean` removes the worktree and keeps every other piece of state.
