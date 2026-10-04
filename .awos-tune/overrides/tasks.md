## tasks: extra rules

1. **No re-asking.** Read `decisions.md`. The testing intent and the choice of QA agent may already be recorded there; if so, reuse them.
2. **Tests: batch them at the end.**
   - Implementation tasks must not contain "write tests" or RED validation.
   - Each slice's Verify task is a **smoke check only**: typecheck, lint, the existing test suite, plus one quick manual or browser check if the slice is user-visible. It writes no new tests.
   - All new tests go in the final **Feature Testing & Regression** slice. Group acceptance criteria so that **one test file covers several criteria or slices**. Target 1–3 test files per feature, not one per task.
3. **Reuse in tasks.** Every UI task names its `reuse:/extend:/new:` target from the tech spec's Component Breakdown. A task that creates a component must name its file path (one component per file).
4. **Model tier per task.** Append `**[Model: haiku|sonnet|opus]**` after the `[Agent: …]` marker:
   - `haiku`: mechanical work (wire an existing component, add constants/types, copy/text, rename, config, simple props)
   - `sonnet`: the default for normal feature code, hooks, API routes, and Verify/QA tasks
   - `opus`: only for non-trivial algorithms, tricky state/concurrency, cross-cutting refactors, or data migrations
