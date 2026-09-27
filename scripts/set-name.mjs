// Sets the project name everywhere it appears, writes docs/CNAME and rebuilds the bundle.
// Usage: node scripts/set-name.mjs --name-en "Name" --name-ar "الاسم" --repo Repo --domain sub.example.com [--slug name]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const nameEn = arg('name-en');
const nameAr = arg('name-ar');
const repo = arg('repo');
const domain = arg('domain');
const slug = arg('slug') || (repo || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
if (!nameEn || !nameAr || !repo || !domain) {
  console.error('Usage: node scripts/set-name.mjs --name-en "Name" --name-ar "الاسم" --repo Repo --domain sub.example.com [--slug name]');
  process.exit(2);
}
const token = (k) => ['@@', k, '@@'].join('');
const map = { [token('NAME_EN')]: nameEn, [token('NAME_AR')]: nameAr, [token('REPO')]: repo, [token('SLUG')]: slug, [token('DOMAIN')]: domain };
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
let changed = 0;
for (const f of walk(root)) {
  const s = readFileSync(f, 'utf8');
  let t = s;
  for (const [k, v] of Object.entries(map)) t = t.split(k).join(v);
  if (t !== s) { writeFileSync(f, t); changed += 1; }
}
writeFileSync(join(root, 'docs/CNAME'), `${domain}\n`);
const r = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
console.log(`updated ${changed} files, CNAME ${domain}`);
process.exit(r.status ?? 1);
