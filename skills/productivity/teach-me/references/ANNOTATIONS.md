# Teaching annotations

Read this when a lesson marks preferred, invalid, risky, or noteworthy details.

Use one annotation model across code lines and ranges, prose regions, formulas, timelines, SVG, and React Flow nodes or edges. Each annotation has a stable ID, kind, short label, reason, optional consequence, preferred alternative, and source.

Kinds are `do`, `dont`, `warning`, and `note`. Use an icon and visible label with color. Use "Prefer here" and "Avoid here" for contextual advice. Reserve "Do" and "Don't" for invariants, invalid behavior, broken behavior, and safety rules.

Highlight a whole row, card, node, edge, or example with a full region treatment. Mark a local token, phrase, formula term, or connection detail with a squiggle. Split overlapping ranges when possible. A truly shared target gets one marker with stacked explanations.

Hover and focus show a short popup. Click and tap pin the full explanation in the right inspector or narrow-screen bottom sheet. Move focus to the inspector heading, provide Close and Previous/Next controls with a count, and return focus to the original target on close. Opening the lesson drawer closes the inspector and opening the inspector closes the drawer.

Close a pinned annotation when the lesson step, debugger frame, case, or activity state changes. Wrong answers reveal only the relevant annotation. After a correct answer or explicit explanation, the lesson may expose the full set.

The active debugger line and annotations remain distinct. Active means pale mint row, gutter bar, and `ACTIVE`. A do uses a green outline and check. A don't uses a red outline or squiggle. They may coexist.
