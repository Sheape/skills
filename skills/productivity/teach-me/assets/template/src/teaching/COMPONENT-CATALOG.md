# Shared component catalog

Use `/__catalog` to inspect and test every shared state. It is not a learner lesson.

- Shell: `AppLayout`, `TopicLayout`, `TopicSidebar`, `LessonPage`, `LessonNavigation`, completion, lesson reset, and theme.
- Scenes: `SteppedScene` and `StepControls`.
- Grading: `ChoiceActivity`, `OrderActivity`, `MatchActivity`, `SliderActivity`, `TraceActivity`, `DiagramActivity`, and the shared activity controller.
- Code: `CodeBlock`, `CodeWalkthrough`, and `CodeScratchpad`.
- Diagrams: `DiagramCanvas` for React Flow and `MermaidDiagram` as a static last resort.
- Evidence: `Citation`, `SourcePanel`, and `FidelityBadge`.
- Annotations: `AnnotationTarget`, hover preview, and pinned inspector.

New lessons may add specialized components. Keep plots, memory views, timelines, diff views, and unusual diagrams lesson-local until repeated lesson behavior justifies promotion. A promoted component gets a deterministic catalog state and tests.
