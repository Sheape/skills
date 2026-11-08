# Tests

The tests are the teacher: the learner meets the subject through their failures. A stage's tests are done when a correct implementation passes them and every plausible wrong one fails them with a message that says what was expected and what the program did.

## How a run works

`codelarpers test` (or `submit`) finds `codelarpers.yml`, runs `.codelarpers/compile.sh` once (`[compile]` lines), then runs each stage:

```text
[tester::#BT3] Running tests for Stage #BT3 (Count bytes)
[tester::#BT3] $ ./your_program.sh -c input.txt
[your_program] 6 input.txt
[tester::#BT3] Expected "7 input.txt\n" as stdout, got: "6 input.txt\n"
[tester::#BT3] Test failed
```

`test` runs the current stage; `submit` runs the current stage, then every earlier one as a regression check, and completes the stage when all pass. The first failure stops the run. A stage runs `tests.json` first, then its script, if it has both.

## The bar: red, then green

`codelarpers dev validate` proves each stage fails against the starter (red), fails against each of its [near-misses](COURSE-FORMAT.md#near-misses) (red), and passes against `solution/` (green). A near-miss that passes means the tests miss a plausible bug: add the case that catches it. Never weaken the near-miss to make validation pass. Validation is the floor. A stage also needs:

- **Edge cases** from its Notes (empty input, missing trailing newline, multibyte text, the boundary value).
- **Randomized inputs** whenever a fixed answer could be hard-coded. Use a script test with `random`; `validate --repeat 3` runs several seeds.
- **Real behaviour as the oracle.** For codebase challenges, take expected outputs from the studied code itself: run it while authoring and freeze the results into fixtures. Run a live oracle only when the tool is certain to be installed (for example `git` in a git challenge).

## tests.json

```json
{
  "cases": [
    {
      "name": "last line without a newline",
      "files": { "input.txt": "apple\nbanana" },
      "args": ["-l", "input.txt"],
      "stdin": null,
      "timeout": 10000,
      "expect": {
        "exitCode": 0,
        "stdout": "1 input.txt\n",
        "stdoutLines": ["1 input.txt"],
        "stdoutContains": ["input.txt"],
        "stdoutMatches": "^\\d+ ",
        "stderr": "",
        "stderrContains": ["warning"],
        "files": { "out.txt": "expected contents" }
      }
    }
  ]
}
```

Each case runs in a fresh temporary directory holding `files`. Every `expect` key is optional; use the ones that pin the contract. Cases are text: `files`, `stdin` and the expected strings are UTF-8, program output is decoded as UTF-8 and `\r\n` becomes `\n`. Binary input or output needs a script test with `run(..., binary=True)`. `stdout` is an exact match, trailing newline included. `stdoutLines` gives clearer line-by-line errors. `files` checks files the program wrote into its working directory. Cases with a `name` print `Test case 2/3: <name>`.

## Script tests

Use a script for randomized inputs, binary data, multi-step state, servers, or checks that need computation. Name it `stages/<id>/test.py` (run with `python3`), `test.sh` (`sh`), `test.mjs`/`test.js` (`node`), or an executable `test`. When a stage uses only a script, delete the `tests.json` that `dev new-stage` scaffolded.

The harness runs it from a scratch directory with:

| variable | value |
| -- | -- |
| `CODELARPERS_PROGRAM` | the learner's `.codelarpers/run.sh` |
| `CODELARPERS_REPO` | the learner's repository root |
| `CODELARPERS_STAGE`, `CODELARPERS_STAGE_DIR`, `CODELARPERS_COURSE_DIR` | stage id and folders (read fixtures from `CODELARPERS_STAGE_DIR`) |
| `CODELARPERS_SEED` | seed for randomness; set it yourself to reproduce a run |
| `CODELARPERS_TMP` | the scratch directory, removed afterwards |
| `CODELARPERS_DEBUG` | `1` when the learner set `debug: true` |

The script talks to the harness through stdout, one line at a time:

| line | shown as |
| -- | -- |
| `text` | `[tester::#ID] text` |
| `$ cmd` | `[tester::#ID] $ cmd`, command colour |
| `\| text` | `[your_program] text` |
| `!ok text` | green |
| `!fail text` | red, and the failure reason |
| `!debug text` | only in debug mode |

Exit `0` passes, `1` fails (the learner's code is wrong), anything else is reported as a tester bug, with the script's stderr. Any language works; the Python helper below speaks the protocol for you.

## Python helper: `codelarpers_test`

```python
from codelarpers_test import *

for case in range(3):
    words = random.words(random.int(2, 6))
    d = tmpdir({"input.txt": " ".join(words) + "\n"})
    r = run(["-w", "input.txt"], cwd=d)
    expect_exit_code(r, 0)
    expect_stdout(r, f"{len(words)} input.txt\n")
```

| call | does |
| -- | -- |
| `tmpdir(files=None)` | fresh directory, optionally filled with `{path: str or bytes}` |
| `run(args, cwd=None, stdin=None, env=None, timeout=10, quiet=False, binary=False)` | runs the program to completion, streams its output, returns `Result(stdout, stderr, exit_code, cwd)`; fails on timeout. Output is `str` (UTF-8, invalid bytes replaced, `\r\n` to `\n`) unless `binary=True` returns raw `bytes`. `stdin` takes `str` or `bytes`; `quiet=True` hides the `$` line |
| `spawn(args, cwd=None, env=None)` | long-running program: `.wait_for_output(pattern, timeout)`, `.write(data)`, `.output()`, `.kill()` |
| `wait_for_port(port)`, `connect(port)` | TCP: `conn.send(data)`, `conn.read(until=b"\r\n" or nbytes=N or regex)`, `conn.close()` |
| `oracle(cmd, cwd=None, stdin=None)` | runs a reference command (not logged as the program) |
| `expect_stdout_bytes(r, expected)` | exact byte comparison for `binary=True` results |
| `expect_exit_code`, `expect_stdout`, `expect_stdout_lines`, `expect_stdout_contains`, `expect_stdout_matches`, `expect_stderr_contains`, `expect_file(path, content=None)`, `expect_equal(actual, expected, label)` | fail with an expected-versus-got message |
| `log(text)`, `ok(text)`, `debug(text)`, `fail(message)` | protocol output; `fail` exits 1 |
| `random` | a seeded `random.Random`: `.int(a, b)` (both ends included), `.word()`, `.words(n)`, `.string(n, alphabet="a-z")`, `.pick(list)`, plus every stdlib method |
| `PROGRAM`, `STAGE_DIR`, `COURSE_DIR`, `REPO`, `SEED` | the program's run.sh, paths and seed |

A server stage, for example:

```python
from codelarpers_test import *

port = random.int(20000, 40000)
server = spawn(["--port", str(port)])
conn = connect(port)
conn.send(b"*1\r\n$4\r\nPING\r\n")
expect_equal(conn.read(until=b"\r\n"), b"+PONG\r\n", "response")
server.kill()
```

## Authoring loop

- `codelarpers dev try <slug> <dir> --stage <id>` runs one stage against any directory (debug output on), for example a copy of the solution while you write it.
- `codelarpers dev validate <slug> --stage <id>` validates up to that stage; `--keep` keeps the solution and near-miss checkouts for inspection. Run `dev try` on a kept near-miss to see the cases it passes.
- Reproduce a randomized failure with its seed (shown as `seed N` in debug output): `CODELARPERS_SEED=N codelarpers dev try <slug> <dir> --stage <id>`. The variable works for `validate` and the learner's `codelarpers test` too.
- Timeouts: 10 seconds per program run by default (`timeout` in milliseconds for tests.json, seconds for the helper), 180 seconds per script.
