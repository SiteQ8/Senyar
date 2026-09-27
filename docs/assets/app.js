import * as core from './core.js';
import { buildXlsx } from './xlsx.js';

const LS_KEY = 'nia-register:v1';
const LANG_KEY = 'nia-register:lang';
const TABS = ['register', 'crosswalk', 'pdppl', 'report', 'about'];
const LETTERS_AR = { a: 'أ', b: 'ب', c: 'ج', d: 'د' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const idAttr = (id) => id.replace(' ', '-');

const state = {
  b: null, idx: null, lang: 'ar', tab: 'register', filter: 'all', query: '',
  cw: 'iso', cwQuery: '', a: core.emptyAssessment(), storage: true,
};

function lsGet(k) { try { return window.localStorage.getItem(k); } catch { state.storage = false; return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, v); } catch { state.storage = false; } }
function lsDel(k) { try { window.localStorage.removeItem(k); } catch { state.storage = false; } }

function t(key, vars = {}) {
  const e = state.b.ui[key];
  let s = e ? (e[state.lang] ?? e.en) : key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
const L = (o) => (o ? (o[state.lang] ?? o.en) : '');
const nameOf = () => (state.lang === 'ar' ? state.b.project.name_ar : state.b.project.name_en);
const fmtDate = (d = new Date()) => d.toLocaleDateString(state.lang === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
const stamp = () => new Date().toISOString().slice(0, 10);
const currentEval = () => core.evaluate(state.b, state.a);
const itemsText = (items) => items.map((x) => `(${state.lang === 'ar' ? LETTERS_AR[x] || x : x})`).join(state.lang === 'ar' ? ' و' : ' and ');

let saveTimer = 0;
function save() {
  state.a.updated = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => lsSet(LS_KEY, JSON.stringify(state.a)), 250);
}
function ctlState(id) { return state.a.controls[id] || {}; }
function setCtl(id, patch) {
  const cur = { ...ctlState(id), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] === undefined || cur[k] === '' || cur[k] === false) delete cur[k];
  if (Object.keys(cur).length) state.a.controls[id] = cur; else delete state.a.controls[id];
  save();
}
function setDomain(code, patch) {
  const cur = { ...(state.a.domains[code] || {}), ...patch };
  if (!cur.na && !cur.note) delete state.a.domains[code];
  else state.a.domains[code] = { na: !!cur.na, note: cur.note || '' };
  save();
}

function condText(cond) {
  return cond.split('|').map((p) => {
    const m = /^(C|I|A|AGG|RISK)>=(\w)$/.exec(p);
    if (!m) return p;
    if (m[1] === 'AGG') return t(m[2] === 'H' ? 'cond.aggH' : 'cond.aggM');
    if (m[1] === 'RISK') return t('cond.riskM');
    return t('cond.andAbove', { x: `${m[1]}${m[2]}` });
  }).join(t('cond.or'));
}
const gapText = (g) => (g.kind === 'additional-shortfall' ? t('gap.additional-shortfall', { n: g.count }) : t(`gap.${g.kind}`));

/* Chrome */
function renderChrome() {
  const ar = state.lang === 'ar';
  document.documentElement.lang = state.lang;
  document.documentElement.dir = ar ? 'rtl' : 'ltr';
  document.title = `${nameOf()} | ${t('tagline')}`;
  $('#skip').textContent = t('skip');
  $('#app-name').textContent = nameOf();
  const alt = $('#alt-name');
  alt.textContent = ar ? state.b.project.name_en : state.b.project.name_ar;
  alt.lang = ar ? 'en' : 'ar';
  $('#tagline').textContent = t('tagline');
  $('#source-line').textContent = t('mast.source');
  $('#tabs').setAttribute('aria-label', t('tabs.label'));
  $('#tabbar').setAttribute('aria-label', t('tabs.label'));
  for (const tab of TABS) $(`#tab-${tab}`).textContent = t(`tab.${tab}`);
  const lt = $('#lang-toggle');
  lt.textContent = t('lang.switch');
  lt.setAttribute('aria-label', t('lang.switchLabel'));
  lt.lang = ar ? 'en' : 'ar';
  $('#footer-license').textContent = t('footer.license');
  const code = $('#footer-code');
  code.textContent = t('about.code');
  code.href = `https://github.com/${state.b.project.owner}/${state.b.project.repo}`;
  const std = $('#footer-std');
  std.textContent = t('footer.standard');
  std.href = state.b.sources.find((s) => s.id === 'nia').url;
  $('#footer-ver').textContent = t('footer.version', { v: state.b.project.version });
}

function renderMini() {
  const ev = currentEval();
  const m = $('#mini');
  if (!ev.requirement.baseline) { m.innerHTML = `<span class="mini-hint">${esc(t('mini.rate'))}</span>`; return; }
  const pct = ev.readiness ?? 0;
  m.innerHTML = `<span class="mini-k">${esc(t('mini.readiness'))}</span><progress max="100" value="${pct}" aria-hidden="true"></progress><span class="mini-v">${pct}%</span><span class="mini-s${state.storage ? '' : ' warn'}">${esc(t(state.storage ? 'mini.saved' : 'mini.unsaved'))}</span>`;
}

