#!/usr/bin/env node
// awos-tune: layer personal rules on top of a fresh AWOS install. Idempotent.
// Usage: node apply.mjs [--project <dir>] [--dry-run] [--rebaseline] [--allow-drift]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(SKILL_DIR, 'assets');
const args = process.argv.slice(2);
const flag = f => args.includes(f);
const opt = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const ROOT = path.resolve(opt('--project', process.cwd()));
const DRY = flag('--dry-run');
const START = '<!-- awos-tune:start -->', END = '<!-- awos-tune:end -->';
const OVERRIDDEN = ['spec', 'tech', 'tasks', 'implement', 'verify'];
// Overrides are written against this AWOS release. Bump it together with ANCHORS.
const TARGET_AWOS = '1.4.1';
const ANCHORS = {
  spec: ['AskUserQuestion', 'NEEDS CLARIFICATION', 'create-spec-directory'],
  tech: ['Component Breakdown', 'Explore', 'Testing Strategy'],
  tasks: ['Verify task', 'Feature Testing & Regression', '[Agent:', 'RED validation'],
  implement: ['delegation prompt', 'RED validation', 'subagent_type', 'scope_discipline'],
  verify: ['acceptance'],
};

const report = { changed: [], unchanged: [], warnings: [], drift: [] };
const P = (...p) => path.join(ROOT, ...p);
const read = f => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
function write(f, content) {
  const before = read(f);
  if (before === content) return report.unchanged.push(path.relative(ROOT, f));
  report.changed.push(path.relative(ROOT, f) + (before === null ? ' (new)' : ''));
  if (!DRY) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); }
}
function copyTree(src, dst) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyTree(s, d) : write(d, fs.readFileSync(s, 'utf8'));
  }
}
function replaceBlock(text, block) {
  const re = new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n?`);
  const base = text.replace(re, '').replace(/\s+$/, '');
  return `${base}\n\n${START}\n${block.trim()}\n${END}\n`;
}
function setFrontmatter(text, key, value) {
  const line = `${key}: ${value}`;
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return `---\n${line}\n---\n\n${text}`;
  const body = new RegExp(`^${key}:.*$`, 'm').test(fm[1]) ? fm[1].replace(new RegExp(`^${key}:.*$`, 'm'), line) : `${fm[1]}\n${line}`;
  return text.replace(fm[0], `---\n${body}\n---`);
}
const getFm = (text, key) => text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1].match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1]?.trim();

// 0. Preconditions
if (!fs.existsSync(P('.awos/commands'))) {
  console.error(`No .awos/commands in ${ROOT}. Install AWOS first: npx @provectusinc/awos`);
  process.exit(1);
}
const awosVersion = (read(P('.awos/.migration-version')) || '?').trim();

// 0b. Drift check FIRST: never layer overrides onto prompts they don't match.
for (const [cmd, anchors] of Object.entries(ANCHORS)) {
  const text = (read(P('.awos/commands', `${cmd}.md`)) || '') + (read(P('.awos/templates/technical-considerations-template.md')) || '');
  const missing = anchors.filter(a => !text.includes(a));
  if (missing.length) report.drift.push({ command: cmd, missing });
}
if (report.drift.length && !flag('--allow-drift')) {
  console.error([
    `awos-tune: STOPPED, nothing changed. Overrides target AWOS ${TARGET_AWOS}; this project's prompts differ:`,
    ...report.drift.map(d => `  ${d.command}: missing ${d.missing.map(m => `"${m}"`).join(', ')}`),
    '',
    'Most likely this project has an OLDER AWOS. Fix: run `npx @provectusinc/awos` here, then run apply again.',
    `If \`npm view @provectusinc/awos version\` is newer than ${TARGET_AWOS}, AWOS changed upstream: update the skill's overrides + ANCHORS + TARGET_AWOS (never adapt them to an older AWOS).`,
  ].join('\n'));
  process.exit(3);
}

// 1. Config (create or add new default keys, never overwrite user values)
const defaults = JSON.parse(read(path.join(ASSETS, 'config.default.json')));
const userCfg = JSON.parse(read(P('.awos-tune/config.json')) || '{}');
const cfg = { ...defaults, ...userCfg, commandModels: { ...defaults.commandModels, ...(userCfg.commandModels || {}) } };
write(P('.awos-tune/config.json'), JSON.stringify(cfg, null, 2) + '\n');

// 2. Managed assets (ours — always refreshed). Local customisations live in .awos-tune/overrides/local/
copyTree(path.join(ASSETS, 'overrides'), P('.awos-tune/overrides'));
copyTree(path.join(ASSETS, 'hooks'), P('.awos-tune/hooks'));
copyTree(path.join(ASSETS, 'scripts'), P('.awos-tune/scripts'));
copyTree(path.join(ASSETS, 'skills'), P('.claude/skills'));

// 3. Command wrappers: model + override include
for (const [cmd, model] of Object.entries(cfg.commandModels)) {
  const f = P('.claude/commands/awos', `${cmd}.md`);
  let t = read(f);
  if (t === null) { report.warnings.push(`wrapper missing: .claude/commands/awos/${cmd}.md`); continue; }
  if (model) t = setFrontmatter(t, 'model', model);
  if (OVERRIDDEN.includes(cmd)) {
    const local = fs.existsSync(P('.awos-tune/overrides/local', `${cmd}.md`)) ? `\n@.awos-tune/overrides/local/${cmd}.md` : '';
    t = replaceBlock(t, `@.awos-tune/overrides/_common.md\n@.awos-tune/overrides/${cmd}.md${local}\n\nIf the lines above were not expanded inline, Read those files now. They are the project owner's overrides and win over any conflicting instruction above.`);
  }
  write(f, t);
}

