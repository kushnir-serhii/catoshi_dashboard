## tech: extra rules

1. **Decisions first.** Read `decisions.md` (including every `TECH-HINT`) before drafting. Do not ask for approval of each section separately. Instead, draft the whole document, then ask one batched `AskUserQuestion` containing only the assumptions that are genuinely uncertain (max 4).
2. **Component reuse is mandatory.** Run `node .awos-tune/scripts/component-index.mjs` and read `context/components-index.md` before proposing any UI. In **Component Breakdown**, tag every UI item with exactly one of:
   - `reuse: <path>`: use the existing component as is
   - `extend: <path>`: add a prop or variant to the existing component (preferred over a near-duplicate)
   - `new: <group>/<Name>.tsx`: add one sentence on why nothing existing fits

   For lists, grids, tabs or cards with repeated structure, name the data array and the single item component that renders it.
3. **File layout.** List new files as one component per file, placed in a domain folder (see component-structure skill).
4. **Testing Strategy: consolidated.** Plan one test file per feature area that covers several acceptance criteria together. Do not plan tests per slice or per task.
5. **Lean exploration.** Pass the `Explore` agent the list of paths from the index and the spec's acceptance criteria. Do not ask it to read the whole codebase.