/* Scope */
function renderScope() {
  const b = state.b;
  const r = state.a.ratings;
  const agg = core.aggregate(b.classification, r);
  const req = core.requirement(r);
  const lab = core.confidentialityLabel(b.classification, r);
  const ev = currentEval();
  const addReq = ev.domains.reduce((sum, d) => sum + d.additional.required, 0);
  const bTotal = ev.totals.baseline.total;
  const total = req.baseline ? `<div><dt>${esc(t('scope.toImplement'))}</dt><dd>${esc(addReq ? t('scope.total', { b: bTotal, a: addReq }) : t('scope.totalBase', { b: bTotal }))}</dd></div>` : '';
  const rows = b.classification.attributes.map((at) => {
    const btns = Array.from({ length: at.max + 1 }, (_, v) => {
      const tip = at.key === 'C' ? ` title="${esc(L(b.classification.labels[`C${v}`]))}"` : '';
      return `<button type="button" class="seg-btn" data-rate="${at.key}" data-val="${v}" aria-pressed="${r[at.key] === v}" aria-label="${esc(L(at))} ${v}"${tip}>${at.key}${v}</button>`;
    }).join('');
    return `<div class="rating"><span class="rating-name" id="rn-${at.key}">${esc(L(at))}</span><div class="seg" role="group" aria-labelledby="rn-${at.key}">${btns}</div></div>`;
  }).join('');
  const rules = [L(b.classification.rules[req.rule])];
  if (req.baseline) rules.push(L(b.classification.rules.priority));
  if (r.C === 4) rules.push(L(b.classification.rules.c4));
  $('#scope').innerHTML = `
    <div class="scope-head"><h2>${esc(t('scope.title'))}</h2><p>${esc(t('scope.help'))}</p></div>
    <div class="scope-body">
      <div class="ratings">${rows}</div>
      <dl class="verdict">
        <div><dt>${esc(t('scope.label'))}</dt><dd><span class="code">${lab.code}</span> ${esc(L(lab))}</dd></div>
        <div><dt>${esc(t('scope.aggregate'))}</dt><dd class="level level-${agg || 'none'}">${esc(agg ? L(b.classification.aggregate[agg]) : t('scope.none'))}</dd></div>
        ${total}
        <div class="req"><dt>${esc(t('scope.requires'))}</dt><dd>${rules.map((x) => `<p>${esc(x)}</p>`).join('')}</dd></div>
      </dl>
    </div>`;
}

/* Domain index */
function renderIndex() {
  const b = state.b;
  const ev = currentEval();
  const byCode = new Map(ev.domains.map((d) => [d.code, d]));
  const groups = Object.keys(b.parts).map((part) => {
    const items = b.domains.filter((d) => d.part === part).map((d) => {
      const e = byCode.get(d.code);
      const done = e.baseline.implemented + e.baseline.partial / 2;
      const short = e.additional.shortfall > 0;
      const tip = e.na ? t('rep.domainNa') : t('index.tip', { n: e.baseline.implemented, total: e.baseline.total }) + (e.additional.required ? t('index.tipAdd', { a: e.additional.adopted, req: e.additional.required }) : '');
      return `<li><a href="#d-${d.code}" data-domain="${d.code}" class="${e.na ? 'is-na' : ''}" title="${esc(tip)}"><span class="dcode">${d.code}</span><span class="dname">${esc(L(d))}</span><progress max="${Math.max(e.baseline.total, 1)}" value="${done}" aria-hidden="true"></progress><span class="${short ? 'dflag' : 'dflag is-off'}" aria-hidden="true"></span></a></li>`;
    }).join('');
    return `<h3>${esc(L(b.parts[part]))}</h3><ol>${items}</ol>`;
  }).join('');
  const opts = `<option value="">${esc(t('index.all'))}</option>${b.domains.map((d) => `<option value="${d.code}">${d.code} ${esc(L(d))}</option>`).join('')}`;
  const nav = $('#dindex');
  nav.setAttribute('aria-label', t('index.title'));
  nav.innerHTML = `<h2>${esc(t('index.title'))}</h2><label class="sr" for="dselect">${esc(t('index.title'))}</label><select id="dselect" class="dselect">${opts}</select><div class="dgroups">${groups}</div>`;
}

/* Register */
function statusOptions(v) {
  const opts = [['', 'status.unassessed'], ['implemented', 'status.implemented'], ['partial', 'status.partial'], ['missing', 'status.missing'], ['na', 'status.na']];
  return opts.map(([val, key]) => `<option value="${val}"${(v || '') === val ? ' selected' : ''}>${esc(t(key))}</option>`).join('');
}

