// Shared logic for the web app and the MCP server. Pure functions over the data bundle, no DOM.

export const SCHEMA = 'nia-assessment/1';
export const STATUSES = ['implemented', 'partial', 'missing', 'na'];
const AGG_ORDER = { L: 1, M: 2, H: 3 };

export function clampRatings(r = {}) {
  const n = (v, max) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? Math.min(Math.max(x, 0), max) : 0;
  };
  return { C: n(r.C, 4), I: n(r.I, 3), A: n(r.A, 3) };
}

export function maxRating(r) {
  const x = clampRatings(r);
  return Math.max(x.C, x.I, x.A);
}

// Aggregate level from the National Data Classification Policy matrix. C4 is read on the C3 row.
export function aggregate(classification, r) {
  const x = clampRatings(r);
  const row = classification.matrix[`C${Math.min(x.C, 3)}`][`I${x.I}`];
  return row[x.A] ?? null;
}

export function confidentialityLabel(classification, r) {
  const x = clampRatings(r);
  return { code: `C${x.C}`, ...classification.labels[`C${x.C}`] };
}

// Section 2.3 of the Standard: 0 everywhere needs no baseline, 1 needs every baseline control,
// 2 adds one or more additional controls per applicable domain, 3 and higher add two or more.
export function requirement(r) {
  const m = maxRating(r);
  const rule = m === 0 ? 'none' : m === 1 ? 'baseline' : m === 2 ? 'plus1' : 'plus2';
  return { max: m, baseline: m >= 1, additionalPerDomain: m >= 3 ? 2 : m === 2 ? 1 : 0, rule };
}

// Conditions are written as "C>=3", "C>=2|I>=2", "AGG>=M" or "RISK>=M". RISK cannot be evaluated here.
export function conditionMet(cond, r, agg) {
  if (!cond) return null;
  if (cond.startsWith('RISK')) return null;
  const x = clampRatings(r);
  return cond.split('|').some((part) => {
    const m = /^(C|I|A|AGG)>=(\w)$/.exec(part.trim());
    if (!m) return false;
    if (m[1] === 'AGG') return (AGG_ORDER[agg] ?? 0) >= (AGG_ORDER[m[2]] ?? 99);
    return x[m[1]] >= Number(m[2]);
  });
}

export function normalizeId(s) {
  const m = /^\s*([A-Za-z]{2})\s*[-_.]?\s*(\d{1,3})\s*$/.exec(String(s ?? ''));
  return m ? `${m[1].toUpperCase()} ${Number(m[2])}` : null;
}

export function arabicFold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647');
}

const cache = new WeakMap();
export function indexBundle(bundle) {
  if (cache.has(bundle)) return cache.get(bundle);
  const controls = new Map(bundle.controls.map((c) => [c.id, c]));
  const domains = new Map(bundle.domains.map((d) => [d.code, d]));
  const byDomain = new Map(bundle.domains.map((d) => [d.code, []]));
  const isoRev = new Map();
  const csfRev = new Map();
  const hay = new Map();
  for (const c of bundle.controls) {
    byDomain.get(c.domain).push(c);
    for (const r of c.iso) isoRev.set(r, [...(isoRev.get(r) || []), c.id]);
    for (const r of c.csf) csfRev.set(r, [...(csfRev.get(r) || []), c.id]);
    const d = domains.get(c.domain);
    const sub = d.subsections.find((s) => s.key === c.sub);
    hay.set(c.id, arabicFold([c.id, c.id.replace(' ', ''), c.en, c.ar, d.en, d.ar, sub?.en, sub?.ar, ...c.iso, ...c.csf].join(' ')));
  }
  const iso = new Map(bundle.iso.map((i) => [i.ref, i]));
  const csf = new Map(bundle.csf.subcategories.map((s) => [s.id, s]));
  const csfCat = new Map(bundle.csf.categories.map((s) => [s.id, s]));
  const pdppl = new Map(bundle.pdppl.obligations.map((o) => [o.id, o]));
  const notes = new Map(bundle.notes.map((n) => [n.id, n]));
  const idx = { controls, domains, byDomain, isoRev, csfRev, hay, iso, csf, csfCat, pdppl, notes };
  cache.set(bundle, idx);
  return idx;
}

