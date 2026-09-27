// Compiles data/src into docs/data/bundle.json, the single data file used by the site and the MCP server.
// Usage: node scripts/build.mjs          write the bundle
//        node scripts/build.mjs --check  exit 1 if the committed bundle is out of date
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const src = (f) => readFileSync(new URL(`data/src/${f}`, root), 'utf8');
const json = (f) => JSON.parse(src(f));
const lines = (f) => src(f).split('\n').filter((l) => l.trim() && !l.startsWith('#'));
const errors = [];
const fail = (msg) => errors.push(msg);

// Structure derived from the official PDF (tools/verify_nia_source.py)
const structure = src('nia-structure.tsv').trim().split('\n').slice(1).map((l) => {
  const [id, domain, sub, baseline, items, page, printed] = l.split('\t');
  return { id, domain, sub: sub || null, baseline: baseline === '1', baselineItems: items ? items.split(',') : [], page: Number(page), printed };
});

const summaries = new Map(lines('nia-summaries.txt').map((l) => {
  const p = l.split(' | ');
  if (p.length !== 3) fail(`summary line malformed: ${l.slice(0, 40)}`);
  return [p[0], { en: p[1], ar: p[2] }];
}));

const mappings = new Map(lines('nia-mappings.txt').map((l) => {
  const p = l.split(' | ', 4);
  let csf = p[2] || '';
  let cond = p[3] || '';
  if (p.length === 3 && csf.endsWith(' |')) csf = csf.slice(0, -2);
  if (p.length === 3 && csf.endsWith('|')) csf = csf.slice(0, -1);
  return [p[0], { iso: p[1].trim().split(/\s+/).filter(Boolean), csf: csf.trim().split(/\s+/).filter(Boolean), cond: cond.trim() || null }];
}));

const iso = lines('iso27001.txt').map((l) => {
  const [ref, en, ar] = l.split(' | ');
  return { ref, kind: ref.startsWith('A.') ? 'annex' : 'clause', en, ar };
});
const isoRefs = new Set(iso.map((x) => x.ref));

const csfMeta = json('csf2-meta.json');
const csfEn = new Map(src('csf2-en.tsv').trim().split('\n').slice(1).map((l) => l.split('\t')));
const csfAr = new Map(lines('csf2-ar.txt').map((l) => l.split(' | ')));
const csfSubs = [...csfEn.keys()].map((id) => ({ id, category: id.slice(0, 5), en: csfEn.get(id), ar: csfAr.get(id) }));
const csfIds = new Set(csfSubs.map((s) => s.id));
for (const s of csfSubs) if (!s.ar) fail(`CSF ${s.id} has no Arabic`);

const dom = json('domains.json');
const notes = json('notes.json');
const pdppl = json('pdppl.json');
const sources = json('sources.json');
const classification = json('classification.json');
const ui = json('ui.json');
const project = json('project.json');

const domainCodes = new Set(dom.domains.map((d) => d.code));
const noteIndex = new Map();
for (const n of notes) for (const c of n.controls) noteIndex.set(c, [...(noteIndex.get(c) || []), n.id]);
const pdpplIndex = new Map();
for (const o of pdppl.obligations) for (const c of o.nia) pdpplIndex.set(c, [...(pdpplIndex.get(c) || []), o.id]);

const COND = /^((C|I|A)>=[0-4]|AGG>=[LMH]|RISK>=[LMH])(\|((C|I|A)>=[0-4]|AGG>=[LMH]))*$/;
const controls = structure.map((s) => {
  const sum = summaries.get(s.id);
  const map = mappings.get(s.id);
  if (!sum) fail(`${s.id} has no summary`);
  if (!map) fail(`${s.id} has no mapping`);
  if (!domainCodes.has(s.domain)) fail(`${s.id} unknown domain`);
  const d = dom.domains.find((x) => x.code === s.domain);
  if (s.sub && !d.subsections.some((x) => x.key === s.sub)) fail(`${s.id} unknown subsection ${s.sub}`);
  for (const r of map?.iso || []) if (!isoRefs.has(r)) fail(`${s.id} unknown ISO ref ${r}`);
  for (const r of map?.csf || []) if (!csfIds.has(r)) fail(`${s.id} unknown CSF ref ${r}`);
  if (map?.cond && !COND.test(map.cond)) fail(`${s.id} bad condition ${map.cond}`);
  const out = { id: s.id, domain: s.domain, sub: s.sub, baseline: s.baseline, page: s.page, en: sum?.en, ar: sum?.ar, iso: map?.iso || [], csf: map?.csf || [], cond: map?.cond || null };
  if (s.baselineItems.length) out.baselineItems = s.baselineItems;
  if (s.printed !== s.id) out.printed = s.printed;
  if (noteIndex.has(s.id)) out.notes = noteIndex.get(s.id);
  if (pdpplIndex.has(s.id)) out.pdppl = pdpplIndex.get(s.id);
  return out;
});
const ids = new Set(controls.map((c) => c.id));
if (ids.size !== controls.length) fail('duplicate control IDs');
for (const k of summaries.keys()) if (!ids.has(k)) fail(`summary for unknown control ${k}`);
for (const k of mappings.keys()) if (!ids.has(k)) fail(`mapping for unknown control ${k}`);
for (const n of notes) for (const c of n.controls) if (!ids.has(c)) fail(`note ${n.id} names unknown ${c}`);
const sourceIds = new Set(sources.map((s) => s.id));
for (const o of pdppl.obligations) {
  for (const c of o.nia) if (!ids.has(c)) fail(`${o.id} names unknown control ${c}`);
  if (o.penalty && !pdppl.penalties[o.penalty]) fail(`${o.id} unknown penalty`);
  if (o.guideline && !sourceIds.has(o.guideline)) fail(`${o.id} unknown guideline`);
}
const refs = new Set([...ids, ...pdppl.obligations.map((o) => o.id)]);
for (const d of dom.deadlines) if (!refs.has(d.ref)) fail(`deadline names unknown ${d.ref}`);

const domains = dom.domains.map((d) => {
  const list = controls.filter((c) => c.domain === d.code);
  const baseline = list.filter((c) => c.baseline).length;
  return { ...d, counts: { total: list.length, baseline, additional: list.length - baseline } };
});

const bundle = {
  format: 'nia-bundle/1',
  standard: { id: 'IAS-NAT-INFA', version: '2.1', published: '2023-05', owner: 'National Cyber Security Agency (NCSA), State of Qatar' },
  project,
  sources,
  classification,
  parts: dom.parts,
  domains,
  controls,
  notes,
  iso,
  csf: { functions: csfMeta.functions, categories: csfMeta.categories, subcategories: csfSubs },
  pdppl,
  deadlines: dom.deadlines,
  ui,
};

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const out = JSON.stringify(bundle) + '\n';
const target = new URL('docs/data/bundle.json', root);
if (process.argv.includes('--check')) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== out) {
    console.error('docs/data/bundle.json is out of date. Run: node scripts/build.mjs');
    process.exit(1);
  }
  console.log('bundle is up to date');
} else {
  writeFileSync(target, out);
  console.log(`bundle written: ${controls.length} controls, ${domains.length} domains, ${iso.length} ISO refs, ${csfSubs.length} CSF subcategories, ${pdppl.obligations.length} PDPPL obligations`);
}