function controlHtml(c, agg) {
  const st = ctlState(c.id);
  const a = idAttr(c.id);
  const nia = state.b.sources.find((s) => s.id === 'nia');
  const cls = ['ctl', c.baseline ? 'is-base' : 'is-add', `s-${st.status || 'unassessed'}`];
  const meta = [];
  if (c.cond) {
    const on = core.conditionMet(c.cond, state.a.ratings, agg);
    const key = on === null ? 'cond.risk' : on ? 'cond.on' : 'cond.off';
    meta.push(`<span class="cond ${on === null ? 'is-risk' : on ? 'is-on' : 'is-off'}">${esc(t('cond.applies', { cond: condText(c.cond) }))}<em>${esc(t(key))}</em></span>`);
  }
  if (c.baselineItems) meta.push(`<span class="items">${esc(t('badge.items', { items: itemsText(c.baselineItems) }))}</span>`);
  meta.push(`<a class="page" href="${esc(nia.url)}#page=${c.page}" target="_blank" rel="noopener">${esc(t('official.page', { p: c.page }))}</a>`);
  const notes = (c.notes || []).map((nid) => `<details class="snote"><summary>${esc(t('source.note'))}</summary><p>${esc(L(state.idx.notes.get(nid)))}</p></details>`).join('');
  const refs = [
    ...c.iso.map((r) => `<span class="chip iso" title="${esc(L(state.idx.iso.get(r)))}">${r.startsWith('A.') ? r : `ISO ${r}`}</span>`),
    ...c.csf.map((r) => `<span class="chip csf" title="${esc(L(state.idx.csf.get(r)))}">${r}</span>`),
    ...(c.pdppl || []).map((p) => `<button type="button" class="chip pd" data-goto-pd="${p}" title="${esc(L(state.idx.pdppl.get(p).title))}">${p}</button>`),
  ].join('');
  const adopt = c.baseline ? '' : `<label class="adopt"><input type="checkbox" data-adopt="${c.id}"${st.adopted ? ' checked' : ''}> ${esc(t('adopt.label'))}</label>`;
  const needReason = st.status === 'na' && !st.note;
  const noteOpen = !!st.note || needReason;
  return `<article class="${cls.join(' ')}" id="c-${a}" data-id="${c.id}">
    <div class="ctl-id"><span class="cid">${c.id}</span><span class="badge">${esc(t(c.baseline ? 'badge.baseline' : 'badge.additional'))}</span></div>
    <div class="ctl-main"><p class="ctl-text">${esc(L(c))}</p><div class="ctl-meta">${meta.join('')}</div>${notes}<div class="ctl-refs">${refs}</div></div>
    <div class="ctl-state"><label class="sr" for="st-${a}">${esc(t('status.label'))} ${c.id}</label><select id="st-${a}" data-status="${c.id}">${statusOptions(st.status)}</select>${adopt}<button type="button" class="note-btn${st.note ? ' has-note' : ''}" data-note-toggle="${c.id}" aria-expanded="${noteOpen}" aria-controls="n-${a}">${esc(t('note.toggle'))}</button></div>
    <div class="ctl-note" id="n-${a}"${noteOpen ? '' : ' hidden'}><label class="sr" for="nt-${a}">${esc(t('note.toggle'))} ${c.id}</label><textarea id="nt-${a}" data-note="${c.id}" rows="3" placeholder="${esc(needReason ? t('note.needReason') : t('note.placeholder'))}">${esc(st.note || '')}</textarea></div>
  </article>`;
}

function domainHeadHtml(d, e) {
  const req = e.additional.required;
  const add = req || e.additional.adopted
    ? `<span class="${e.additional.shortfall ? 'is-short' : 'is-met'}">${esc(t('domain.additional', { n: e.additional.adopted, req }))}</span>` : '';
  return `<div class="dom-h">
    <h3><span class="dcode">${d.code}</span><span>${esc(L(d))}</span></h3>
    <p class="dom-obj">${esc(L(d.objective))}</p>
    <div class="dom-meta"><span>${esc(t('domain.baseline', { n: e.baseline.implemented, total: e.baseline.total }))}</span>${add}
      <label class="na-toggle"><input type="checkbox" data-domain-na="${d.code}"${e.na ? ' checked' : ''}> ${esc(t('domain.na'))}</label></div>
    <div class="dom-na-note"${e.na ? '' : ' hidden'}><label for="dn-${d.code}">${esc(t('domain.naReason'))}</label><textarea id="dn-${d.code}" data-domain-note="${d.code}" rows="2">${esc(state.a.domains[d.code]?.note || '')}</textarea></div>
  </div>`;
}

function renderRegister() {
  const b = state.b;
  const ev = currentEval();
  const byCode = new Map(ev.domains.map((d) => [d.code, d]));
  const filters = ['all', 'baseline', 'additional', 'open', 'unassessed']
    .map((f) => `<button type="button" class="seg-btn" data-filter="${f}" aria-pressed="${state.filter === f}">${esc(t(`filter.${f}`))}</button>`).join('');
  $('#rtools').innerHTML = `<label class="search"><span class="sr">${esc(t('search.label'))}</span><input id="q" type="search" autocomplete="off" aria-keyshortcuts="/" placeholder="${esc(t('search.placeholder'))}" value="${esc(state.query)}"></label>
    <div class="seg filters" role="group" aria-label="${esc(t('filter.label'))}">${filters}</div><p class="count" id="count" aria-live="polite"></p>`;
  $('#rows').innerHTML = b.domains.map((d) => {
    const list = state.idx.byDomain.get(d.code);
    const group = (items, head) => (items.length ? `<div class="subgroup">${head ? `<h4 class="sub-h">${esc(head)}</h4>` : ''}${items.map((c) => controlHtml(c, ev.aggregate)).join('')}</div>` : '');
    let body = group(list.filter((c) => !c.sub), '');
    for (const s of d.subsections) body += group(list.filter((c) => c.sub === s.key), L(s));
    return `<section class="dom${byCode.get(d.code).na ? ' is-na' : ''}" id="d-${d.code}" data-domain="${d.code}">${domainHeadHtml(d, byCode.get(d.code))}${body}</section>`;
  }).join('');
  $('#empty').textContent = t('empty.search');
  applyFilter();
}

