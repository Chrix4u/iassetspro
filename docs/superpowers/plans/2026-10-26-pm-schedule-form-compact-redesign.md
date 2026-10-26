# PM Schedule Compact Form Redesign Plan

1. Add failing tests for frequency type/unit behavior, total estimated duration calculation, compact labels, and modern schedule payload semantics.
2. Extend PM task draft helpers with UI-only frequency type, full time units, and duration aggregation.
3. Redesign task cards into a compact desktop grid; rename Equipment State to Inspection Type and keep conditional CBM controls contextual.
4. Re-grid schedule identity/target/template inputs and add top task-count/duration summary.
5. Remove schedule-level priority/assignment/department/manual duration authoring; save computed task duration for modern schedules.
6. Verify targeted PM tests, lint/typecheck, full Vitest suite, build, then CI before promotion.
