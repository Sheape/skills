# Algorithm and data-structure lesson

Use for algorithms, data structures, complexity, invariants, and tradeoffs.

## Ground truth

State the input contract, invariant, termination condition, output, and complexity assumptions. Verify authored states against a small deterministic implementation when practical. The lesson may still show a simplified semantic trace; label it accurately.

## Lesson shape

Start with a concrete input and ask what changes next. Step through only meaningful operations, keeping stable IDs for values/nodes and making the active comparison, mutation, pointer, frontier, or subproblem visible. Show the invariant beside the state it explains.

Use representative cases: normal, larger/repeated data, empty input when legal, and one structural edge such as duplicates, skew, cycles, or worst-case ordering. Do not enumerate obscure cases. End with a new input that forces the learner to use the invariant rather than replay the animation.

Use SVG/CSS and authored state first. Add executable code only when it increases confidence or allows useful parameter exploration without turning the lesson into a sandbox.
