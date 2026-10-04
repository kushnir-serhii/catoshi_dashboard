// Shared component detection for awos-tune (no dependencies).
import fs from 'node:fs';
import path from 'node:path';

export const ALLOW_MARK = 'awos-tune: allow-multiple-components';
export const UI_EXT = /\.(tsx|jsx)$/;
// Next.js / Expo Router route files are not reusable components.
export const ROUTE_FILE = /^(page|layout|route|loading|error|not-found|template|default|_layout|\+html|\+not-found)\.(tsx|jsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', '.git', '.turbo', 'coverage', 'android', 'ios']);

// PascalCase with at least one lowercase letter (excludes ALL_CAPS constants), or a single capital.
const PASCAL = '([A-Z](?:[A-Za-z0-9]*[a-z][A-Za-z0-9]*)?)';
const PATTERNS = [
  // function Foo(  | export default function Foo<T>(
  new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${PASCAL}\\s*[(<]`),
  // const Foo = (...) =>  | const Foo: FC<P> = ...  | const Foo = memo(... | forwardRef(... | function
  new RegExp(`^(?:export\\s+)?const\\s+${PASCAL}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:\\(|[a-z_$][\\w$]*\\s*=>|function\\b|(?:React\\.)?(?:memo|forwardRef)\\s*[(<])`),
  // class Foo extends React.Component
  new RegExp(`^(?:export\\s+)?(?:default\\s+)?class\\s+${PASCAL}\\s+extends\\s+(?:React\\.)?(?:Pure)?Component\\b`),
];

/** Top-level component declarations (column 0 only) in source text. */
export function findComponents(src) {
  const out = [];
  const lines = src.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const re of PATTERNS) {
      const m = line.match(re);
      if (m) { out.push({ name: m[1], line: i + 1 }); break; }
    }
  });
  // de-dupe (e.g. overloads)
  const seen = new Set();
  return out.filter(c => (seen.has(c.name) ? false : seen.add(c.name)));
}

export function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/');
}

export function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) yield* walk(p); }
    else if (UI_EXT.test(e.name)) yield p;
  }
}

export function defaultComponentDirs(root) {
  return ['src/components', 'src/app', 'src/screens', 'src/features', 'components', 'app', 'screens', 'features']
    .filter(d => fs.existsSync(path.join(root, d)));
}

export function loadConfig(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.awos-tune/config.json'), 'utf8')); }
  catch { return {}; }
}
