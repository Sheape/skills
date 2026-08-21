# Algorithm and data-structure lesson

Use for algorithms, data structures, complexity, invariants, and tradeoffs.

## Ground truth

State the input contract, invariant, termination condition, output, and complexity assumptions. Verify authored states against a small deterministic implementation when practical. The lesson may still show a simplified semantic trace; label it accurately.

## Lesson shape

Start with a concrete input and check what changes next. Step through only meaningful operations, keeping stable IDs for values or nodes and making the active comparison, mutation, pointer, frontier, or subproblem visible. Show the invariant beside the state it explains.

Use representative cases: normal, larger/repeated data, empty input when legal, and one structural edge such as duplicates, skew, cycles, or worst-case ordering. Do not enumerate obscure cases. End with a new input that forces the learner to use the invariant rather than replay the animation.

Use custom SVG and Motion for arrays, memory, and controlled animation. Use React Flow for graph-shaped structures that the learner manipulates. Verify with executable code when it increases confidence, but keep execution outside the lesson runtime.