function applyFilter() {
  const ids = new Set(core.searchControls(state.b, state.query).map((c) => c.id));
  const req = core.requirement(state.a.ratings);
  let shown = 0;
  for (const art of $$('#rows .ctl')) {
    const id = art.dataset.id;
    const c = state.idx.controls.get(id);
    const st = ctlState(id);
    const dna = !!state.a.domains[c.domain]?.na;
    let ok = ids.has(id);
    if (ok && state.filter === 'baseline') ok = c.baseline;
    if (ok && state.filter === 'additional') ok = !c.baseline;
    if (ok && state.filter === 'unassessed') ok = !dna && !st.status;
    if (ok && state.filter === 'open') {
      ok = !dna && ((c.baseline && req.baseline && st.status !== 'implemented' && st.status !== 'na')
        || (!c.baseline && st.adopted && (st.status === 'missing' || st.status === 'partial')));
    }
    art.hidden = !ok;
    if (ok) shown += 1;
  }
  for (const g of $$('#rows .subgroup')) g.hidden = !g.querySelector('.ctl:not([hidden])');
  for (const sec of $$('#rows .dom')) sec.hidden = !sec.querySelector('.ctl:not([hidden])');
  $('#count').textContent = t('count.showing', { n: shown, total: state.b.controls.length });
  $('#empty').hidden = shown > 0;
}

function refreshDomain(code) {
  const e = currentEval().domains.find((x) => x.code === code);
  const sec = document.getElementById(`d-${code}`);
  sec.querySelector('.dom-h').outerHTML = domainHeadHtml(state.idx.domains.get(code), e);
  sec.classList.toggle('is-na', e.na);
  renderIndex();
  renderMini();
}

function scrollToDomain(code) {
  let sec = document.getElementById(`d-${code}`);
  if (!sec) return;
  if (sec.hidden) { state.filter = 'all'; state.query = ''; renderRegister(); sec = document.getElementById(`d-${code}`); }
  sec.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
}

function flashEl(el) {
  if (!el) return;
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), 1600);
}

function goTo(id) {
  if (!state.idx.controls.has(id)) return;
  showTab('register');
  let el = document.getElementById(`c-${idAttr(id)}`);
  if (el.hidden || el.closest('.dom').hidden) {
    state.filter = 'all'; state.query = '';
    renderRegister();
    el = document.getElementById(`c-${idAttr(id)}`);
  }
  el.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  flashEl(el);
  el.querySelector('select').focus({ preventScroll: true });
}

/* Crosswalk */
function renderCrosswalkShell() {
  $('#cw-shell').innerHTML = `<div class="panel-head"><h2>${esc(t('tab.crosswalk'))}</h2><p>${esc(t('cw.intro'))}</p></div>
    <div class="cw-tools"><div class="seg" role="group" aria-label="${esc(t('tab.crosswalk'))}"><button type="button" class="seg-btn" data-cw="iso" aria-pressed="${state.cw === 'iso'}">ISO/IEC 27001:2022</button><button type="button" class="seg-btn" data-cw="csf" aria-pressed="${state.cw === 'csf'}">NIST CSF 2.0</button></div>
    <label class="search"><span class="sr">${esc(t('cw.filter'))}</span><input id="cwq" type="search" autocomplete="off" placeholder="${esc(t('cw.filter'))}" value="${esc(state.cwQuery)}"></label>
    <p class="count" id="cw-count"></p></div>`;
}

function renderCrosswalkList() {
  const b = state.b;
  const idx = state.idx;
  const q = core.arabicFold(state.cwQuery).trim();
  const match = (ref, item) => !q || core.arabicFold(`${ref} ${item.en} ${item.ar}`).includes(q);
  const row = (ref, item, nia) => `<div class="cw-row${nia.length ? '' : ' is-empty'}"><span class="cw-ref">${ref}</span><span class="cw-title">${esc(L(item))}</span><span class="cw-nia">${nia.length ? nia.map((id) => `<button type="button" class="chip" data-goto="${id}">${id}</button>`).join('') : `<em>${esc(t('cw.none'))}</em>`}</span></div>`;
  let body = '';
  let total = 0;
  let mapped = 0;
  if (state.cw === 'iso') {
    for (const [kind, key] of [['clause', 'cw.clauses'], ['annex', 'cw.annex']]) {
      const items = b.iso.filter((i) => i.kind === kind);
      total += items.length;
      mapped += items.filter((i) => idx.isoRev.has(i.ref)).length;
      const rows = items.filter((i) => match(i.ref, i)).map((i) => row(i.ref, i, idx.isoRev.get(i.ref) || [])).join('');
      if (rows) body += `<h3>${esc(t(key))}</h3>${rows}`;
    }
  } else {
    for (const f of b.csf.functions) {
      let fBody = '';
      for (const cat of b.csf.categories.filter((c) => c.id.startsWith(`${f.id}.`))) {
        const subs = b.csf.subcategories.filter((s) => s.category === cat.id);
        total += subs.length;
        mapped += subs.filter((s) => idx.csfRev.has(s.id)).length;
        const rows = subs.filter((s) => match(s.id, s) || match(cat.id, cat)).map((s) => row(s.id, s, idx.csfRev.get(s.id) || [])).join('');
        if (rows) fBody += `<h4><span class="cw-cat">${cat.id}</span> ${esc(L(cat))}</h4>${rows}`;
      }
      if (fBody) body += `<h3><span class="cw-cat">${f.id}</span> ${esc(L(f))}</h3>${fBody}`;
    }
  }
  $('#cw-list').innerHTML = body || `<p class="empty">${esc(t('empty.search'))}</p>`;
  $('#cw-count').textContent = t('cw.coverage', { n: mapped, total });
}

