## implement: extra rules (token budget)

1. **Lean delegation. This replaces "include the full context of the three files".** Load the spec files once for your own understanding. For each task, the delegation prompt contains:
   - the task line and its slice heading
   - **only** the acceptance criteria and tech-spec excerpt relevant to this task, quoted
   - the file paths `functional-spec.md`, `technical-considerations.md` and `decisions.md`, which the subagent reads only if the excerpt is not enough
   - the `reuse:/extend:/new:` target for UI work, plus: "Follow `.claude/skills/component-structure/SKILL.md`."

   Keep the verbatim blocks from the original command (scope_discipline, investigate_before_answering, command_hygiene, completion_evidence), but **drop the RED-validation instruction for every task outside the Feature Testing & Regression slice**.
2. **Model routing.** Read `**[Model: X]**` from the task line and pass it as the `model` parameter of the `Agent` call. If there is no marker, use `sonnet`. Never run implementation subagents on `opus` unless the task line says so.
3. **Index refresh.** After a task that created, moved or renamed components, run `node .awos-tune/scripts/component-index.mjs`. It is cheap and has no model cost.
4. **Batch trivial tasks.** Consecutive `haiku` tasks in the same slice that target the same agent may go into one delegation as a checklist.
