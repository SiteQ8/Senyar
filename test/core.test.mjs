import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../docs/assets/core.js';
import { bundle as b } from './helpers.mjs';

const agg = (C, I, A) => core.aggregate(b.classification, { C, I, A });

test('aggregate level follows the policy matrix', () => {
  assert.equal(agg(0, 0, 0), null);
  assert.equal(agg(0, 0, 1), 'L');
  assert.equal(agg(1, 1, 1), 'L');
  assert.equal(agg(1, 2, 0), 'M');
  assert.equal(agg(2, 0, 0), 'M');
  assert.equal(agg(0, 0, 3), 'H');
  assert.equal(agg(0, 3, 0), 'H');
  assert.equal(agg(3, 0, 0), 'H');
  assert.equal(agg(4, 0, 0), 'H');
});

test('requirement follows section 2.3 of the Standard', () => {
  assert.deepEqual(core.requirement({ C: 0, I: 0, A: 0 }), { max: 0, baseline: false, additionalPerDomain: 0, rule: 'none' });
  assert.equal(core.requirement({ C: 1, I: 0, A: 0 }).rule, 'baseline');
  assert.equal(core.requirement({ C: 0, I: 2, A: 1 }).additionalPerDomain, 1);
  assert.equal(core.requirement({ C: 4, I: 0, A: 0 }).additionalPerDomain, 2);
});

test('conditions evaluate against ratings and aggregate', () => {
  assert.equal(core.conditionMet('C>=3', { C: 3, I: 0, A: 0 }, 'H'), true);
  assert.equal(core.conditionMet('C>=3', { C: 2, I: 3, A: 0 }, 'H'), false);
  assert.equal(core.conditionMet('C>=2|I>=2', { C: 0, I: 2, A: 0 }, 'M'), true);
  assert.equal(core.conditionMet('AGG>=M', { C: 1, I: 0, A: 0 }, 'L'), false);
  assert.equal(core.conditionMet('AGG>=M', { C: 2, I: 0, A: 0 }, 'M'), true);
  assert.equal(core.conditionMet('RISK>=M', { C: 3, I: 3, A: 3 }, 'H'), null);
  assert.equal(core.conditionMet(null, {}, null), null);
});

test('IDs normalise from common spellings', () => {
  for (const s of ['AM 19', 'am19', 'AM-19', ' am_19 ', 'AM.19']) assert.equal(core.normalizeId(s), 'AM 19');
  assert.equal(core.normalizeId('XYZ'), null);
});

test('evaluate counts baseline, adoption and shortfalls', () => {
  const a = core.emptyAssessment();
  a.ratings = { C: 3, I: 1, A: 1 };
  a.controls['IG 1'] = { status: 'implemented' };
  a.controls['IG 2'] = { status: 'partial' };
  a.controls['IG 3'] = { status: 'missing' };
  a.controls['IG 5'] = { adopted: true, status: 'implemented' };
  a.controls['IG 6'] = { adopted: true, status: 'missing' };
  a.domains.VL = { na: true, note: 'No virtualization in scope' };
  const ev = core.evaluate(b, a);
  const ig = ev.domains.find((d) => d.code === 'IG');
  assert.equal(ig.baseline.total, 5);
  assert.equal(ig.baseline.implemented, 1);
  assert.equal(ig.additional.required, 2);
  assert.equal(ig.additional.adopted, 2);
  assert.equal(ig.additional.shortfall, 0);
  const ac = ev.domains.find((d) => d.code === 'AC');
  assert.equal(ac.additional.available, 0);
  assert.equal(ac.additional.required, 0);
  const vl = ev.domains.find((d) => d.code === 'VL');
  assert.equal(vl.na, true);
  assert.equal(vl.baseline.total, 0);
  assert.equal(ev.gaps[0].kind, 'baseline-missing');
  assert.equal(ev.gaps[0].id, 'IG 3');
  assert.ok(ev.gaps.some((g) => g.kind === 'adopted-open' && g.id === 'IG 6'));
  assert.ok(!ev.gaps.some((g) => g.domain === 'VL'));
  assert.equal(ev.readiness, Math.round(((1 + 0.5) / (166 - vl.baseline.na - 5)) * 100));
});

test('no baseline gaps when every rating is 0', () => {
  const ev = core.evaluate(b, core.emptyAssessment());
  assert.equal(ev.requirement.baseline, false);
  assert.equal(ev.readiness, null);
  assert.equal(ev.gaps.filter((g) => g.kind.startsWith('baseline')).length, 0);
});

test('not applicable without a reason is flagged', () => {
  const a = core.emptyAssessment();
  a.ratings = { C: 1, I: 0, A: 0 };
  a.controls['NS 2'] = { status: 'na' };
  assert.ok(core.evaluate(b, a).gaps.some((g) => g.kind === 'na-unjustified' && g.id === 'NS 2'));
});

test('validateAssessment rejects unknown IDs and statuses', () => {
  const r = core.validateAssessment(b, { schema: core.SCHEMA, ratings: { C: 9 }, controls: { 'ZZ 1': {}, 'AM 19': { status: 'maybe' }, 'am 20': { status: 'implemented' } } });
  assert.equal(r.ok, false);
  assert.equal(r.value.ratings.C, 4);
  assert.deepEqual(Object.keys(r.value.controls), ['AM 20']);
  assert.equal(core.validateAssessment(b, null).ok, false);
});

test('search works in English and Arabic', () => {
  assert.ok(core.searchControls(b, 'password').some((c) => c.id === 'AM 19'));
  assert.ok(core.searchControls(b, 'كلمات المرور').some((c) => c.id === 'AM 19'));
  assert.ok(core.searchControls(b, 'كلمات المرور').length > 3);
  assert.deepEqual(core.searchControls(b, 'am19').map((c) => c.id), ['AM 19']);
  assert.ok(core.searchControls(b, '', { domain: 'ns', baseline: true }).every((c) => c.domain === 'NS' && c.baseline));
});

test('crosswalk runs both ways', () => {
  assert.ok(core.crosswalk(b, 'iso27001', 'A.5.17').nia.includes('AM 19'));
  assert.equal(core.crosswalk(b, 'iso27001', '5.1').id, '5.1');
  assert.equal(core.crosswalk(b, 'iso27001', '5.17').id, 'A.5.17');
  assert.ok(core.crosswalk(b, 'csf2', 'PR.AA').nia.length > 10);
  assert.ok(core.crosswalk(b, 'csf2', 'rs.co-02').nia.includes('IM 8'));
  assert.deepEqual(core.crosswalk(b, 'nia', 'AM 19').iso.map((i) => i.ref), ['A.5.17']);
  assert.equal(core.crosswalk(b, 'iso27001', 'A.9.9'), null);
});
