# Shared component catalog

- `AppLayout`, `TopicLayout`, `TopicSidebar`: course and topic navigation.
- `LessonPage`, `LessonNavigation`: lesson frame, sources, explicit completion, and adjacent routes.
- `SteppedScene`, `StepControls`: bounded authored states, reset, step selection, and scoped keyboard navigation.
- `PredictionPrompt`, `ChallengeCard`: local prediction and progressive authored help.
- `Citation`, `SourcePanel`, `FidelityBadge`: frozen sources and model fidelity.
- `ThemeProvider`, `ThemeToggle`: system default with a locally persisted override.

Lesson-specific code viewers, diagrams, plots, diff views, and document maps belong beside the lesson that needs them. Promote one here after a second real lesson needs the same behavior and tests.
