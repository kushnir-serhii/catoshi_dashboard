# LOCAL OVERRIDES (awos-tune)

The rules below come from the project owner. **Where they conflict with any instruction above, these win.**

## Questions: never ask twice

- The spec's shared decision log is `context/spec/[spec-dir]/decisions.md`. Create it if missing.
- **Before asking anything**, read `decisions.md` plus the spec files that already exist. If an answer is already there, or can be derived from it, reuse it silently and do not ask again.
- After every `AskUserQuestion`, append each question and its answer to `decisions.md` as one line: `- [step] Q: … → A: …`. Also log any assumption you made in place of an unanswered question, as `- [step] ASSUMED: …`.
- Batch the questions: up to 4 per `AskUserQuestion` call, and ask only what actually blocks the deliverable.

## Code structure (applies to every step that plans or writes code)

Follow `.claude/skills/component-structure/SKILL.md`. In short: one component per file, folders grouped by domain, reuse before creating, and render repeated elements with `.map()` over data.
