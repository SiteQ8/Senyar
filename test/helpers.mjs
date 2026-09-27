import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const bundle = JSON.parse(readFileSync(join(root, 'docs/data/bundle.json'), 'utf8'));
export const ARABIC = /[\u0600-\u06FF]/;
export const sentencePeriods = (s) => (s.match(/\.(?!\d)|(?<!\d)\./g) || []).length;
export const digits = (s) => (s.match(/\d+/g) || []).sort();

const TEXT = new Set(['.js', '.mjs', '.json', '.md', '.html', '.css', '.txt', '.tsv', '.py', '.svg', '.yml', '']);
export function textFiles(dir = root) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules'].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...textFiles(p));
    else if (TEXT.has(extname(name)) || ['LICENSE', 'NOTICE', 'CNAME', '.gitignore', '.nojekyll'].includes(name)) out.push(relative(root, p));
  }
  return out;
}
