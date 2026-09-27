// Release gate: the bundle is fresh, every test passes, the name is set everywhere and the domain matches CNAME.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const problems = [];
const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status === 0;

if (!run(['scripts/build.mjs', '--check'])) problems.push('docs/data/bundle.json is out of date');
const tests = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => join('test', f));
if (!run(['--test', ...tests])) problems.push('tests failed');

const marker = ['@', '@'].join('');
const TEXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.tsv', '.py', '.svg']);
function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    if (['.git', 'node_modules', 'fonts'].includes(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (TEXT.has(extname(n))) out.push(p);
  }
  return out;
}
for (const f of walk(root)) {
  if (/@@[A-Z_]+@@/.test(readFileSync(f, 'utf8').replaceAll('/@@[A-Z_]+@@/', ''))) problems.push(`${f.slice(root.length)} still has a name placeholder; run npm run set-name`);
}
const project = JSON.parse(readFileSync(join(root, 'data/src/project.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (pkg.name !== project.slug) problems.push('package.json name does not match project.json slug');
const cname = existsSync(join(root, 'docs/CNAME')) ? readFileSync(join(root, 'docs/CNAME'), 'utf8').trim() : '';
if (!project.domain.includes(marker) && cname !== project.domain) problems.push(`docs/CNAME (${cname || 'missing'}) does not match ${project.domain}`);

if (problems.length) {
  console.error(`\nPreflight failed:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nPreflight passed.');