/* PDPPL */
function renderPdppl() {
  const b = state.b;
  const pd = b.pdppl;
  const src = new Map(b.sources.map((s) => [s.id, s]));
  const lawUrl = src.get('pdppl').url;
  const tl = b.deadlines.filter((d) => ['IM 8', 'P17', 'P22'].includes(d.ref))
    .map((d) => `<li><button type="button" class="chip" ${d.ref.startsWith('P') ? `data-goto-pd="${d.ref}"` : `data-goto="${d.ref}"`}>${d.ref}</button><span>${esc(L(d))}</span></li>`).join('');
  const items = pd.obligations.map((o) => {
    const arts = o.articles.length > 1 ? t('pd.articles', { a: o.articles.join(state.lang === 'ar' ? ' و' : ', ') }) : t('pd.article', { a: o.articles[0] });
    const pen = o.penalty ? L(pd.penalties[o.penalty]) : t('pd.penalty.none');
    const guide = o.guideline ? `<a href="${esc(src.get(o.guideline).url)}" target="_blank" rel="noopener">${esc(t('pd.guideline', { ref: o.guideline }))}</a>` : '';
    const nia = o.nia.length ? `<div class="obl-nia"><span>${esc(t('pd.related'))}</span>${o.nia.map((id) => `<button type="button" class="chip" data-goto="${id}">${id}</button>`).join('')}</div>` : '';
    return `<li class="obl" id="o-${o.id}"><div class="obl-h"><span class="oid">${o.id}</span><h3>${esc(L(o.title))}</h3><span class="topic">${esc(t(`pd.topic.${o.topic}`))}</span></div>
      <p>${esc(L(o))}</p><p class="obl-meta"><a href="${esc(lawUrl)}" target="_blank" rel="noopener">${esc(arts)}</a><span class="${o.penalty ? 'pen' : 'pen none'}">${esc(pen)}</span>${guide}</p>${nia}</li>`;
  }).join('');
  $('#panel-pdppl').innerHTML = `<div class="panel-head"><h2>${esc(t('tab.pdppl'))}</h2><p>${esc(t('pd.intro'))}</p></div>
    <div class="pd-grid"><ol class="obligations">${items}</ol><aside class="timeline"><h3>${esc(t('pd.timelines'))}</h3><ul>${tl}</ul></aside></div>`;
}