export function emptyAssessment() {
  return { schema: SCHEMA, standard: 'NIA 2.1', ratings: { C: 0, I: 0, A: 0 }, domains: {}, controls: {}, updated: null };
}

// Accepts an assessment object (as saved by the site) and returns a clean copy plus any problems found.
export function validateAssessment(bundle, input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['The assessment must be a JSON object.'], value: emptyAssessment() };
  if (input.schema !== SCHEMA) errors.push(`Expected schema "${SCHEMA}".`);
  const idx = indexBundle(bundle);
  const value = emptyAssessment();
  value.ratings = clampRatings(input.ratings || {});
  value.updated = typeof input.updated === 'string' ? input.updated : null;
  for (const [code, d] of Object.entries(input.domains || {})) {
    if (!idx.domains.has(code)) { errors.push(`Unknown domain ${code}.`); continue; }
    value.domains[code] = { na: !!d?.na, note: typeof d?.note === 'string' ? d.note.slice(0, 4000) : '' };
  }
  for (const [rawId, c] of Object.entries(input.controls || {})) {
    const id = normalizeId(rawId);
    if (!id || !idx.controls.has(id)) { errors.push(`Unknown control ${rawId}.`); continue; }
    const status = STATUSES.includes(c?.status) ? c.status : undefined;
    if (c?.status && !status) errors.push(`Unknown status "${c.status}" on ${id}.`);
    const entry = {};
    if (status) entry.status = status;
    if (c?.adopted) entry.adopted = true;
    if (typeof c?.note === 'string' && c.note.trim()) entry.note = c.note.slice(0, 8000);
    if (Object.keys(entry).length) value.controls[id] = entry;
  }
  return { ok: errors.length === 0, errors, value };
}

export function evaluate(bundle, input) {
  const { value: a, errors } = validateAssessment(bundle, input);
  const idx = indexBundle(bundle);
  const req = requirement(a.ratings);
  const agg = aggregate(bundle.classification, a.ratings);
  const gaps = [];
  const domains = bundle.domains.map((d) => {
    const ds = a.domains[d.code] || {};
    const na = !!ds.na;
    const out = {
      code: d.code, na, naNote: ds.note || '',
      baseline: { total: 0, implemented: 0, partial: 0, missing: 0, unassessed: 0, na: 0 },
      additional: { available: 0, adopted: 0, required: 0, shortfall: 0 },
    };
    for (const c of idx.byDomain.get(d.code)) {
      const st = a.controls[c.id] || {};
      const status = na ? 'na' : st.status || 'unassessed';
      if (c.baseline) {
        if (status === 'na') out.baseline.na += 1;
        else { out.baseline.total += 1; out.baseline[status] += 1; }
        if (!na && req.baseline) {
          if (status === 'missing') gaps.push({ kind: 'baseline-missing', id: c.id, domain: d.code, priority: 1 });
          else if (status === 'partial') gaps.push({ kind: 'baseline-partial', id: c.id, domain: d.code, priority: 2 });
          else if (status === 'unassessed') gaps.push({ kind: 'baseline-unassessed', id: c.id, domain: d.code, priority: 3 });
        }
      } else {
        out.additional.available += 1;
        if (!na && st.adopted && status !== 'na') {
          out.additional.adopted += 1;
          if (status === 'missing' || status === 'partial') gaps.push({ kind: 'adopted-open', id: c.id, domain: d.code, priority: status === 'missing' ? 2 : 3 });
        }
      }
      if (!na && st.status === 'na' && !st.note) gaps.push({ kind: 'na-unjustified', id: c.id, domain: d.code, priority: 3 });
    }
    if (na && !ds.note) gaps.push({ kind: 'na-unjustified', id: null, domain: d.code, priority: 3 });
    out.additional.required = na ? 0 : Math.min(req.additionalPerDomain, out.additional.available);
    out.additional.shortfall = Math.max(0, out.additional.required - out.additional.adopted);
    if (out.additional.shortfall) gaps.push({ kind: 'additional-shortfall', id: null, domain: d.code, count: out.additional.shortfall, priority: 2 });
    return out;
  });
  const order = new Map(bundle.controls.map((c, i) => [c.id, i]));
  const domOrder = new Map(bundle.domains.map((d, i) => [d.code, i]));
  gaps.sort((x, y) => x.priority - y.priority || (domOrder.get(x.domain) - domOrder.get(y.domain)) || ((order.get(x.id) ?? -1) - (order.get(y.id) ?? -1)));
  const totals = domains.reduce((t, d) => {
    for (const k of Object.keys(t.baseline)) t.baseline[k] += d.baseline[k];
    t.additional.adopted += d.additional.adopted;
    t.additional.required += d.additional.required;
    if (d.additional.shortfall) t.domainsShort += 1;
    if (d.na) t.domainsNa += 1;
    return t;
  }, { baseline: { total: 0, implemented: 0, partial: 0, missing: 0, unassessed: 0, na: 0 }, additional: { adopted: 0, required: 0 }, domainsShort: 0, domainsNa: 0 });
  const b = totals.baseline;
  const readiness = req.baseline && b.total ? Math.round(((b.implemented + b.partial / 2) / b.total) * 100) : null;
  return {
    ratings: a.ratings,
    aggregate: agg,
    label: confidentialityLabel(bundle.classification, a.ratings),
    requirement: req,
    readiness,
    totals,
    domains,
    gaps,
    warnings: errors,
  };
}

