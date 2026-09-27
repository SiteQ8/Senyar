import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundle as b, root, ARABIC, sentencePeriods, digits, textFiles } from './helpers.mjs';

function arabicSentence(ar, where) {
  assert.ok(ARABIC.test(ar), `${where}: Arabic text expected`);
  assert.ok(ar.trim().endsWith('.'), `${where}: must end with a period`);
  assert.equal(sentencePeriods(ar), 1, `${where}: a period may only close the sentence`);
  assert.ok(!/[,;:]/.test(ar), `${where}: join clauses with Arabic connectives, not Latin punctuation`);
  for (const tok of ar.match(/[A-Za-z][A-Za-z0-9/+-]*/g) || []) assert.match(tok, /^[A-Z0-9]/, `${where}: stray Latin word "${tok}"`);
}
function pair(en, ar, where) {
  assert.ok(en && ar, `${where}: both languages required`);
  assert.ok(!ARABIC.test(en), `${where}: English text contains Arabic`);
  assert.deepEqual(digits(ar), digits(en), `${where}: every number must survive translation`);
}

test('bundle is generated from data/src and up to date', () => {
  const r = spawnSync(process.execPath, [join(root, 'scripts/build.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('structure matches the official text', () => {
  assert.equal(b.controls.length, 356);
  assert.equal(b.domains.length, 26);
  assert.equal(b.controls.filter((c) => c.baseline).length, 166);
  const ph1 = b.controls.find((c) => c.id === 'PH 1');
  assert.equal(ph1.printed, 'PH 2');
  assert.deepEqual(b.controls.find((c) => c.id === 'NS 12').baselineItems, ['c']);
  assert.deepEqual(b.controls.find((c) => c.id === 'GS 10').baselineItems, ['a', 'd']);
  assert.equal(new Set(b.controls.map((c) => c.id)).size, 356);
  for (const d of b.domains) assert.equal(d.counts.total, b.controls.filter((c) => c.domain === d.code).length);
  for (const c of b.controls) assert.ok(c.page >= 1 && c.page <= 54, `${c.id} page`);
});

test('every control has bilingual summaries that follow the Arabic writing rules', () => {
  for (const c of b.controls) {
    pair(c.en, c.ar, c.id);
    arabicSentence(c.ar, c.id);
  }
});

test('every control maps to ISO/IEC 27001:2022 and NIST CSF 2.0', () => {
  const iso = new Set(b.iso.map((i) => i.ref));
  const csf = new Set(b.csf.subcategories.map((s) => s.id));
  for (const c of b.controls) {
    assert.ok(c.iso.length && c.csf.length, `${c.id} has mappings`);
    for (const r of c.iso) assert.ok(iso.has(r), `${c.id} ${r}`);
    for (const r of c.csf) assert.ok(csf.has(r), `${c.id} ${r}`);
  }
});

test('domains, notes, rules, deadlines and PDPPL entries are bilingual', () => {
  for (const d of b.domains) {
    assert.ok(d.en && d.ar, d.code);
    pair(d.objective.en, d.objective.ar, `${d.code} objective`);
    arabicSentence(d.objective.ar, `${d.code} objective`);
    for (const s of d.subsections) assert.ok(s.en && s.ar && ARABIC.test(s.ar), `${d.code} ${s.key}`);
  }
  for (const n of b.notes) { pair(n.en, n.ar, n.id); arabicSentence(n.ar, n.id); }
  for (const [k, r] of Object.entries(b.classification.rules)) { pair(r.en, r.ar, k); arabicSentence(r.ar, k); }
  for (const d of b.deadlines) { pair(d.en, d.ar, d.ref); assert.ok(!/[,;:.]/.test(d.ar), d.ref); }
  for (const o of b.pdppl.obligations) {
    pair(o.en, o.ar, o.id);
    arabicSentence(o.ar, o.id);
    assert.ok(o.title.en && ARABIC.test(o.title.ar), `${o.id} title`);
    assert.ok(o.articles.every((a) => a >= 1 && a <= 32), `${o.id} articles`);
  }
  assert.ok(b.pdppl.obligations.find((o) => o.id === 'P17').ar.includes('72'));
});

test('official Arabic labels from the National Data Classification Policy', () => {
  assert.deepEqual(['C0', 'C1', 'C2', 'C3', 'C4'].map((k) => b.classification.labels[k].ar), ['عام', 'داخلي', 'محدود الوصول', 'سري', 'سري للغاية']);
  assert.deepEqual(b.classification.attributes.map((a) => a.ar), ['السرية', 'النزاهة', 'التوفر']);
});

test('ISO and CSF references are complete and bilingual', () => {
  assert.equal(b.iso.filter((i) => i.kind === 'annex').length, 93);
  assert.equal(b.csf.subcategories.length, 106);
  assert.equal(b.csf.categories.length, 22);
  for (const i of b.iso) assert.ok(i.en && ARABIC.test(i.ar) && !/[,;.]/.test(i.ar), i.ref);
  for (const s of b.csf.subcategories) assert.ok(s.en && ARABIC.test(s.ar) && !/[,;:.]/.test(s.ar), s.id);
});

test('UI strings exist in both languages and Arabic periods only close sentences', () => {
  for (const [k, v] of Object.entries(b.ui)) {
    assert.ok(v.en && v.ar, k);
    const p = sentencePeriods(v.ar);
    if (p) { assert.equal(p, 1, `${k}: one sentence only`); assert.ok(v.ar.trim().endsWith('.'), `${k}: period only at the end`); }
  }
});

test('repository text has no Unicode dashes, no excluded names and no attribution to an AI assistant', () => {
  const dash = /[\u2012\u2013\u2014\u2015\u2212]/;
  const words = [['n', 'b', 'k'], ['cl', 'aude'], ['anth', 'ropic']].map((w) => new RegExp(`\\b${w.join('')}`, 'i'));
  for (const f of textFiles()) {
    const s = readFileSync(join(root, f), 'utf8');
    assert.ok(!dash.test(s), `${f} contains a Unicode dash`);
    for (const w of words) assert.ok(!w.test(s), `${f} contains an excluded word`);
  }
});