/* Report */
function renderReport() {
  const b = state.b;
  const idx = state.idx;
  const ev = currentEval();
  const r = ev.ratings;
  const bt = ev.totals.baseline;
  const tags = `${b.classification.attributes.map((at) => `<span class="rtag">${at.key}${r[at.key]}</span>`).join('')}<span class="rtag">${esc(L(ev.label))}</span><span class="rtag level-${ev.aggregate || 'none'}">${esc(ev.aggregate ? L(b.classification.aggregate[ev.aggregate]) : t('scope.none'))}</span>`;
  const ledger = ev.requirement.baseline ? `<dl class="ledger">
      <div><dt>${esc(t('rep.baselineDone'))}</dt><dd>${bt.implemented} <span class="of">${esc(t('rep.of'))} ${bt.total}</span>${ev.readiness !== null ? ` <small>${ev.readiness}%</small>` : ''}</dd></div>
      <div><dt>${esc(t('rep.baselineGaps'))}</dt><dd>${bt.missing + bt.partial}</dd></div>
      <div><dt>${esc(t('rep.shortDomains'))}</dt><dd>${ev.totals.domainsShort}</dd></div>
      <div><dt>${esc(t('rep.unassessed'))}</dt><dd>${bt.unassessed}</dd></div></dl>` : `<p class="muted">${esc(t('rep.noBaseline'))}</p>`;
  const rows = ev.domains.map((e) => {
    const d = idx.domains.get(e.code);
    const ok = !e.na && e.baseline.implemented === e.baseline.total && !e.additional.shortfall && (ev.requirement.baseline || !e.baseline.total);
    const add = e.additional.required ? `${e.additional.adopted} ${esc(t('rep.of'))} ${e.additional.required}` : `${e.additional.adopted}`;
    return `<tr><th scope="row"><span class="dcode">${d.code}</span> ${esc(L(d))}</th><td>${e.na ? '' : `<span class="cellbar"><progress max="${Math.max(e.baseline.total, 1)}" value="${e.baseline.implemented + e.baseline.partial / 2}" aria-hidden="true"></progress>${e.baseline.implemented} ${esc(t('rep.of'))} ${e.baseline.total}</span>`}</td><td>${e.na ? '' : add}</td><td class="${e.na ? 'na' : ok ? 'ok' : 'att'}">${esc(e.na ? t('rep.domainNa') : ok ? t('rep.ok') : t('rep.attention'))}</td></tr>`;
  }).join('');
  const dl = b.deadlines.map((d) => {
    const c = idx.controls.get(d.ref);
    const st = c ? (state.a.domains[c.domain]?.na ? 'na' : ctlState(c.id).status) : null;
    const ref = c ? `<button type="button" class="chip" data-goto="${d.ref}">${d.ref}</button>` : `<button type="button" class="chip" data-goto-pd="${d.ref}">${d.ref}</button>`;
    return `<tr><td>${ref}</td><td>${esc(L(d))}</td><td>${c ? esc(t(`status.${st || 'unassessed'}`)) : ''}</td></tr>`;
  }).join('');
  const LIMIT = 60;
  const gaps = ev.gaps.slice(0, LIMIT).map((g) => {
    const target = g.id
      ? `<button type="button" class="chip" data-goto="${g.id}">${g.id}</button><span class="gs">${esc(L(idx.controls.get(g.id)))}</span>`
      : `<span class="dcode">${g.domain}</span> ${esc(L(idx.domains.get(g.domain)))}`;
    return `<li class="gap p${g.priority}"><span class="gp">${esc(t('gap.priority', { p: g.priority }))}</span><div class="gdesc"><span class="gk">${esc(gapText(g))}</span>${target}</div></li>`;
  }).join('');
  const more = ev.gaps.length > LIMIT ? `<p class="muted">${esc(t('rep.more', { n: ev.gaps.length - LIMIT }))}</p>` : '';
  $('#panel-report').innerHTML = `<div class="rep">
    <header class="rep-head"><p class="print-name">${esc(nameOf())}</p><h2>${esc(t('rep.title'))}</h2><p>${esc(t('rep.generated', { date: fmtDate() }))}</p></header>
    <section><h3 class="sr">${esc(t('rep.scope'))}</h3><div class="rtags">${tags}</div><p class="muted">${esc(L(b.classification.rules[ev.requirement.rule]))}</p>${ledger}</section>
    <section><h3>${esc(t('rep.domains'))}</h3><div class="table-wrap"><table><thead><tr><th scope="col">${esc(t('rep.col.domain'))}</th><th scope="col">${esc(t('rep.col.baseline'))}</th><th scope="col">${esc(t('rep.col.additional'))}</th><th scope="col">${esc(t('rep.col.status'))}</th></tr></thead><tbody>${rows}</tbody></table></div></section>
    <section><h3>${esc(t('rep.deadlines'))}</h3><div class="table-wrap"><table><tbody>${dl}</tbody></table></div></section>
    <section><h3>${esc(t('rep.gaps'))}</h3>${gaps ? `<ol class="gaps">${gaps}</ol>` : `<p class="muted">${esc(t('rep.noGaps'))}</p>`}${more}</section>
    <section class="actions"><h3>${esc(t('exp.title'))}</h3><div class="btns">
      <button type="button" class="btn" id="x-xlsx">${esc(t('exp.xlsx'))}</button>
      <button type="button" class="btn ghost" id="x-print">${esc(t('exp.print'))}</button>
      <button type="button" class="btn ghost" id="x-json">${esc(t('exp.json'))}</button>
      <button type="button" class="btn ghost" id="x-open">${esc(t('exp.open'))}</button>
      <button type="button" class="btn quiet" id="x-clear">${esc(t('exp.clear'))}</button>
      <input type="file" id="x-file" accept="application/json,.json" hidden></div>
      <p>${esc(t('exp.privacy'))}</p>${state.storage ? '' : `<p class="warn">${esc(t('exp.storageOff'))}</p>`}</section>
  </div>`;
}

/* About */
function renderAbout() {
  const b = state.b;
  const srcs = b.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(L(s))}</a></li>`).join('');
  const notes = b.notes.map((n) => `<li><span class="refs">${n.controls.map((c) => `<button type="button" class="chip" data-goto="${c}">${c}</button>`).join('')}</span><p>${esc(L(n))}</p></li>`).join('');
  $('#panel-about').innerHTML = `<div class="panel-head"><h2>${esc(t('about.title'))}</h2></div>
    <div class="prose"><p>${esc(t('about.what'))}</p><p>${esc(t('about.how'))}</p><p>${esc(t('about.source'))}</p>
    <p class="disclaimer">${esc(t('about.disclaimer'))}</p><p>${esc(t('about.mcp'))}</p>
    <h3>${esc(t('about.nameTitle'))}</h3><p>${esc(t('about.name'))}</p>
    <h3>${esc(t('about.sources'))}</h3><ul class="sources">${srcs}</ul>
    <h3>${esc(t('about.notes'))}</h3><ul class="notes">${notes}</ul><p class="muted">${esc(t('about.appendix'))}</p></div>`;
}

/* Tabs and routing */
function showTab(tab, { push = true } = {}) {
  const next = TABS.includes(tab) ? tab : 'register';
  state.tab = next;
  for (const x of TABS) {
    const on = x === next;
    const btn = document.getElementById(`tab-${x}`);
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
    document.getElementById(`panel-${x}`).hidden = !on;
  }
  if (next === 'report') renderReport();
  if (push) history.replaceState(null, '', next === 'register' ? location.pathname + location.search : `#${next}`);
}

function routeFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (TABS.includes(h)) { showTab(h, { push: false }); return; }
  const mc = /^c-([A-Z]{2})-(\d+)$/.exec(h);
  if (mc) { goTo(`${mc[1]} ${mc[2]}`); return; }
  const md = /^d-([A-Z]{2})$/.exec(h);
  if (md) { showTab('register', { push: false }); scrollToDomain(md[1]); }
}

function renderAll() {
  renderChrome();
  renderMini();
  renderScope();
  renderIndex();
  renderRegister();
  renderCrosswalkShell();
  renderCrosswalkList();
  renderPdppl();
  renderAbout();
  showTab(state.tab, { push: false });
}

