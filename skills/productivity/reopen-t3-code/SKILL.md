---
name: reopen-t3-code
description: Restart T3 Code on macOS and relaunch it minimized.
disable-model-invocation: true
---

# Reopen T3 Code

1. Tell the user that T3 Code will quit in 10 seconds and reopen hidden.
2. Run `scripts/reopen-t3-code.sh` as the final tool action. The step is complete when the command prints the relaunch log path.
3. Return a brief final response immediately. The detached macOS job completes the restart after this turn ends.

Use `scripts/reopen-t3-code.sh --check` for a non-mutating installation check. If the restart fails, inspect the relaunch log printed by the command.
