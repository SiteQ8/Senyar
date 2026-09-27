import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bundle as b, root } from './helpers.mjs';

const read = (f) => readFileSync(join(root, f), 'utf8');

test('page loads only its own files under a strict CSP', () => {
  const html = read('docs/index.html');
  assert.match(html, /Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'/);
  const loaded = html.replace(/<link rel="canonical" href="[^"]+">/, '');
  for (const m of loaded.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (m[1].startsWith('#')) continue;
    assert.ok(!/^[a-z]+:/i.test(m[1]), `external reference ${m[1]}`);
    assert.ok(existsSync(join(root, 'docs', m[1])), `missing ${m[1]}`);
  }
  assert.ok(!/<script(?![^>]*src=)[^>]*>/.test(html), 'no inline scripts');
  assert.ok(!/style="/.test(html + read('docs/assets/app.js')), 'no inline style attributes');
  assert.ok(!/https?:\/\//.test(read('docs/assets/styles.css').replaceAll('http://www.w3.org/2000/svg', '')), 'styles load nothing external');
  for (const m of read('docs/assets/fonts.css').matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)) assert.ok(existsSync(join(root, 'docs/fonts', m[1])), m[1]);
});

test('every UI key used by the app exists in both languages', () => {
  const app = read('docs/assets/app.js');
  const keys = new Set([...app.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]));
  for (const tab of ['register', 'crosswalk', 'pdppl', 'report', 'about']) keys.add(`tab.${tab}`);
  for (const f of ['all', 'baseline', 'additional', 'open', 'unassessed']) keys.add(`filter.${f}`);
  for (const s of ['unassessed', 'implemented', 'partial', 'missing', 'na']) keys.add(`status.${s}`);
  for (const o of b.pdppl.obligations) keys.add(`pd.topic.${o.topic}`);
  for (const g of ['baseline-missing', 'baseline-partial', 'baseline-unassessed', 'additional-shortfall', 'adopted-open', 'na-unjustified']) keys.add(`gap.${g}`);
  for (const k of keys) assert.ok(b.ui[k]?.en && b.ui[k]?.ar, `missing UI string ${k}`);
});

test('README documents every MCP tool in English and Arabic', () => {
  const readme = read('README.md');
  const server = read('mcp/server.mjs');
  for (const m of server.matchAll(/name: '(nia_[a-z_]+)'/g)) assert.ok(readme.includes(m[1]), `README misses ${m[1]}`);
  assert.match(readme, /^## \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629$/m);
  assert.ok((readme.match(/[\u0600-\u06FF]/g) || []).length > 800, 'README has a full Arabic section');
});
