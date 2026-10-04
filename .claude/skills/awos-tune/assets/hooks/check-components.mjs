#!/usr/bin/env node
// PostToolUse hook (Write|Edit|MultiEdit): one component per file.
// Blocks (exit 2) when a .tsx/.jsx file ends up with more components than allowed.
// Files that already had several components when awos-tune was applied are listed in
// .awos-tune/baseline.json — they may not GROW, but are not forced to split.
import fs from 'node:fs';
import path from 'node:path';
import { findComponents, ALLOW_MARK, UI_EXT, rel } from '../scripts/lib-components.mjs';

let input = '';
process.stdin.on('data', d => (input += d));
process.stdin.on('end', () => {
  let file;
  try { file = JSON.parse(input)?.tool_input?.file_path; } catch { process.exit(0); }
  if (!file || !UI_EXT.test(file) || /\.(test|spec|stories)\.(tsx|jsx)$/.test(file)) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  file = path.resolve(root, file);
  let src;
  try { src = fs.readFileSync(file, 'utf8'); } catch { process.exit(0); }
  if (src.includes(ALLOW_MARK)) process.exit(0);

  const comps = findComponents(src);
  let baseline = {};
  try { baseline = JSON.parse(fs.readFileSync(path.join(root, '.awos-tune/baseline.json'), 'utf8')); } catch {}
  const key = rel(root, file);
  const allowed = Math.max(1, baseline[key] || 0);
  if (comps.length <= allowed) process.exit(0);

  const names = comps.map(c => `${c.name} (line ${c.line})`).join(', ');
  const legacy = baseline[key]
    ? `This is a legacy file that already had ${baseline[key]} components; do not add more. Put the new component in its own file.`
    : 'Move every component except the main one into its own file (<group>/<Name>.tsx) and import it.';
  process.stderr.write(
    `[awos-tune] ${key} now defines ${comps.length} components: ${names}.\n` +
    `Rule: one component per file, folders by group (see .claude/skills/component-structure/SKILL.md).\n${legacy}\n`
  );
  process.exit(2);
});
