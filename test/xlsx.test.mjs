import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx, crc32, colName } from '../docs/assets/xlsx.js';

function unzip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const files = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nlen = dv.getUint16(p + 26, true);
    const xlen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(buf.slice(p + 30, p + 30 + nlen));
    files[name] = { crc, data: buf.slice(p + 30 + nlen + xlen, p + 30 + nlen + xlen + size) };
    p += 30 + nlen + xlen + size;
  }
  const end = buf.length - 22;
  assert.equal(dv.getUint32(end, true), 0x06054b50);
  return { files, count: dv.getUint16(end + 10, true), cdOffset: dv.getUint32(end + 16, true), localEnd: p };
}

test('column names', () => {
  assert.deepEqual([0, 25, 26, 51, 52, 701, 702].map(colName), ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
});

test('workbook is a valid stored zip with escaped, right-to-left sheets', () => {
  const bytes = buildXlsx([
    { name: 'بيان: قابلية/التطبيق', rtl: true, widths: [10, 40], rows: [['ID', 'Text'], ['IG 1', 'a & b < c'], [42, 'x']] },
    { name: 'Summary', rows: [['k', 'v']] },
  ]);
  const z = unzip(bytes);
  assert.equal(z.count, Object.keys(z.files).length);
  assert.equal(z.cdOffset, z.localEnd);
  for (const [name, f] of Object.entries(z.files)) assert.equal(crc32(f.data), f.crc, name);
  const sheet = new TextDecoder().decode(z.files['xl/worksheets/sheet1.xml'].data);
  assert.match(sheet, /rightToLeft="1"/);
  assert.match(sheet, /a &amp; b &lt; c/);
  assert.match(sheet, /<c r="A3" s="2"><v>42<\/v><\/c>/);
  const wb = new TextDecoder().decode(z.files['xl/workbook.xml'].data);
  assert.ok(!wb.includes(':') || wb.includes('xmlns:r'));
  assert.ok(!/name="[^"]*[:/][^"]*"/.test(wb.replace(/xmlns[^ ]+/g, '')));
});