/* Files */
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportJson() {
  download(`nia-assessment-${stamp()}.json`, `${JSON.stringify({ ...state.a, updated: new Date().toISOString() }, null, 2)}\n`, 'application/json');
}

export function workbookSheets() {
  const b = state.b;
  const idx = state.idx;
  const ev = currentEval();
  const rtl = state.lang === 'ar';
  const yes = t('xl.yes');
  const no = t('xl.no');
  const soa = [[t('xl.id'), t('xl.domain'), t('xl.sub'), t('xl.text'), t('xl.baseline'), t('xl.condition'), t('xl.applicable'), t('xl.adopted'), t('xl.status'), t('xl.notes'), 'ISO/IEC 27001:2022', 'NIST CSF 2.0', t('xl.page')]];
  for (const c of b.controls) {
    const d = idx.domains.get(c.domain);
    const sub = d.subsections.find((s) => s.key === c.sub);
    const st = ctlState(c.id);
    const dState = state.a.domains[c.domain];
    const dna = !!dState?.na;
    const na = dna || st.status === 'na';
    const applicable = !na && (c.baseline ? ev.requirement.baseline : !!st.adopted);
    soa.push([
      c.id, `${d.code} ${L(d)}`, sub ? L(sub) : '', L(c), c.baseline ? yes : no, c.cond ? condText(c.cond) : '',
      applicable ? yes : no, c.baseline ? '' : st.adopted ? yes : no,
      t(`status.${dna ? 'na' : st.status || 'unassessed'}`), dna ? dState.note || '' : st.note || '',
      c.iso.join(' '), c.csf.join(' '), c.page,
    ]);
  }
  const bt = ev.totals.baseline;
  const summary = [
    [t('xl.item'), t('xl.value')],
    [t('rep.scope'), `C${ev.ratings.C} I${ev.ratings.I} A${ev.ratings.A}`],
    [t('scope.label'), `${ev.label.code} ${L(ev.label)}`],
    [t('scope.aggregate'), ev.aggregate ? L(b.classification.aggregate[ev.aggregate]) : t('scope.none')],
    [t('scope.requires'), L(b.classification.rules[ev.requirement.rule])],
    [t('rep.baselineDone'), `${bt.implemented} ${t('rep.of')} ${bt.total}`],
    [t('rep.baselineGaps'), bt.missing + bt.partial],
    [t('rep.unassessed'), bt.unassessed],
    [t('rep.shortDomains'), ev.totals.domainsShort],
    [t('rep.generated', { date: fmtDate() }), ''],
    [L(b.sources[0]), b.sources[0].url],
    [t('about.disclaimer'), ''],
  ];
  const gaps = [[t('xl.priority'), t('xl.gap'), t('xl.ref'), t('xl.domain'), t('xl.text')]];
  for (const g of ev.gaps) {
    const d = idx.domains.get(g.domain);
    gaps.push([g.priority, gapText(g), g.id || g.domain, `${d.code} ${L(d)}`, g.id ? L(idx.controls.get(g.id)) : '']);
  }
  return [
    { name: t('xl.soa'), rtl, rows: soa, widths: [8, 26, 20, 60, 9, 22, 10, 12, 18, 40, 20, 20, 9] },
    { name: t('xl.summary'), rtl, rows: summary, widths: [44, 70] },
    { name: t('xl.gaps'), rtl, rows: gaps, widths: [9, 44, 10, 28, 60] },
  ];
}

