# Curriculum

How to turn a subject into a roadmap the learner can only finish by building it.

## The stage

A stage is one capability, observable at the program boundary: arguments, stdin, files or a socket go in; stdout, an exit code, files or a response come out. It takes 15 to 60 minutes at the learner's stated proficiency and builds on the code of the stage before; nothing gets thrown away.

- **Name** it after the capability: "Read a blob object", "Tokenize string literals", "Respond to PING".
- **Difficulty**: `very_easy` is wiring (the first stage), `easy` is one rule, `medium` is a format or algorithm with edge cases, `hard` spans several pieces or a protocol. Ramp gradually; about one `hard` per five stages.
- **Size**: when a stage needs two new ideas, split it into two stages.

## Codebase challenges

The goal is a learner who can explain and modify the studied code because they rebuilt its core.

1. **Find the spine.** Trace the main data flow end to end (for rustc: lexer, parser, AST, name resolution, type checking, MIR, codegen). Name each component's contract: what goes in, what comes out.
2. **Pick a slice.** Start at the front door, where input enters, and take the shortest chain of components a learner can rebuild in a small program. A large codebase gets a first challenge of 8 to 15 stages; deeper layers become extensions or later rounds of `/codelarpers` in the same project.
3. **One contract per stage.** Each stage reimplements one component's observable behaviour in miniature: "print the token kinds for this file" in the same vocabulary the real lexer uses.
4. **The real code is the oracle.** Take expected outputs from the studied code at the pinned commit (run it, or derive them from its tests), and freeze them into fixtures. Faithful beats invented: the learner should leave knowing how *this* codebase behaves.
5. **The real code is the reveal.** Notes and resources point at the real file at the pinned commit; code examples quote it verbatim. After the struggle, the learner sees how the maintainers solved what they just solved.

## Tutorial challenges

Build a minimal version of the technology from its specification: Build your own Redis, regex engine, React reconciler. The stage rules are the same; expected outputs come from the spec or the reference implementation; code examples quote respected open-source implementations under permissive licences, cited by permalink. For libraries and frameworks, the program is still a black box behind `run.sh`, for example a CLI that renders a component tree to an HTML string, so tests stay language-agnostic.

## Base stages and extensions

Base stages are the shortest path to a working core. Extensions are optional deep dives of three to ten stages each; the learner can switch one off in the sidebar, and its stages then stop counting toward completion. Put everything the core doesn't need into an extension.

## Instructions that teach without solving

- State the capability and its exact contract, then explain the concept (format, rule, algorithm idea) with a worked example whose values differ from the test inputs.
- Give the learner everything needed to derive every check; give them none of the code.
- Hints climb a ladder: a question that points at the concept, then the specific rule, then the gotcha. Struggle is the method; a hint should cost a little and unblock a lot.

## Calibrating with learner evidence

When extending, read `codelarpers dev progress <slug>`:

- Many attempts and hints on a stage: make the next stages smaller, or insert a bridging stage before the hard one with `--after`.
- Repeated `too_easy` ratings: merge steps and raise difficulty.
- Repeated `too_hard`, or examples peeked early: split the stage and strengthen the concept section.
- Intro answers (proficiency, cadence) set the stage size and how much each concept section spells out.
