# Code walkthroughs

Read this when a lesson includes source code, a diff, an authored trace, or an editable scratchpad.

## Read-only source

Use `CodeBlock` and Shiki. The shared highlighter lazily caches tokenized output by source, language, and theme. Add a Shiki language to the shared list only when a lesson needs it.

Show the current line with a full-width mint rectangle in light mode or dark emerald in dark mode. Include the gutter and blank part of the row, a stronger gutter bar, and an `ACTIVE` badge. Text color alone is insufficient.

## Authored debugger

Use `CodeWalkthrough`. It is a debugger-shaped player over authored semantic frames, not program execution. Each frame records:

- stable ID, active line, and `before` or `after` phase;
- event type: `line`, `call`, `enter`, `return`, or `output`;
- call depth, heading, explanation, and fidelity;
- variables, conceptual call stack, and literal console output when relevant.

Author representative cases separately. Use normal input by default, then many-data or high-volume, empty or no-input when valid, and one meaningful edge case. Stop before niche cases stop changing practice.

`Step in` advances into the next authored call. `Step over` skips frames deeper than the current call. `Step out` jumps to the next shallower frame. `Restart` returns to the first frame of the selected case.

Animate a call by shifting the caller back and bringing the callee forward with stable layout IDs. Reverse that relationship on return and move the returned value into the caller. Show old variable values briefly before new values settle. Use green for changed, blue for created, red for removed, and keep literal console lines in a separate panel.

Label conceptual and simplified state beside the panel it qualifies. Never present a teaching call stack or ownership picture as a literal runtime internal unless independently verified.

## Scratchpad

Use `CodeScratchpad` and CodeMirror 6 for editable source. It is a persisted local draft with syntax highlighting, Copy code, optional Copy run command, and Reset code. It never executes or receives a grade.

Place output beside the editor on wide screens and below it on narrow screens. Use `Expected output` only after an exact verified run. Hardware, payment, authentication, or unavailable environments use `Illustrative output` with `simplified` or `conceptual` fidelity. Add CodeMirror language packages only when a real lesson needs them.
