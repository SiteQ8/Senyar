#!/usr/bin/env python3
"""Rebuild the control structure from NCSA's official NIA Standard v2.1 PDF and
compare it with data/src/nia-structure.tsv. Needs pdftotext (poppler).

    python3 tools/verify_nia_source.py path/to/NIA_Standard_En_V2.1.pdf
    python3 tools/verify_nia_source.py path/to/pdf --write   # regenerate the TSV
"""
import re, subprocess, sys, pathlib

SUBS = {
    'Cabling': 'cabling', 'Telephones and Faxes': 'telephony', 'Network Management': 'network-management',
    'Virtual LANs (VLANs)': 'vlans', 'Multifunction Devices (MDFs)': 'mfds', 'Domain Name Service (DNS) Servers': 'dns',
    'Internet Security': 'internet', 'EMail Security': 'email', 'Wireless Security': 'wireless',
    'Clock Synchronization': 'clock', 'Virtual Private Network (VPNs)': 'vpn', 'Voice over IP Security (VoIP)': 'voip',
    'Internet protocol Version 6 (IPv6)': 'ipv6', 'General': 'general', 'Data Export': 'export', 'Data Import': 'import',
    'Software Development & Acquisition': 'development', 'Software Applications': 'applications',
    'Web Applications': 'web', 'Database': 'database', 'Media Classification and Labelling': 'labelling',
    'Media Sanitization': 'sanitization', 'Media Repairing & Maintenance': 'repair',
    'Media Destruction & Disposal': 'destruction', 'Identification & Authentication': 'authentication',
    'System Access': 'system-access', 'Privileged Access': 'privileged', 'Remote Access': 'remote',
}

def parse(pdf):
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, text=True, check=True).stdout
    pages = text.split('\f')
    ctrl = re.compile(r'^\s*([A-Z]{2})\s?(\d{1,3})\.\s*(\*?)\s*(.*)$')
    dom = re.compile(r'^\s*(\d{1,2})\.\s+(.+?)\s*\[([A-Z]{2})\]\s*$')
    sub = re.compile(r'^\s*\d{1,2}\.\d{1,2}\s+Control Statements\s*[-\u2013]?\s*(.*?)\s*$')
    stop = re.compile(r'^\s*(\d{1,2}\.\d{1,2}\s+(Objectives|Control Statements)|5\.\s+SECURITY CONTROLS)\s*$')
    started = False; cur_dom = None; cur_sub = ''; rows = []; cur = None
    for pno, page in enumerate(pages, start=1):
        for line in page.split('\n'):
            if re.search(r'^\s*6\.\s+Compliance and Enforcement\s*$', line) and started:
                return finish(rows, cur)
            m = dom.match(line)
            if m and not line.rstrip().endswith(tuple('0123456789')):
                started = True; cur_dom = m.group(3); cur_sub = ''
                if cur: rows.append(cur); cur = None
                continue
            if not started:
                continue
            m = sub.match(line)
            if m:
                if cur: rows.append(cur); cur = None
                cur_sub = SUBS.get(m.group(1).strip(), '')
                continue
            if stop.match(line):
                if cur: rows.append(cur); cur = None
                continue
            m = ctrl.match(line)
            if m and m.group(1) == cur_dom:
                if cur: rows.append(cur)
                text0 = m.group(4)
                star = m.group(3) == '*' or text0.startswith('*')
                cur = {'domain': cur_dom, 'num': int(m.group(2)), 'baseline': star, 'sub': cur_sub, 'page': pno, 'items': []}
                continue
            if cur is not None:
                mi = re.match(r'^\s*([a-z])\.\s*\*', line)
                if mi: cur['items'].append(mi.group(1))
    return finish(rows, cur)

def finish(rows, cur):
    if cur: rows.append(cur)
    seen = set(); out = []
    for r in rows:
        printed = f"{r['domain']} {r['num']}"
        cid = printed
        if cid in seen and r['domain'] == 'PH':
            pass
        out.append([cid, r['domain'], r['sub'], '1' if r['baseline'] else '0', ','.join(r['items']), str(r['page']), printed])
        seen.add(cid)
    # The official text prints PH 2 twice; the first occurrence is PH 1.
    ph = [o for o in out if o[1] == 'PH']
    if len(ph) > 1 and ph[0][0] == 'PH 2' and ph[1][0] == 'PH 2':
        ph[0][0] = 'PH 1'
    return out

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(2)
    rows = parse(sys.argv[1])
    header = 'id\tdomain\tsub\tbaseline\titems\tpage\tprinted'
    body = '\n'.join('\t'.join(r) for r in rows)
    target = pathlib.Path(__file__).resolve().parent.parent / 'data' / 'src' / 'nia-structure.tsv'
    if '--write' in sys.argv:
        target.write_text(header + '\n' + body + '\n', encoding='utf-8'); print(f'wrote {len(rows)} controls'); return
    current = target.read_text(encoding='utf-8').strip().split('\n')[1:]
    fresh = body.split('\n')
    if current == fresh:
        print(f'OK: {len(rows)} controls match the official PDF'); return
    for a, b in zip(current, fresh):
        if a != b: print('differs:', a, '|', b)
    print(f'MISMATCH ({len(current)} in data, {len(fresh)} from PDF)'); sys.exit(1)

if __name__ == '__main__':
    main()
