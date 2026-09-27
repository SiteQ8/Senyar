#!/usr/bin/env node
// MCP server (stdio, newline-delimited JSON-RPC 2.0) for Qatar's National Information Assurance Standard v2.1.
// No dependencies. All tools are read-only and work offline from the bundled data.
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import * as core from '../docs/assets/core.js';

const bundle = JSON.parse(readFileSync(new URL('../docs/data/bundle.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const idx = core.indexBundle(bundle);
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const NIA_URL = bundle.sources.find((s) => s.id === 'nia').url;

const LANG = { type: 'string', enum: ['en', 'ar'], default: 'en', description: 'Language for summaries and names: en or ar.' };
const FORMAT = { type: 'string', enum: ['markdown', 'json'], default: 'markdown', description: 'markdown for reading, json for further processing.' };
const LIMIT = { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum items to return.' };
const OFFSET = { type: 'integer', minimum: 0, default: 0, description: 'Items to skip, for paging.' };
const RATING = (max, name) => ({ type: 'integer', minimum: 0, maximum: max, description: `${name} rating from the National Data Classification Policy, 0 to ${max}.` });
const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const tools = [
  {
    name: 'nia_list_domains',
    title: 'List NIA domains',
    description: 'List the 26 domains of the NIA Standard v2.1 with their codes, names and counts of baseline and additional controls.',
    inputSchema: { type: 'object', properties: { lang: LANG, response_format: FORMAT }, additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'nia_get_control',
    title: 'Get one NIA control',
    description: 'Get a control by ID (for example "AM 19", "am19" or "AM-19"): summary, domain, baseline mark, classification condition, official page, ISO/IEC 27001:2022 and NIST CSF 2.0 mappings, related PDPPL obligations and source notes. Summaries are this project\'s own words; the official text is at the page given.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'Control ID such as "IM 8".' }, lang: LANG, response_format: FORMAT }, required: ['id'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'nia_search_controls',
    title: 'Search NIA controls',
    description: 'Search control summaries in English and Arabic, IDs and mapped references. Every word must match. Filter by domain code or baseline mark. Paged.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find, in English or Arabic. Empty returns all controls.' },
        domain: { type: 'string', description: 'Two-letter domain code such as "NS".' },
        baseline: { type: 'boolean', description: 'true for baseline controls only, false for additional controls only.' },
        limit: LIMIT, offset: OFFSET, lang: LANG, response_format: FORMAT,
      },
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'nia_classify',
    title: 'Classify a scope',
    description: 'Turn confidentiality, integrity and availability ratings into the confidentiality label, the aggregate level (Low, Medium, High) and what the Standard requires: baseline controls and how many additional controls per applicable domain.',
    inputSchema: { type: 'object', properties: { c: RATING(4, 'Confidentiality'), i: RATING(3, 'Integrity'), a: RATING(3, 'Availability'), lang: LANG, response_format: FORMAT }, required: ['c', 'i', 'a'], additionalProperties: false },
    annotations: RO,
  },
  {
    name: 'nia_applicable_controls',
    title: 'Controls that apply to a scope',
    description: 'For given ratings, list per domain how many baseline controls apply and how many additional controls must be adopted, and list the controls (optionally for one domain) with whether their written classification condition is triggered. Paged.',
    inputSchema: {
      type: 'object',
      properties: {
        c: RATING(4, 'Confidentiality'), i: RATING(3, 'Integrity'), a: RATING(3, 'Availability'),
        domain: { type: 'string', description: 'Limit the control list to one domain code.' },
        not_applicable_domains: { type: 'array', items: { type: 'string' }, description: 'Domain codes that do not apply to this scope.' },
        limit: LIMIT, offset: OFFSET, lang: LANG, response_format: FORMAT,
      },
      required: ['c', 'i', 'a'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'nia_crosswalk',
    title: 'Crosswalk between frameworks',
    description: 'Map in either direction. framework "nia" with a control ID returns its ISO/IEC 27001:2022 and NIST CSF 2.0 references. framework "iso27001" with "A.5.15" (Annex A) or "6.1.2" (clause) returns the NIA controls mapped to it. framework "csf2" with a subcategory ("PR.AA-05") or category ("PR.AA") returns the NIA controls mapped to it. The mapping is this project\'s analysis, not an official NCSA mapping.',
    inputSchema: {
      type: 'object',
      properties: { framework: { type: 'string', enum: ['nia', 'iso27001', 'csf2'] }, id: { type: 'string' }, lang: LANG, response_format: FORMAT },
      required: ['framework', 'id'],
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'nia_pdppl_obligations',
    title: 'PDPPL obligations',
    description: 'List obligations under Qatar\'s Law No. 13 of 2016 on Protecting Personal Data Privacy, with article numbers, penalty tier and related NIA controls. Filter by article number or words.',
    inputSchema: {
      type: 'object',
      properties: { article: { type: 'integer', minimum: 1, maximum: 32 }, query: { type: 'string' }, lang: LANG, response_format: FORMAT },
      additionalProperties: false,
    },
    annotations: RO,
  },
  {
    name: 'nia_gap_report',
    title: 'Gap report for an assessment',
    description: 'Evaluate an assessment object saved by the web app (schema "nia-assessment/1"): readiness, baseline status, additional-control shortfalls per domain and a prioritized gap list. Paged over gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        assessment: { type: 'object', description: 'The JSON saved by the site: { schema, ratings: {C,I,A}, domains: {...}, controls: { "IG 1": { status, adopted, note } } }.' },
        limit: LIMIT, offset: OFFSET, lang: LANG, response_format: FORMAT,
      },
      required: ['assessment'],
      additionalProperties: false,
    },
    annotations: RO,
  },
];

class ToolError extends Error {}
const L = (o, lang) => (o ? o[lang] ?? o.en : '');
const pickLang = (args) => (args.lang === 'ar' ? 'ar' : 'en');
const page = (list, args) => {
  const limit = Math.min(Math.max(Number.parseInt(args.limit ?? 20, 10) || 20, 1), 100);
  const offset = Math.max(Number.parseInt(args.offset ?? 0, 10) || 0, 0);
  const items = list.slice(offset, offset + limit);
  return { total: list.length, count: items.length, offset, items, has_more: offset + items.length < list.length, next_offset: offset + items.length < list.length ? offset + items.length : null };
};
const ratingsOf = (args) => {
  for (const k of ['c', 'i', 'a']) if (args[k] === undefined) throw new ToolError(`Missing rating "${k}". Give c (0 to 4), i (0 to 3) and a (0 to 3).`);
  return core.clampRatings({ C: args.c, I: args.i, A: args.a });
};
const domainCode = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null;
  const code = String(raw).trim().toUpperCase();
  if (!idx.domains.has(code)) throw new ToolError(`Unknown domain "${raw}". Use one of: ${bundle.domains.map((d) => d.code).join(', ')}.`);
  return code;
};

function controlView(c, lang, extra = {}) {
  const d = idx.domains.get(c.domain);
  const sub = d.subsections.find((s) => s.key === c.sub);
  return {
    id: c.id,
    domain: { code: d.code, name: L(d, lang) },
    subsection: sub ? L(sub, lang) : null,
    baseline: c.baseline,
    baseline_items: c.baselineItems || [],
    summary: L(c, lang),
    condition: c.cond,
    official_page: c.page,
    official_url: `${NIA_URL}#page=${c.page}`,
    printed_id: c.printed || c.id,
    iso27001: c.iso.map((r) => ({ ref: r, title: L(idx.iso.get(r), lang) })),
    csf2: c.csf.map((r) => ({ id: r, outcome: L(idx.csf.get(r), lang) })),
    pdppl: (c.pdppl || []).map((p) => ({ id: p, title: L(idx.pdppl.get(p).title, lang) })),
    source_notes: (c.notes || []).map((n) => L(idx.notes.get(n), lang)),
    ...extra,
  };
}
const line = (c, lang) => `- **${c.id}**${c.baseline ? ' (baseline)' : ''}: ${L(c, lang)}`;

function result(obj, markdown, args) {
  const text = args.response_format === 'json' ? JSON.stringify(obj, null, 2) : markdown;
  return { content: [{ type: 'text', text }], structuredContent: obj };
}

const handlers = {
  nia_list_domains(args) {
    const lang = pickLang(args);
    const domains = bundle.domains.map((d) => ({ code: d.code, name: L(d, lang), part: L(bundle.parts[d.part], lang), controls: d.counts.total, baseline: d.counts.baseline, additional: d.counts.additional }));
    const md = [`# NIA Standard v2.1 domains (${domains.length})`, '', ...domains.map((d) => `- **${d.code}** ${d.name}: ${d.controls} controls, ${d.baseline} baseline, ${d.additional} additional`)].join('\n');
    return result({ domains }, md, args);
  },

  nia_get_control(args) {
    const lang = pickLang(args);
    const id = core.normalizeId(args.id);
    const c = id && idx.controls.get(id);
    if (!c) throw new ToolError(`No control "${args.id}". IDs look like "IM 8" or "AM 19"; use nia_search_controls to find one.`);
    const v = controlView(c, lang);
    const md = [
      `## ${v.id}: ${v.domain.name}${v.subsection ? `, ${v.subsection}` : ''}`,
      '',
      v.summary,
      '',
      `- Baseline: ${v.baseline ? 'yes' : 'no'}${v.baseline_items.length ? ` (baseline sub-items: ${v.baseline_items.join(', ')})` : ''}`,
      v.condition ? `- Classification condition in the text: ${v.condition}` : null,
      `- Official text: page ${v.official_page} of NCSA's NIA Standard v2.1 (${v.official_url})`,
      v.printed_id !== v.id ? `- Printed in the official text as ${v.printed_id}` : null,
      `- ISO/IEC 27001:2022: ${v.iso27001.map((x) => `${x.ref} ${x.title}`).join('; ') || 'none'}`,
      `- NIST CSF 2.0: ${v.csf2.map((x) => x.id).join(', ') || 'none'}`,
      v.pdppl.length ? `- PDPPL: ${v.pdppl.map((x) => `${x.id} ${x.title}`).join('; ')}` : null,
      ...v.source_notes.map((n) => `- Source note: ${n}`),
    ].filter((x) => x !== null).join('\n');
    return result(v, md, args);
  },

  nia_search_controls(args) {
    const lang = pickLang(args);
    const domain = domainCode(args.domain);
    const found = core.searchControls(bundle, args.query || '', { domain, baseline: typeof args.baseline === 'boolean' ? args.baseline : undefined });
    const p = page(found, args);
    const out = { ...p, items: p.items.map((c) => ({ id: c.id, domain: c.domain, baseline: c.baseline, summary: L(c, lang) })) };
    const md = [`Found ${p.total} controls${p.total ? `, showing ${p.offset + 1} to ${p.offset + p.count}` : ''}.`, '', ...p.items.map((c) => line(c, lang)), p.has_more ? `\nMore available: call again with offset ${p.next_offset}.` : ''].join('\n');
    return result(out, md, args);
  },

  nia_classify(args) {
    const lang = pickLang(args);
    const r = ratingsOf(args);
    const agg = core.aggregate(bundle.classification, r);
    const req = core.requirement(r);
    const label = core.confidentialityLabel(bundle.classification, r);
    const out = {
      ratings: r,
      label: { code: label.code, name: L(label, lang) },
      aggregate: agg ? { code: agg, name: L(bundle.classification.aggregate[agg], lang) } : null,
      requirement: { ...req, text: L(bundle.classification.rules[req.rule], lang) },
    };
    const md = [
      `Ratings C${r.C} I${r.I} A${r.A}`,
      `- Confidentiality label: ${label.code} ${out.label.name}`,
      `- Aggregate level: ${out.aggregate ? out.aggregate.name : 'none'}`,
      `- Requirement: ${out.requirement.text}`,
    ].join('\n');
    return result(out, md, args);
  },

  nia_applicable_controls(args) {
    const lang = pickLang(args);
    const r = ratingsOf(args);
    const agg = core.aggregate(bundle.classification, r);
    const req = core.requirement(r);
    const naSet = new Set((args.not_applicable_domains || []).map((x) => domainCode(x)));
    const one = domainCode(args.domain);
    const domains = bundle.domains.map((d) => ({
      code: d.code,
      name: L(d, lang),
      applicable: !naSet.has(d.code),
      baseline_controls: naSet.has(d.code) || !req.baseline ? 0 : d.counts.baseline,
      additional_available: d.counts.additional,
      additional_required: naSet.has(d.code) ? 0 : Math.min(req.additionalPerDomain, d.counts.additional),
    }));
    const list = bundle.controls
      .filter((c) => !naSet.has(c.domain) && (!one || c.domain === one))
      .map((c) => ({ id: c.id, domain: c.domain, baseline: c.baseline, required: c.baseline && req.baseline, condition: c.cond, condition_met: core.conditionMet(c.cond, r, agg), summary: L(c, lang) }));
    const p = page(list, args);
    const out = { ratings: r, aggregate: agg, requirement: { ...req, text: L(bundle.classification.rules[req.rule], lang) }, domains, controls: p };
    const md = [
      `Ratings C${r.C} I${r.I} A${r.A}, aggregate ${agg ?? 'none'}.`,
      out.requirement.text,
      '',
      '| Domain | Baseline | Additional required |',
      '| --- | --- | --- |',
      ...domains.filter((d) => d.applicable).map((d) => `| ${d.code} ${d.name} | ${d.baseline_controls} | ${d.additional_required} |`),
      '',
      `Controls ${p.total ? `${p.offset + 1} to ${p.offset + p.count}` : '0'} of ${p.total}:`,
      ...p.items.map((c) => `- **${c.id}**${c.baseline ? ' (baseline)' : ''}${c.condition ? ` [${c.condition}: ${c.condition_met === null ? 'depends on risk rating' : c.condition_met ? 'triggered' : 'not triggered'}]` : ''}: ${c.summary}`),
      p.has_more ? `\nMore available: call again with offset ${p.next_offset}.` : '',
    ].join('\n');
    return result(out, md, args);
  },

  nia_crosswalk(args) {
    const lang = pickLang(args);
    const x = core.crosswalk(bundle, args.framework, args.id);
    if (!x) throw new ToolError(`Nothing found for ${args.framework} "${args.id}". Examples: nia "AM 19", iso27001 "A.5.17" or "6.1.2", csf2 "PR.AA-01" or "PR.AA".`);
    if (args.framework === 'nia') {
      const out = { framework: 'nia', id: x.id, iso27001: x.iso.map((i) => ({ ref: i.ref, title: L(i, lang) })), csf2: x.csf.map((s) => ({ id: s.id, outcome: L(s, lang) })) };
      const md = [`${x.id} maps to:`, ...out.iso27001.map((i) => `- ISO/IEC 27001:2022 ${i.ref} ${i.title}`), ...out.csf2.map((s) => `- NIST CSF 2.0 ${s.id}: ${s.outcome}`)].join('\n');
      return result(out, md, args);
    }
    const controls = x.nia.map((id) => ({ id, summary: L(idx.controls.get(id), lang) }));
    const out = { framework: args.framework, id: x.id, title: L(x.item, lang), nia_controls: controls, ...(x.subcategories ? { subcategories: x.subcategories } : {}) };
    const md = [`${x.id} ${out.title}`, '', controls.length ? `NIA controls mapped (${controls.length}):` : 'No NIA control is mapped to this reference.', ...controls.map((c) => `- **${c.id}**: ${c.summary}`)].join('\n');
    return result(out, md, args);
  },

  nia_pdppl_obligations(args) {
    const lang = pickLang(args);
    const q = core.arabicFold(args.query || '').trim();
    const list = bundle.pdppl.obligations.filter((o) => (!args.article || o.articles.includes(Number(args.article)))
      && (!q || q.split(/\s+/).every((w) => core.arabicFold(`${o.id} ${o.title.en} ${o.title.ar} ${o.en} ${o.ar}`).includes(w))));
    const items = list.map((o) => ({
      id: o.id, articles: o.articles, title: L(o.title, lang), summary: L(o, lang),
      penalty: o.penalty ? L(bundle.pdppl.penalties[o.penalty], lang) : null,
      guideline: o.guideline || null, nia_controls: o.nia,
    }));
    const md = [`${items.length} obligations under Law No. 13 of 2016 (summaries; the Arabic Official Gazette text is authoritative).`, '', ...items.map((o) => `- **${o.id}** ${o.title} (Article ${o.articles.join(', ')}): ${o.summary}${o.penalty ? ` Penalty: ${o.penalty}.` : ''}${o.nia_controls.length ? ` NIA: ${o.nia_controls.join(', ')}.` : ''}`)].join('\n');
    return result({ total: items.length, items }, md, args);
  },

  nia_gap_report(args) {
    const lang = pickLang(args);
    const a = args.assessment;
    if (!a || typeof a !== 'object') throw new ToolError('Pass the assessment object saved by the web app.');
    if (a.schema !== core.SCHEMA) throw new ToolError(`The assessment must have schema "${core.SCHEMA}". Save it from the site's Report tab.`);
    const ev = core.evaluate(bundle, a);
    const gapsAll = ev.gaps.map((g) => ({ ...g, text: g.id ? L(idx.controls.get(g.id), lang) : L(idx.domains.get(g.domain), lang) }));
    const p = page(gapsAll, args);
    const out = { ratings: ev.ratings, aggregate: ev.aggregate, requirement: ev.requirement, readiness: ev.readiness, totals: ev.totals, domains: ev.domains, gaps: p, warnings: ev.warnings };
    const b = ev.totals.baseline;
    const kind = { 'baseline-missing': 'baseline not implemented', 'baseline-partial': 'baseline partial', 'baseline-unassessed': 'baseline not assessed', 'additional-shortfall': 'additional controls to adopt', 'adopted-open': 'adopted additional not fully implemented', 'na-unjustified': 'not applicable without a reason' };
    const md = [
      `Assessment at C${ev.ratings.C} I${ev.ratings.I} A${ev.ratings.A}, aggregate ${ev.aggregate ?? 'none'}.`,
      ev.requirement.baseline ? `Baseline implemented ${b.implemented} of ${b.total}${ev.readiness !== null ? ` (readiness ${ev.readiness}%)` : ''}; partial ${b.partial}; not implemented ${b.missing}; not assessed ${b.unassessed}.` : 'No baseline controls are required at these ratings.',
      `Domains short of additional controls: ${ev.totals.domainsShort}.`,
      ev.warnings.length ? `Warnings: ${ev.warnings.join(' ')}` : '',
      '',
      `Gaps ${p.total ? `${p.offset + 1} to ${p.offset + p.count}` : '0'} of ${p.total}:`,
      ...p.items.map((g) => `- P${g.priority} ${kind[g.kind]}${g.count ? ` (${g.count})` : ''}: ${g.id ?? g.domain} ${g.text}`),
      p.has_more ? `\nMore available: call again with offset ${p.next_offset}.` : '',
    ].join('\n');
    return result(out, md, args);
  },
};

function send(msg) { process.stdout.write(`${JSON.stringify(msg)}\n`); }
const reply = (id, res) => send({ jsonrpc: '2.0', id, result: res });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    if (msg && msg.id !== undefined && msg.id !== null) fail(msg.id, -32600, 'Invalid request');
    return;
  }
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // notifications need no reply
  switch (method) {
    case 'initialize': {
      const asked = params?.protocolVersion;
      reply(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: pkg.name, title: `${bundle.project.name_en} MCP server`, version: pkg.version },
        instructions: 'Read-only tools for Qatar\'s National Information Assurance Standard v2.1 (NCSA): controls and their summaries, classification rules, a crosswalk to ISO/IEC 27001:2022 and NIST CSF 2.0, PDPPL obligations, and gap reports for assessments saved by the web app. Summaries and mappings are this project\'s own work; cite the official page returned with each control.',
      });
      return;
    }
    case 'ping': reply(id, {}); return;
    case 'tools/list': reply(id, { tools }); return;
    case 'tools/call': {
      const h = handlers[params?.name];
      if (!h) { fail(id, -32602, `Unknown tool: ${params?.name}`); return; }
      try {
        reply(id, h(params.arguments || {}));
      } catch (e) {
        const text = e instanceof ToolError ? e.message : 'The tool failed on this input. Check the arguments against the tool schema.';
        if (!(e instanceof ToolError)) process.stderr.write(`tool ${params.name} failed: ${e.stack}\n`);
        reply(id, { isError: true, content: [{ type: 'text', text }] });
      }
      return;
    }
    default: fail(id, -32601, `Method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (text) => {
  if (!text.trim()) return;
  let msg;
  try { msg = JSON.parse(text); } catch { fail(null, -32700, 'Parse error'); return; }
  if (Array.isArray(msg)) { for (const m of msg) handle(m); return; }
  handle(msg);
});
rl.on('close', () => process.exit(0));
