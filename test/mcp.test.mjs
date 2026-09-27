import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { root } from './helpers.mjs';

function start() {
  const proc = spawn(process.execPath, [join(root, 'mcp/server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  const seen = [];
  let buf = '';
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      seen.push(msg);
      const w = waiting.get(msg.id);
      if (w) { waiting.delete(msg.id); w(msg); }
    }
  });
  let n = 0;
  const call = (method, params) => new Promise((resolve) => {
    n += 1;
    waiting.set(n, resolve);
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: n, method, params })}\n`);
  });
  const tool = async (name, args) => (await call('tools/call', { name, arguments: args })).result;
  return { proc, call, tool, seen, raw: (s) => proc.stdin.write(`${s}\n`), close: () => proc.stdin.end() };
}

test('MCP server speaks the protocol and answers every tool', async () => {
  const s = start();
  try {
    const init = await s.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.ok(init.result.capabilities.tools);
    s.raw(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    const again = await s.call('initialize', { protocolVersion: '1999-01-01' });
    assert.equal(again.result.protocolVersion, '2025-11-25');
    assert.deepEqual((await s.call('ping')).result, {});

    const list = (await s.call('tools/list')).result.tools;
    assert.deepEqual(list.map((x) => x.name).sort(), ['nia_applicable_controls', 'nia_classify', 'nia_crosswalk', 'nia_gap_report', 'nia_get_control', 'nia_list_domains', 'nia_pdppl_obligations', 'nia_search_controls']);
    for (const x of list) {
      assert.equal(x.inputSchema.type, 'object');
      assert.equal(x.annotations.readOnlyHint, true);
      assert.ok(x.description.length > 40);
    }

    const dom = await s.tool('nia_list_domains', { response_format: 'json' });
    assert.equal(dom.structuredContent.domains.length, 26);
    assert.equal(JSON.parse(dom.content[0].text).domains[0].code, 'IG');

    const am = await s.tool('nia_get_control', { id: 'am19' });
    assert.equal(am.structuredContent.id, 'AM 19');
    assert.match(am.content[0].text, /12/);
    const ar = await s.tool('nia_get_control', { id: 'PH 1', lang: 'ar' });
    assert.equal(ar.structuredContent.printed_id, 'PH 2');
    assert.match(ar.structuredContent.summary, /[\u0600-\u06FF]/);

    const cls = await s.tool('nia_classify', { c: 2, i: 1, a: 0 });
    assert.equal(cls.structuredContent.aggregate.code, 'M');
    assert.equal(cls.structuredContent.requirement.additionalPerDomain, 1);

    const app = await s.tool('nia_applicable_controls', { c: 3, i: 0, a: 0, domain: 'CY', not_applicable_domains: ['VL'], limit: 50 });
    assert.equal(app.structuredContent.controls.total, 12);
    assert.equal(app.structuredContent.controls.items.find((c) => c.id === 'CY 3').condition_met, true);
    assert.equal(app.structuredContent.domains.find((d) => d.code === 'VL').additional_required, 0);

    const srch = await s.tool('nia_search_controls', { query: 'كلمات المرور', limit: 2 });
    assert.ok(srch.structuredContent.total > 2);
    assert.equal(srch.structuredContent.items.length, 2);
    assert.equal(srch.structuredContent.has_more, true);

    assert.ok((await s.tool('nia_crosswalk', { framework: 'iso27001', id: 'A.5.17' })).structuredContent.nia_controls.some((c) => c.id === 'AM 19'));
    assert.ok((await s.tool('nia_crosswalk', { framework: 'csf2', id: 'PR.AA' })).structuredContent.nia_controls.length > 10);
    assert.equal((await s.tool('nia_crosswalk', { framework: 'nia', id: 'IM 8' })).structuredContent.id, 'IM 8');

    const pd = await s.tool('nia_pdppl_obligations', { article: 14 });
    assert.deepEqual(pd.structuredContent.items.map((o) => o.id), ['P17']);

    const gap = await s.tool('nia_gap_report', { assessment: { schema: 'nia-assessment/1', ratings: { C: 1, I: 0, A: 0 }, controls: { 'IM 8': { status: 'missing' } } } });
    assert.equal(gap.structuredContent.gaps.items[0].id, 'IM 8');
    assert.equal(gap.structuredContent.totals.baseline.missing, 1);

    const bad = await s.tool('nia_get_control', { id: 'ZZ 99' });
    assert.equal(bad.isError, true);
    assert.equal((await s.tool('nia_gap_report', { assessment: { schema: 'other' } })).isError, true);
    assert.equal((await s.tool('nia_search_controls', { domain: 'QQ' })).isError, true);
    assert.equal((await s.call('tools/call', { name: 'nope', arguments: {} })).error.code, -32602);
    assert.equal((await s.call('resources/list')).error.code, -32601);
    assert.ok(s.seen.every((m) => m.id !== undefined), 'notifications get no reply');
  } finally {
    s.close();
  }
});
