---
name: codelarpers
description: Turn a codebase or topic into a local CodeCrafters-style challenge that the user codes their way through, stage by stage, against tests.
disable-model-invocation: true
---

# codelarpers

The user learns a codebase or topic by rebuilding it. A **challenge** is a roadmap of small **stages**; a stage passes only when the user's own program produces the expected output under test. Reading never passes a stage. Failing, reading the test log and fixing does. You are the course author: research, roadmap, instructions, tests, hints, references, proof, publication.

The app is finished. The `codelarpers` binary serves every challenge from every project at http://localhost:7357 (`CODELARPERS_PORT` changes the port) and keeps all data in `~/.local/share/codelarpers`. Your output is course files. Change the app itself only when the user asks for that, and then read [APP.md](references/APP.md).

## 1. Start the app

Run `scripts/install.sh` from this skill. It installs or updates `codelarpers` (CI artifact, else a source build) and starts the server. Done when `codelarpers serve --status` prints `Running`.

## 2. Find this project's challenge

```bash
codelarpers dev find --project "$PWD"
```

Each project has one challenge with its own score. If one exists, you are **extending** it: read `codelarpers dev progress <slug>` (attempts, hints taken, ratings, intro answers) and pitch the new stages at that evidence. Otherwise you are creating one:

- **kind** `codebase` when the user wants to understand the repository they are in; `tutorial` when they name a technology or concept (React, TCP, regex engines) and this directory is only where they asked.
- **language** is the one the learner will write. A codebase challenge defaults to the codebase's own language. When the request leaves it open, ask.

## 3. Research until you can predict behaviour

Codebase: read the real code along its main data flow and pin the commit (`git rev-parse HEAD`). Tutorial: primary sources (specs, official docs) plus permissively licensed professional implementations to quote later. Done when, for every component you plan to teach, you can state its input, its output, and the rule that maps one to the other.

## 4. Draft the roadmap

Read [CURRICULUM.md](references/CURRICULUM.md), then write the stage list: base stages in dependency order, deep dives as extensions. Show the roadmap to the user in one short message and carry on; they redirect if they want.

## 5. Author the challenge

Read [COURSE-FORMAT.md](references/COURSE-FORMAT.md) and [TESTS.md](references/TESTS.md), then scaffold:

```bash
codelarpers dev new-course <slug> --name "Build your own <X>" --short "<one line>" \
  --kind codebase|tutorial --language <lang> --project "$PWD" \
  [--repository <url> --commit <sha> --subject "<what is studied>"]
codelarpers dev new-stage <slug> --name "<capability>" --difficulty easy [--extension <ext>]
```

Give the challenge its logo: the studied project's own mark for `codebase` (`codelarpers dev find-icon --project "$PWD"` ranks candidates), the technology's official logo for `tutorial`, installed with `codelarpers dev set-icon`. With no fitting logo, leave it: the app draws letters. Fill every scaffolded file; leftover placeholders fail lint. Each stage gets instructions that teach the concept and pin the exact input and output, tests that stay red until the capability exists, a hint ladder, resources, code examples, and at least one near-miss: the solution with the stage's most likely bug, which its tests must catch. Code examples are always real code someone shipped: the studied codebase's own code for `codebase`, professional open-source code for `tutorial`. `solution/<lang>/` is one cumulative reference implementation; the starter holds only build plumbing and an entry point.

## 6. Prove it

```bash
codelarpers dev validate <slug> --repeat 3
```

Done when it prints `Valid.`: lint clean, the solution **green** on every stage across three seeds, every near-miss **red** on its own stage across those seeds and green before it, the starter **red** on every stage. When a near-miss passes, add the test case that catches it. Then `codelarpers dev publish <slug>` creates the learner's repository.

## 7. Check it in the browser

Open `http://localhost:7357/courses/<slug>/overview` in the ego-lite browser and walk the catalog card (logo in dark and light theme), the overview, the first stage page and one code-examples gate. Fix anything that renders wrong in the course files.

## 8. Hand it over

Give the user the overview URL and the path through it: Introduction, then Local Setup (`git clone`, `codelarpers ping`), then `codelarpers task`, `codelarpers test`, `codelarpers submit`. When they come back stuck, point them at the failing log line, the next hint, or the concept; the stage code stays theirs to write.