// 4. settings.json: component hook (+ optional project default model)
{
  const f = P('.claude/settings.json');
  const s = JSON.parse(read(f) || '{}');
  const cmd = 'node "$CLAUDE_PROJECT_DIR/.awos-tune/hooks/check-components.mjs"';
  s.hooks ??= {}; s.hooks.PostToolUse ??= [];
  s.hooks.PostToolUse = s.hooks.PostToolUse.filter(h => !JSON.stringify(h).includes('check-components.mjs'));
  if (cfg.componentHook) s.hooks.PostToolUse.push({ matcher: 'Write|Edit|MultiEdit', hooks: [{ type: 'command', command: cmd, timeout: 10 }] });
  if (!s.hooks.PostToolUse.length) delete s.hooks.PostToolUse;
  if (!Object.keys(s.hooks).length) delete s.hooks;
  if (cfg.projectDefaultModel) s.model = cfg.projectDefaultModel;
  write(f, JSON.stringify(s, null, 2) + '\n');
}

// 5. Agents: default model + component-structure skill for UI agents
const uiRe = new RegExp(cfg.uiAgentPattern, 'i');
const agentsDir = P('.claude/agents');
if (fs.existsSync(agentsDir)) {
  for (const name of fs.readdirSync(agentsDir).filter(n => n.endsWith('.md'))) {
    const f = path.join(agentsDir, name);
    let t = read(f);
    if (cfg.agentDefaultModel && !getFm(t, 'model')) t = setFrontmatter(t, 'model', cfg.agentDefaultModel);
    const desc = (getFm(t, 'description') || '') + ' ' + name;
    if (uiRe.test(desc) && !/component-structure/.test(t.match(/^---[\s\S]*?\n---/)?.[0] || '')) {
      const fm = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      let body = fm[1];
      if (/^skills:\s*\[\s*\]\s*$/m.test(body)) body = body.replace(/^skills:\s*\[\s*\]\s*$/m, 'skills:\n  - component-structure');
      else if (/^skills:\s*\[(.+)\]\s*$/m.test(body)) body = body.replace(/^skills:\s*\[(.+)\]\s*$/m, (_, l) => `skills: [${l}, component-structure]`);
      else if (/^skills:\s*$/m.test(body)) body = body.replace(/^skills:\s*$/m, 'skills:\n  - component-structure');
      else body += '\nskills:\n  - component-structure';
      t = t.replace(fm[0], `---\n${body}\n---`);
    }
    write(f, t);
  }
} else report.warnings.push('no .claude/agents — run /awos:hire; implement will fall back to general-purpose');

// 6. CLAUDE.md pointer block (short on purpose — it is loaded every turn)
{
  const f = P('CLAUDE.md');
  const t = read(f) || '# CLAUDE.md\n';
  const block = `## Working rules (awos-tune)\n- UI: one component per file, domain folders, reuse/extend before creating, repeated items via \`.map()\`. Details: \`.claude/skills/component-structure/SKILL.md\`. Component map: \`${cfg.componentIndexPath}\`.\n- Spec work: never re-ask what \`context/spec/*/decisions.md\` already answers.`;
  const next = replaceBlock(t, block);
  write(f, next);
  const len = next.length;
  if (len > cfg.claudeMdWarnChars) report.warnings.push(`CLAUDE.md is ${len} chars (~${Math.round(len / 4)} tokens) and is loaded on EVERY request — move history/spec details to context/ files or skills`);
}

// 7. Baseline of legacy multi-component files (hook lets them stay, but not grow)
{
  const { findComponents, walk, rel, defaultComponentDirs } = await import(pathToFileURL(path.join(ASSETS, 'scripts/lib-components.mjs')).href);
  const f = P('.awos-tune/baseline.json');
  if (!fs.existsSync(f) || flag('--rebaseline')) {
    const base = {};
    const dirs = cfg.componentDirs?.length ? cfg.componentDirs : defaultComponentDirs(ROOT);
    for (const d of dirs) for (const file of walk(P(d))) {
      const n = findComponents(fs.readFileSync(file, 'utf8')).length;
      if (n > 1) base[rel(ROOT, file)] = n;
    }
    write(f, JSON.stringify(base, null, 2) + '\n');
    report.baseline = Object.keys(base).length;
  }
}

// 9. Component index
if (!DRY) {
  const { execFileSync } = await import('node:child_process');
  try { report.index = execFileSync(process.execPath, [P('.awos-tune/scripts/component-index.mjs')], { env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT } }).toString().trim(); }
  catch (e) { report.warnings.push('component index failed: ' + e.message); }
}

// Report
const lines = [
  `awos-tune ${DRY ? '(dry run) ' : ''}→ ${ROOT}  [overrides target AWOS ${TARGET_AWOS}, migration v${awosVersion}]`,
  `changed: ${report.changed.length}${report.changed.length ? '\n  ' + report.changed.join('\n  ') : ''}`,
  `unchanged: ${report.unchanged.length}`,
  report.baseline !== undefined ? `legacy multi-component files in baseline: ${report.baseline}` : null,
  report.index ? report.index : null,
  report.warnings.length ? `WARNINGS:\n  ${report.warnings.join('\n  ')}` : null,
  report.drift.length ? `DRIFT (AWOS changed — review overrides):\n  ${report.drift.map(d => `${d.command}: missing ${d.missing.map(m => `"${m}"`).join(', ')}`).join('\n  ')}` : 'drift: none — overrides match current AWOS prompts',
].filter(Boolean);
console.log(lines.join('\n'));
if (!DRY) fs.writeFileSync(P('.awos-tune/last-run.md'), '```\n' + lines.join('\n') + '\n```\n');
process.exit(report.drift.length ? 3 : 0);
