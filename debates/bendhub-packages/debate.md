---
goal: Decide whether Bend or BendHub packages can make agent-written codelarpers tests and submission checks stricter
date: 2026-11-08
rounds: 2 of 2
status: approved        # by the user, 2026-11-08
roadmap: none
supersedes: none
decision: none
---

# Debate: Bend and BendHub for stricter codelarpers tests

Short debate: one orchestrator wrote both sides and ruled; no subagents, no proofs. The ledger is `ledger.json`; raw measurements are under `evidence/`.

## Settled structure

Use neither Bend nor any BendHub package in codelarpers. Borrow Bend's idea of **laws** instead, inside the Python helper that already runs stage tests:

1. Each stage's tests state its laws: general properties of the program's output, such as `lines(a + b) == lines(a) + lines(b)` or "a decoded encode returns the input" (P5).
2. `codelarpers_test` gains `law(name, generate, check)`. It runs the learner's program on seeded generated inputs, checks the property, shrinks a failure to the smallest counterexample, and prints the law's name with that input (P5, P3).
3. Fixed edge cases stay as `tests.json` cases or `expect_*` calls. Each near-miss must break a law or a case; `dev validate` already enforces that since f29fa4a (J10).

## Budget

- device: nothing new on the learner's machine; stdlib Python only, which the helper already needs (O1, O10 against the Bend routes).
- time: about half a day for the helper, one example law in the wc course, and doc changes (P5 estimate).
- tokens: no Bend guide to load (about 7k tokens saved per authoring session, J9); authors write a few properties per stage instead of only fixed cases.
- maintenance: no new dependency; avoids a two-month-old ecosystem dominated by one author's package family (J1, J4, O2).

## Rejected

- **bend-kit-property for stage tests (P1):** puts the Bend toolchain on every learner's machine for a package with 0 dependents and no laws of its own (O1, O2, J5); the same shrinking fits in the Python helper (O4, P3).
- **Bend starter kit, hub packages as libraries and examples (P2, O6):** no Bend courses wanted (Q1). As examples, 66% of packages name no source repository and 23% run unchecked native code (O3).
- **Proven Bend model as the oracle (P4):** a proof binds the Bend model, not the submission, which the tester only sees as a process (O7, J11). Oracles already exist independently of the author: the studied codebase, the real tool, and the proven-green solution. A model's laws come from the same agent's reading of the spec, so a misread spec gets proven instead of caught (O8). It also needs Bend at test time or freezes the seeds (O10), and costs about 7k guide tokens per session before any proof (O9).

## Proofs

- None. No open claim was high, cheap to test and able to change the result.

## Prior art

- BendHub, measured 2026-11-08: 1,107 packages, 61 authors, oldest from 2026-09-10 (J1). 12% ship LAWS.bend (J2), 23% ship unchecked .c or .js (J3), and 310 of the 322 importers of the most-imported package belong to its own family (J4).
- Hub laws, all 109 distinct LAWS.bend files: 57% of 3,552 laws are general (`for x: T`, mostly round trips and invariants), 42% are fixed-input equalities proven by computation (J8). Agents do write real general laws in Bend. That is the part worth copying, as sampled properties.

## Open risks

- Sampled laws can miss a bug that only rare inputs expose, where a proof would rule it out (O11): accepted, because near-misses must fail every seed (J10) and authors keep fixed edge cases next to the laws.

## Answers from the user

- Bend courses? No Bend courses. The question is whether Bend can make agent-written test cases and submission checks stricter or better (Q1).

## Overruled

- none

## Cost of this debate

- 2 rounds, about 115k tokens
