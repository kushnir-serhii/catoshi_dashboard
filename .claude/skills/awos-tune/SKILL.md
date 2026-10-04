---
name: awos-tune
description: Layer Serhii's rules on top of a fresh AWOS (provectus spec-driven framework) install — per-command models, one-component-per-file hook, component reuse index, batched tests, no repeated questions, lean subagent delegation. Use after `npx @provectusinc/awos` (install or update), when the user says /awos-tune, "налаштуй awos", "онови awos", or AWOS behaviour drifted from his preferences.
---

# awos-tune

AWOS stays stock. Every personal rule lives in `.awos-tune/` and is pulled in by a marked block at the end of each `.claude/commands/awos/*.md` wrapper. `apply.mjs` is idempotent, so you run it again after every AWOS update.

## Steps

1. **Check AWOS.** `.awos/commands/` must exist. If it doesn't, or the user asked to update, run `npx @provectusinc/awos` first. It preserves existing files, so wrappers that were already tuned stay tuned.
2. **Apply** (mechanical, no judgement needed):
   ```
   node <this-skill-dir>/scripts/apply.mjs --project <repo-root>
   ```
   Add `--dry-run` to preview. Add `--rebaseline` to re-snapshot the legacy multi-component files, for example after a cleanup.
3. **Handle drift** (exit code 3; apply stops and changes nothing). Drift means this project's AWOS prompts don't contain the phrases the overrides rely on. **The usual cause is an outdated AWOS in the project, not a change upstream.**
   - First run `npx @provectusinc/awos` in the project, then run apply again. That fixes it in most cases.
   - Only if drift persists **and** `npm view @provectusinc/awos version` is newer than `TARGET_AWOS` in `apply.mjs`: read the new `.awos/commands/<cmd>.md`, adapt `assets/overrides/<cmd>.md`, `ANCHORS` and `TARGET_AWOS`, then re-apply to every tuned project.
   - **Never adapt the overrides to an older AWOS.** The overrides are shared by all projects, so doing that breaks the up-to-date ones.
   - Never edit `.awos/` itself. `--allow-drift` exists for emergencies only.
4. **Handle warnings.** The most common one is a large `CLAUDE.md`. Offer to move spec history and module notes into `context/` docs, keeping only the commands, the architecture skeleton and the rules. Do this only with the user's OK.
5. **Report** in 3–5 lines: which files changed, any drift that was fixed, the warnings, and the model map in use.

## What gets installed in the project

| Path | Purpose |
|---|---|
| `.awos-tune/config.json` | Model per command (`commandModels`), `agentDefaultModel`, component dirs, hook on/off. The user edits this file. |
| `.awos-tune/overrides/*.md` | Managed rules for spec/tech/tasks/implement/verify. Overwritten on every apply. |
| `.awos-tune/overrides/local/<cmd>.md` | Project-only additions. Never touched by apply; included automatically when present. |
| `.awos-tune/hooks/check-components.mjs` | PostToolUse hook that blocks a second component in a `.tsx/.jsx` file. Legacy files listed in `baseline.json` may not grow. |
| `.awos-tune/scripts/component-index.mjs` | Writes `context/components-index.md`, the reuse map used by tech/tasks/implement. |
| `.claude/skills/component-structure/` | The code-structure rules, attached to UI agents through `skills:`. |
| Wrapper frontmatter `model:` | Forces the model per AWOS command. |
| Agents without `model:` | Get `agentDefaultModel` (sonnet). Per-task `[Model: …]` markers override it through the Agent tool's `model` parameter. |

## Model map (default)

- opus: product, architecture, spec, tech (the thinking steps)
- sonnet: roadmap, tasks, implement (orchestrator), verify, and implementation subagents
- haiku: hire, plus tasks marked `[Model: haiku]` by /awos:tasks

Aliases (`opus`/`sonnet`/`haiku`) or full model IDs both work in `config.json`.

## Maintaining the skill itself

Change rules in `assets/overrides/` or `assets/skills/`, not in a project's copy. Then run apply in each project. Keep override files short, because they are loaded into every run of their command.