export function searchControls(bundle, query, opts = {}) {
  const idx = indexBundle(bundle);
  const q = arabicFold(String(query || '')).trim();
  // Arabic terms match without a leading definite article or attached preposition, so the article never blocks a match.
  const terms = q.split(/\s+/).filter(Boolean).map((w) => (w.length > 4 ? w.replace(/^(\u0648\u0627\u0644|\u0628\u0627\u0644|\u0643\u0627\u0644|\u0641\u0627\u0644|\u0644\u0644|\u0627\u0644)/, '') : w));
  const exact = normalizeId(query);
  const domain = opts.domain ? String(opts.domain).toUpperCase() : null;
  return bundle.controls.filter((c) => {
    if (domain && c.domain !== domain) return false;
    if (typeof opts.baseline === 'boolean' && c.baseline !== opts.baseline) return false;
    if (!terms.length) return true;
    if (exact && c.id === exact) return true;
    const hay = idx.hay.get(c.id);
    return terms.every((t) => hay.includes(t));
  });
}

export function normalizeIsoRef(bundle, raw) {
  const idx = indexBundle(bundle);
  const s = String(raw ?? '').trim().replace(/^annex\s*/i, 'A.').replace(/^a\s*\.?\s*/i, 'A.').replace(/\s+/g, '');
  if (idx.iso.has(s)) return s;
  if (idx.iso.has(`A.${s}`)) return `A.${s}`;
  return null;
}

export function crosswalk(bundle, framework, id) {
  const idx = indexBundle(bundle);
  if (framework === 'nia') {
    const c = idx.controls.get(normalizeId(id));
    if (!c) return null;
    return { framework, id: c.id, iso: c.iso.map((r) => idx.iso.get(r)), csf: c.csf.map((r) => idx.csf.get(r)) };
  }
  if (framework === 'iso27001') {
    const ref = normalizeIsoRef(bundle, id);
    if (!ref) return null;
    return { framework, id: ref, item: idx.iso.get(ref), nia: idx.isoRev.get(ref) || [] };
  }
  if (framework === 'csf2') {
    const key = String(id ?? '').trim().toUpperCase();
    if (idx.csf.has(key)) return { framework, id: key, item: idx.csf.get(key), nia: idx.csfRev.get(key) || [] };
    if (idx.csfCat.has(key)) {
      const subs = bundle.csf.subcategories.filter((s) => s.category === key);
      const nia = [...new Set(subs.flatMap((s) => idx.csfRev.get(s.id) || []))];
      return { framework, id: key, item: idx.csfCat.get(key), subcategories: subs.map((s) => ({ id: s.id, nia: idx.csfRev.get(s.id) || [] })), nia };
    }
    return null;
  }
  return null;
}