function exportXlsx() {
  download(`nia-soa-${stamp()}.xlsx`, buildXlsx(workbookSheets()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function printReport() {
  showTab('report');
  document.body.classList.add('printing');
  window.print();
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let obj;
    try { obj = JSON.parse(String(reader.result)); } catch { window.alert(t('exp.badFile')); return; }
    if (obj?.schema !== core.SCHEMA) { window.alert(t('exp.badFile')); return; }
    if (!window.confirm(t('exp.openConfirm'))) return;
    state.a = core.validateAssessment(state.b, obj).value;
    lsSet(LS_KEY, JSON.stringify(state.a));
    renderAll();
    showTab('report');
    flash(t('flash.imported'));
  };
  reader.readAsText(file);
}

function clearAll() {
  if (!window.confirm(t('exp.clearConfirm'))) return;
  state.a = core.emptyAssessment();
  lsDel(LS_KEY);
  renderAll();
  flash(t('flash.cleared'));
}

let flashTimer = 0;
function flash(msg) {
  const f = $('#flash');
  f.textContent = msg;
  f.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { f.hidden = true; }, 2600);
}

/* Events */
function bind() {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('button, a');
    if (!el) return;
    const ds = el.dataset;
    if (el.id === 'lang-toggle') {
      state.lang = state.lang === 'ar' ? 'en' : 'ar';
      lsSet(LANG_KEY, state.lang);
      renderAll();
      return;
    }
    if (ds.tab) {
      showTab(ds.tab);
      const top = $('.masthead').getBoundingClientRect().bottom + window.scrollY;
      if (window.scrollY > top) window.scrollTo({ top, behavior: 'auto' });
      return;
    }
    if (ds.rate) {
      state.a.ratings = core.clampRatings({ ...state.a.ratings, [ds.rate]: Number(ds.val) });
      save();
      renderScope();
      renderIndex();
      renderRegister();
      renderMini();
      return;
    }
    if (ds.filter) {
      state.filter = ds.filter;
      for (const x of $$('[data-filter]')) x.setAttribute('aria-pressed', String(x === el));
      applyFilter();
      return;
    }
    if (ds.noteToggle) {
      const box = document.getElementById(`n-${idAttr(ds.noteToggle)}`);
      box.hidden = !box.hidden;
      el.setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) box.querySelector('textarea').focus();
      return;
    }
    if (ds.goto) { ev.preventDefault(); goTo(ds.goto); return; }
    if (ds.gotoPd) {
      showTab('pdppl');
      const o = document.getElementById(`o-${ds.gotoPd}`);
      o?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
      flashEl(o);
      return;
    }
    if (ds.cw) { state.cw = ds.cw; renderCrosswalkShell(); renderCrosswalkList(); return; }
    if (ds.domain && el.closest('#dindex')) { ev.preventDefault(); scrollToDomain(ds.domain); return; }
    if (el.id === 'x-xlsx') exportXlsx();
    else if (el.id === 'x-print') printReport();
    else if (el.id === 'x-json') exportJson();
    else if (el.id === 'x-open') $('#x-file').click();
    else if (el.id === 'x-clear') clearAll();
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const ds = el.dataset;
    if (ds.status) {
      const id = ds.status;
      setCtl(id, { status: el.value || undefined });
      const art = el.closest('.ctl');
      art.className = art.className.replace(/\bs-\S+/, `s-${el.value || 'unassessed'}`);
      if (el.value === 'na' && !ctlState(id).note) {
        const box = document.getElementById(`n-${idAttr(id)}`);
        box.hidden = false;
        box.querySelector('textarea').placeholder = t('note.needReason');
        art.querySelector('.note-btn').setAttribute('aria-expanded', 'true');
      }
      refreshDomain(state.idx.controls.get(id).domain);
      return;
    }
    if (ds.adopt) {
      setCtl(ds.adopt, { adopted: el.checked || undefined });
      refreshDomain(state.idx.controls.get(ds.adopt).domain);
      return;
    }
    if (ds.domainNa) {
      const code = ds.domainNa;
      setDomain(code, { na: el.checked });
      refreshDomain(code);
      if (el.checked) document.getElementById(`dn-${code}`)?.focus();
      return;
    }
    if (el.id === 'dselect') {
      if (el.value) scrollToDomain(el.value);
      else $('#rows').scrollIntoView({ block: 'start' });
      return;
    }
    if (el.id === 'x-file') { importFile(el.files?.[0]); el.value = ''; }
  });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    const ds = el.dataset;
    if (el.id === 'q') { state.query = el.value; applyFilter(); return; }
    if (el.id === 'cwq') { state.cwQuery = el.value; renderCrosswalkList(); return; }
    if (ds.note) {
      setCtl(ds.note, { note: el.value.trim() ? el.value : undefined });
      document.querySelector(`[data-note-toggle="${ds.note}"]`)?.classList.toggle('has-note', !!el.value.trim());
      return;
    }
    if (ds.domainNote) setDomain(ds.domainNote, { note: el.value });
  });

  $('#tabs').addEventListener('keydown', (ev) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(ev.key)) return;
    ev.preventDefault();
    const i = TABS.indexOf(state.tab);
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1;
    let n = i;
    if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = TABS.length - 1;
    else n = (i + (ev.key === 'ArrowRight' ? dir : -dir) + TABS.length) % TABS.length;
    showTab(TABS[n]);
    document.getElementById(`tab-${TABS[n]}`).focus();
  });

  document.addEventListener('keydown', (ev) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      showTab('register');
      $('#q').focus();
    } else if (ev.key === 'Escape' && document.activeElement?.id === 'q' && state.query) {
      state.query = '';
      $('#q').value = '';
      applyFilter();
    }
  });

  window.addEventListener('hashchange', routeFromHash);
  window.addEventListener('afterprint', () => document.body.classList.remove('printing'));
}

function showDisclaimer() {
  if (document.getElementById('disc-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'disc-overlay';
  ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="disc-title" aria-describedby="disc-body">`
    + `<div class="modal-edge" aria-hidden="true"></div>`
    + `<div class="modal-inner">`
    + `<h2 class="modal-title" id="disc-title">${esc(t('popup.title'))}</h2>`
    + `<div class="modal-body" id="disc-body"><p>${esc(t('popup.body1'))}</p><p>${esc(t('popup.body2'))}</p></div>`
    + `<div class="modal-actions"><button type="button" id="disc-ack" class="btn">${esc(t('popup.ack'))}</button></div>`
    + `</div></div>`;
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  ov.querySelector('#disc-ack').addEventListener('click', close);
  document.body.append(ov);
  document.addEventListener('keydown', onKey);
  ov.querySelector('#disc-ack').focus();
}

async function init() {
  const res = await fetch('data/bundle.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`bundle ${res.status}`);
  state.b = await res.json();
  state.idx = core.indexBundle(state.b);
  const savedLang = lsGet(LANG_KEY);
  state.lang = savedLang === 'en' || savedLang === 'ar' ? savedLang : (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
  const saved = lsGet(LS_KEY);
  if (saved) {
    try { state.a = core.validateAssessment(state.b, JSON.parse(saved)).value; } catch { state.a = core.emptyAssessment(); }
  }
  bind();
  renderAll();
  routeFromHash();
  document.body.classList.remove('loading');
  showDisclaimer();
}

init().catch((e) => {
  document.getElementById('boot-error').hidden = false;
  document.body.classList.remove('loading');
  console.error(e);
});
