# Diagrams

Read this when relationships, space, or geometry carry the explanation.

## Authoring order

1. If `diagram-design` is installed, use it to choose the diagram type, simplify the system, and plan layout. The workspace design system satisfies its style-guide question. Treat its HTML or SVG as an authoring draft, then move semantic nodes, connectors, labels, grouping, and accessibility into lesson-local React.
2. Use React Flow for architecture, data flow, ERDs, call graphs, and state machines. Prefer it when the learner pans, zooms, selects, moves, connects, or gets graded on graph elements.
3. Use custom SVG and Motion for plots, geometry, arrays, memory, and tightly controlled visual sequences.
4. Use Mermaid only as a last resort for a static explanatory diagram. Render it through `MermaidDiagram`; short source may stay beside the visual and long source may live in a lesson-local `.mmd` file imported with `?raw`.

Do not install optional authoring skills. If `diagram-design` is absent, proceed with React Flow or custom SVG. Mermaid is already in the runtime, but it never backs graded graph manipulation.

## Teaching shape

Keep each step near nine visible nodes. Reveal another region later or split the lesson when the model exceeds that working set. Use stable authored coordinates. Add automatic layout only after a real lesson proves fixed coordinates inadequate.

React Flow diagrams fit the initial view and expose Reset view. Enable pan, zoom, drag, connect, or minimap only when the lesson needs them. Show a minimap only when the graph exceeds the viewport. Provide click or select controls for drag and connection actions.

Grade semantic node IDs, edge direction, labels, and grouping. Ignore coordinates unless spatial placement is the concept. Test semantic relationships separately from visual layout.

## Fidelity and verification

In the lesson `VERIFICATION.md`, record relationships preserved from the source, details merged or omitted, and interaction or style adaptations. Use ego-lite on the exact route to inspect labels, connectors, overlaps, clipping, narrow layout, resets, and every graph interaction.
