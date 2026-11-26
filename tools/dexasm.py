#!/usr/bin/env python3
"""dexasm — assembler DEX mini (subset smali) tanpa dependensi.
Dipakai karena build environment tidak punya JDK/Android SDK.  Tahapan:
  1. parse  .smali (subset)  ->  model kelas/metode
  2. verify_lite             ->  cek aliran tipe register (mirip verifier ART, versi sederhana)
  3. write_dex               ->  classes.dex (header, id tables, class_data, code_item, anotasi, map_list, checksum, SHA-1)
  4. read_dex                ->  pembaca independen: validasi urutan tabel, map_list, dan men-disassemble ulang semua metode
"""
import re, struct, zlib, hashlib, sys, os

# ---------------------------------------------------------------- opcode table
# nama: (opcode, format)
OPS = {
 'nop': (0x00, '10x'), 'move': (0x01, '12x'), 'move-object': (0x07, '12x'),
 'move-result': (0x0a, '11x'), 'move-result-wide': (0x0b, '11x'), 'move-result-object': (0x0c, '11x'), 'move-exception': (0x0d, '11x'),
 'return-void': (0x0e, '10x'), 'return': (0x0f, '11x'), 'return-object': (0x11, '11x'),
 'const/4': (0x12, '11n'), 'const/16': (0x13, '21s'), 'const': (0x14, '31i'),
 'const-string': (0x1a, '21c'), 'check-cast': (0x1f, '21c'), 'instance-of': (0x20, '22c'),
 'array-length': (0x21, '12x'), 'new-instance': (0x22, '21c'), 'new-array': (0x23, '22c'),
 'goto': (0x28, '10t'), 'goto/16': (0x29, '20t'),
 'if-eq': (0x32, '22t'), 'if-ne': (0x33, '22t'), 'if-lt': (0x34, '22t'), 'if-ge': (0x35, '22t'), 'if-gt': (0x36, '22t'), 'if-le': (0x37, '22t'),
 'if-eqz': (0x38, '21t'), 'if-nez': (0x39, '21t'), 'if-ltz': (0x3a, '21t'), 'if-gez': (0x3b, '21t'), 'if-gtz': (0x3c, '21t'), 'if-lez': (0x3d, '21t'),
 'aget': (0x44, '23x'), 'aget-object': (0x46, '23x'), 'aput': (0x4b, '23x'), 'aput-wide': (0x4c, '23x'), 'aput-object': (0x4d, '23x'),
 'iget-object': (0x54, '22c'), 'iput-object': (0x5b, '22c'),
 'invoke-virtual': (0x6e, '35c'), 'invoke-super': (0x6f, '35c'), 'invoke-direct': (0x70, '35c'), 'invoke-static': (0x71, '35c'), 'invoke-interface': (0x72, '35c'),
 'add-int/lit8': (0xd8, '22b'),
}
BYOP = {v[0]: (k, v[1]) for k, v in OPS.items()}
FSIZE = {'10x': 1, '12x': 1, '11x': 1, '11n': 1, '10t': 1, '20t': 2, '21s': 2, '21c': 2, '21t': 2, '22b': 2, '22c': 2, '22t': 2, '23x': 2, '31i': 3, '35c': 3}

ACC = {'public': 1, 'private': 2, 'protected': 4, 'static': 8, 'final': 0x10, 'constructor': 0x10000}

def uleb(n):
    o = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if n: o.append(b | 0x80)
        else: o.append(b); return bytes(o)

def sleb(n):
    o = bytearray()
    while True:
        b = n & 0x7f; n >>= 7
        if (n == 0 and not b & 0x40) or (n == -1 and b & 0x40): o.append(b); return bytes(o)
        o.append(b | 0x80)

def split_params(s):
    out, i = [], 0
    while i < len(s):
        j = i
        while s[j] == '[': j += 1
        j = s.index(';', j) + 1 if s[j] == 'L' else j + 1
        out.append(s[i:j]); i = j
    return out

def parse_sig(sig):  # name(params)ret
    m = re.match(r'^(\S+?)\((.*)\)(\S+)$', sig)
    return m.group(1), split_params(m.group(2)), m.group(3)

def parse_mref(s):  # Lcls;->name(params)ret
    c, rest = s.split('->', 1); n, p, r = parse_sig(rest)
    return (c, n, tuple(p), r)

def parse_fref(s):  # Lcls;->name:type
    c, rest = s.split('->', 1); n, t = rest.split(':', 1)
    return (c, n, t)

def unq(s):
    out, i = [], 1
    assert s[0] == '"' and s[-1] == '"', s
    s = s[:-1]
    while i < len(s):
        c = s[i]
        if c == '\\':
            i += 1; c = s[i]
            if c == 'n': out.append('\n')
            elif c == 't': out.append('\t')
            elif c == 'u': out.append(chr(int(s[i + 1:i + 5], 16))); i += 4
            else: out.append(c)
        else: out.append(c)
        i += 1
    return ''.join(out)

def tokens(rest):  # split operands by comma outside quotes/braces
    out, cur, q, br = [], '', False, 0
    i = 0
    while i < len(rest):
        c = rest[i]
        if q:
            cur += c
            if c == '\\': i += 1; cur += rest[i]
            elif c == '"': q = False
        elif c == '"': q = True; cur += c
        elif c == '{': br += 1; cur += c
        elif c == '}': br -= 1; cur += c
        elif c == ',' and br == 0: out.append(cur.strip()); cur = ''
        else: cur += c
        i += 1
    if cur.strip(): out.append(cur.strip())
    return out

# ---------------------------------------------------------------- parse
class Method:
    def __init__(s): s.flags = 0; s.name = ''; s.params = []; s.ret = 'V'; s.regs = 0; s.js = False; s.insns = []; s.catch = None
class Klass:
    def __init__(s): s.name = ''; s.flags = 1; s.sup = 'Ljava/lang/Object;'; s.ifaces = []; s.fields = []; s.methods = []

def parse_smali(text):
    k = Klass(); m = None
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith('#'): continue
        if m is None:
            if ln.startswith('.class'):
                parts = ln.split(); k.name = parts[-1]; k.flags = sum(ACC[p] for p in parts[1:-1])
            elif ln.startswith('.super'): k.sup = ln.split()[1]
            elif ln.startswith('.implements'): k.ifaces.append(ln.split()[1])
            elif ln.startswith('.field'): n, t = ln.split()[-1].split(':', 1); k.fields.append((n, t))
            elif ln.startswith('.method'):
                m = Method(); parts = ln.split()
                m.flags = sum(ACC[p] for p in parts[1:-1]); m.name, m.params, m.ret = parse_sig(parts[-1])
            else: raise SyntaxError(ln)
        else:
            if ln == '.end method': k.methods.append(m); m = None
            elif ln.startswith('.registers'): m.regs = int(ln.split()[1])
            elif ln == '.js': m.js = True
            elif ln.startswith('.catch'):
                mm = re.match(r'\.catch (\S+) \{:(\w+) \.\. :(\w+)\} :(\w+)', ln); m.catch = mm.groups()
            elif ln.startswith(':'): m.insns.append(('label', ln[1:]))
            else:
                sp = ln.split(None, 1); op = sp[0]; rest = sp[1] if len(sp) > 1 else ''
                if op not in OPS: raise SyntaxError('opcode? ' + ln)
                m.insns.append(('op', op, rest, ln))
    return k

def static_flag(m): return bool(m.flags & 8)
def ins_words(m): return (0 if static_flag(m) else 1) + sum(2 if p in ('J', 'D') else 1 for p in m.params)

def reg(tok, m):
    n = int(tok[1:])
    if tok[0] == 'p': n = m.regs - ins_words(m) + n
    assert 0 <= n < m.regs, (tok, m.name, m.regs)
    return n

def decode_ops(m):
    """-> list of dict(op, fmt, regs, lit, ref, label, ln)"""
    out = []
    for it in m.insns:
        if it[0] == 'label': out.append({'label': it[1]}); continue
        _, op, rest, ln = it; code, fmt = OPS[op]; d = {'op': op, 'fmt': fmt, 'ln': ln, 'regs': [], 'lit': None, 'ref': None, 'tgt': None}
        if fmt == '35c':
            mm = re.match(r'\{([^}]*)\},\s*(.+)$', rest)
            d['regs'] = [reg(x.strip(), m) for x in mm.group(1).split(',') if x.strip()]
            d['ref'] = ('m', parse_mref(mm.group(2).strip()))
        else:
            t = tokens(rest)
            if fmt in ('10x',): pass
            elif fmt in ('11x',): d['regs'] = [reg(t[0], m)]
            elif fmt == '12x': d['regs'] = [reg(t[0], m), reg(t[1], m)]
            elif fmt in ('11n', '21s', '31i'): d['regs'] = [reg(t[0], m)]; d['lit'] = int(t[1], 0)
            elif fmt in ('10t', '20t'): d['tgt'] = t[0][1:]
            elif fmt == '21t': d['regs'] = [reg(t[0], m)]; d['tgt'] = t[1][1:]
            elif fmt == '22t': d['regs'] = [reg(t[0], m), reg(t[1], m)]; d['tgt'] = t[2][1:]
            elif fmt == '23x': d['regs'] = [reg(x, m) for x in t[:3]]
            elif fmt == '22b': d['regs'] = [reg(t[0], m), reg(t[1], m)]; d['lit'] = int(t[2], 0)
            elif fmt == '21c':
                d['regs'] = [reg(t[0], m)]
                d['ref'] = ('s', unq(t[1])) if op == 'const-string' else ('t', t[1])
            elif fmt == '22c':
                d['regs'] = [reg(t[0], m), reg(t[1], m)]
                d['ref'] = ('f', parse_fref(t[2])) if op.startswith(('iget', 'iput')) else ('t', t[2])
            else: raise SyntaxError(ln)
        out.append(d)
    return out

# ---------------------------------------------------------------- verifier-lite
SUP = {
 'Ljava/lang/String;': ['Ljava/lang/CharSequence;', 'Ljava/lang/Object;'],
 'Ljava/lang/StringBuilder;': ['Ljava/lang/CharSequence;', 'Ljava/lang/Object;'],
 'Lnx/M;': ['Landroid/app/Activity;'], 'Lnx/H;': ['Ljava/lang/Runnable;'],
 'Landroid/app/Activity;': ['Landroid/view/ContextThemeWrapper;'],
 'Landroid/view/ContextThemeWrapper;': ['Landroid/content/ContextWrapper;'],
 'Landroid/content/ContextWrapper;': ['Landroid/content/Context;'],
 'Ljava/net/HttpURLConnection;': ['Ljava/net/URLConnection;'],
 'Ljava/io/ByteArrayOutputStream;': ['Ljava/io/OutputStream;'],
 'Landroid/webkit/WebView;': ['Landroid/widget/AbsoluteLayout;'], 'Landroid/widget/AbsoluteLayout;': ['Landroid/view/ViewGroup;'], 'Landroid/view/ViewGroup;': ['Landroid/view/View;'],
 'Ljava/util/Hashtable;': ['Ljava/util/Dictionary;', 'Ljava/util/Map;'],
}
def subtype(a, b):
    if a == b or b == 'Ljava/lang/Object;': return True
    return any(subtype(s, b) for s in SUP.get(a, []))

INTS = ('Z', 'B', 'S', 'C', 'I')
def vkind(t): return 'int' if t in INTS else 'wide' if t in ('J', 'D') else 'ref'

def merge(a, b):
    if a == b: return a
    if a == 'Z': return b if b != 'U' else 'U'
    if b == 'Z': return a
    if a.startswith(('L', '[')) and b.startswith(('L', '[')):
        if subtype(a, b): return b
        if subtype(b, a): return a
        return 'Ljava/lang/Object;'
    return 'U'

class VErr(Exception): pass

def verify_method(k, m):
    ops = decode_ops(m)
    # pc index = index into ops (labels are pseudo)
    lab = {o['label']: i for i, o in enumerate(ops) if 'label' in o}
    n = len(ops); R = m.regs
    start = ['U'] * R
    p0 = R - ins_words(m); r = p0
    if not static_flag(m): start[r] = k.name; r += 1
    for p in m.params:
        if p in ('J', 'D'): start[r], start[r + 1] = 'J1', 'J2'; r += 2
        else: start[r] = 'I' if p in INTS else p; r += 1
    tries = None
    if m.catch: tries = (lab[m.catch[1]], lab[m.catch[2]], lab[m.catch[3]])
    state = {0: tuple(start)}; work = [0]; seen_res = {}
    def err(i, msg): raise VErr('%s.%s: %s  <<  %s' % (k.name, m.name, msg, ops[i].get('ln', ops[i])))
    def push(i, st, via=None):
        if i >= n: raise VErr('%s.%s: jatuh keluar dari kode' % (k.name, m.name))
        old = state.get(i)
        if old is None: state[i] = st; work.append(i); return
        new = tuple(merge(a, b) for a, b in zip(old, st))
        if new != old: state[i] = new; work.append(i)
    uninit = {}
    guard = 0
    while work:
        guard += 1
        if guard > 20000: raise VErr('verifier loop')
        i = work.pop()
        while i < n and 'label' in ops[i]:
            # label: lanjutkan ke instruksi berikut dg state sama
            i += 1
            if i in state and state[i] != state[i - 1]:
                pass
        st0 = state[i - 0] if i in state else None
        # cari state asli: state disimpan pada index yg di-push (bisa label). Cari mundur
        j = i
        while j not in state: j -= 1
        st = list(state[j])
        # pending result type (hanya valid utk instruksi tepat setelah invoke)
        pend = None
        while i < n:
            o = ops[i]
            if 'label' in o:
                # merge ke label: sudah ditangani push; lanjut
                lst = tuple(st)
                if i in state and i != j:
                    m2 = tuple(merge(a, b) for a, b in zip(state[i], lst))
                    if m2 != state[i]: state[i] = m2; st = list(m2); 
                    else: st = list(state[i]); 
                    if m2 == state[i] and state.get(i) is not None and i != j and lst == m2 and False: pass
                state.setdefault(i, tuple(st)); st = list(state[i])
                i += 1; continue
            op, fmt = o['op'], o['fmt']; rg = o['regs']
            # 4-bit constraints
            if fmt in ('12x', '22c', '22t', '11n', '35c') and any(x > 15 for x in rg): err(i, 'register > v15 pada format 4-bit')
            # try-range: merge pre-state ke handler
            if tries and tries[0] <= i < tries[1]:
                h = tries[2]; ho = state.get(h)
                hs = tuple(st)
                if ho is None: state[h] = hs; work.append(h)
                else:
                    nh = tuple(merge(a, b) for a, b in zip(ho, hs))
                    if nh != ho: state[h] = nh; work.append(h)
            def need(x, kind=None, what=None):
                t = st[x]
                if t == 'U' or t == 'J2': err(i, 'v%d tidak terdefinisi/konflik (%s)' % (x, t))
                if kind == 'int' and t not in ('I', 'Z'): err(i, 'v%d diharapkan int, ada %s' % (x, t))
                if kind == 'ref' and not (t == 'Z' or t.startswith(('L', '[')) or t.startswith('new:')): err(i, 'v%d diharapkan ref, ada %s' % (x, t))
                if kind == 'wide' and t != 'J1': err(i, 'v%d diharapkan pasangan wide, ada %s' % (x, t))
                return t
            def assignable(x, dst):
                t = need(x)
                kd = vkind(dst)
                if kd == 'int':
                    if t not in ('I', 'Z'): err(i, 'v%d (%s) bukan int utk %s' % (x, t, dst))
                elif kd == 'wide':
                    if t != 'J1': err(i, 'v%d (%s) bukan wide utk %s' % (x, t, dst))
                else:
                    if t == 'Z': return
                    if t.startswith('new:'): err(i, 'v%d belum diinisialisasi' % x)
                    if not (t.startswith(('L', '[')) and subtype(t, dst)): err(i, 'v%d (%s) tidak kompatibel dgn %s' % (x, t, dst))
            if op == 'nop': pass
            elif op in ('move', 'move-object'): st[rg[0]] = need(rg[1])
            elif op in ('move-result', 'move-result-object', 'move-result-wide'):
                if pend is None: err(i, 'move-result tanpa invoke sebelumnya')
                if op == 'move-result-wide':
                    if pend != 'J': err(i, 'tipe hasil %s' % pend)
                    st[rg[0]], st[rg[0] + 1] = 'J1', 'J2'
                elif op == 'move-result':
                    if vkind(pend) != 'int': err(i, 'tipe hasil %s' % pend)
                    st[rg[0]] = 'I'
                else:
                    if vkind(pend) != 'ref': err(i, 'tipe hasil %s' % pend)
                    st[rg[0]] = pend
                pend = None; i += 1; continue
            elif op == 'move-exception':
                if i - 1 >= 0 and not ('label' in ops[i - 1]) : err(i, 'move-exception bukan di awal handler')
                st[rg[0]] = 'Ljava/lang/Throwable;'
            elif op == 'const/4':
                if not -8 <= o['lit'] <= 7: err(i, 'literal const/4')
                st[rg[0]] = 'Z' if o['lit'] == 0 else 'I'
            elif op == 'const/16':
                if not -32768 <= o['lit'] <= 32767: err(i, 'literal const/16')
                st[rg[0]] = 'Z' if o['lit'] == 0 else 'I'
            elif op == 'const': st[rg[0]] = 'Z' if o['lit'] == 0 else 'I'
            elif op == 'const-string': st[rg[0]] = 'Ljava/lang/String;'
            elif op == 'check-cast': need(rg[0], 'ref'); st[rg[0]] = o['ref'][1]
            elif op == 'instance-of': need(rg[1], 'ref'); st[rg[0]] = 'I'
            elif op == 'array-length':
                t = need(rg[1], 'ref')
                if not t.startswith('['): err(i, 'array-length pada %s' % t)
                st[rg[0]] = 'I'
            elif op == 'new-instance': st[rg[0]] = 'new:%s:%d' % (o['ref'][1], i)
            elif op == 'new-array': need(rg[1], 'int'); st[rg[0]] = o['ref'][1]
            elif op in ('goto', 'goto/16'):
                push(lab[o['tgt']], tuple(st)); break
            elif op.startswith('if-'):
                if op.endswith('z'):
                    need(rg[0]) if op in ('if-eqz', 'if-nez') else need(rg[0], 'int')
                else: need(rg[0], 'int'); need(rg[1], 'int')
                push(lab[o['tgt']], tuple(st))
            elif op in ('aget-object',):
                t = need(rg[1], 'ref'); need(rg[2], 'int')
                if not t.startswith('[L') and not t.startswith('[['): err(i, 'aget-object pada %s' % t)
                st[rg[0]] = t[1:]
            elif op in ('aput-object', 'aput-wide', 'aput'):
                t = need(rg[1], 'ref'); need(rg[2], 'int')
                if not t.startswith('['): err(i, 'aput pada %s' % t)
                assignable(rg[0], t[1:]) if op != 'aput-wide' else (need(rg[0], 'wide') if t == '[J' else err(i, 'aput-wide butuh [J'))
            elif op == 'aget': need(rg[1], 'ref'); need(rg[2], 'int'); st[rg[0]] = 'I'
            elif op == 'iget-object':
                c, nme, ty = o['ref'][1]; assignable(rg[1], c); st[rg[0]] = ty
            elif op == 'iput-object':
                c, nme, ty = o['ref'][1]; assignable(rg[1], c); assignable(rg[0], ty)
            elif op == 'add-int/lit8':
                need(rg[1], 'int'); st[rg[0]] = 'I'
                if not -128 <= o['lit'] <= 127: err(i, 'lit8')
            elif op in ('return-void',):
                if m.ret != 'V': err(i, 'return-void pada metode non-void')
                break
            elif op in ('return-object', 'return'):
                if m.ret == 'V': err(i, 'return nilai pada void')
                assignable(rg[0], m.ret); break
            elif op.startswith('invoke-'):
                c, nme, ps, rt = o['ref'][1]
                regs = list(rg); words = (0 if op == 'invoke-static' else 1) + sum(2 if p in ('J', 'D') else 1 for p in ps)
                if len(regs) != words: err(i, 'jumlah register %d != kata argumen %d' % (len(regs), words))
                ri = 0
                if op != 'invoke-static':
                    rcv = need(regs[0]); ri = 1
                    if nme == '<init>':
                        if rcv.startswith('new:'):
                            if rcv.split(':')[1] != c: err(i, 'init kelas lain pada %s' % rcv)
                            ty = c
                            for q in range(R):
                                if st[q] == rcv: st[q] = ty
                        else:
                            if not subtype(rcv, c): err(i, 'init super: %s bukan subtipe %s' % (rcv, c))
                    else:
                        if rcv.startswith('new:'): err(i, 'receiver belum diinisialisasi')
                        if rcv != 'Z' and not (rcv.startswith(('L', '[')) and subtype(rcv, c)): err(i, 'receiver %s bukan %s' % (rcv, c))
                for p in ps:
                    if p in ('J', 'D'):
                        if st[regs[ri]] != 'J1' or st[regs[ri + 1]] != 'J2' or regs[ri + 1] != regs[ri] + 1: err(i, 'argumen wide rusak')
                        ri += 2
                    else: assignable(regs[ri], p); ri += 1
                pend = None if rt == 'V' else ('I' if rt in INTS else rt)
                if rt in ('J', 'D'): pend = 'J'
                i += 1; continue
            else: err(i, 'opcode belum didukung verifier: ' + op)
            pend = None
            i += 1
        # akhir blok
    # semua instruksi harus terjangkau
    for i, o in enumerate(ops):
        if 'op' in o and not any(j in state for j in range(i, -1, -1)): pass
    return True

# ---------------------------------------------------------------- dex writer
def mutf8(s):
    assert all(ord(c) < 0x80 for c in s), 'non-ascii'
    return s.encode('ascii')

def shorty(ret, ps): return ''.join(('L' if t[0] in 'L[' else t) for t in [ret] + list(ps))

def encode_code(m, idx):
    """kembalikan (units, outs, tries) ; idx = dict dgn string/type/field/method index"""
    ops = decode_ops(m)
    # pass 1: posisi
    pos, labels, cur = [], {}, 0
    for o in ops:
        if 'label' in o: labels[o['label']] = cur; pos.append(cur); continue
        pos.append(cur); cur += FSIZE[o['fmt']]
    units = []
    outs = 0
    for o, at in zip(ops, pos):
        if 'label' in o: continue
        op, fmt = o['op'], o['fmt']; code = OPS[op][0]; rg = o['regs']
        if fmt == '10x': units.append(code)
        elif fmt == '11x': units.append(code | rg[0] << 8)
        elif fmt == '12x': units.append(code | rg[0] << 8 | rg[1] << 12)
        elif fmt == '11n': units.append(code | rg[0] << 8 | (o['lit'] & 0xf) << 12)
        elif fmt == '21s': units += [code | rg[0] << 8, o['lit'] & 0xffff]
        elif fmt == '31i': v = o['lit'] & 0xffffffff; units += [code | rg[0] << 8, v & 0xffff, v >> 16]
        elif fmt == '10t':
            off = labels[o['tgt']] - at; assert -128 <= off <= 127, 'goto jauh'; units.append(code | (off & 0xff) << 8)
        elif fmt == '20t': units += [code, (labels[o['tgt']] - at) & 0xffff]
        elif fmt == '21t': units += [code | rg[0] << 8, (labels[o['tgt']] - at) & 0xffff]
        elif fmt == '22t': units += [code | rg[0] << 8 | rg[1] << 12, (labels[o['tgt']] - at) & 0xffff]
        elif fmt == '23x': units += [code | rg[0] << 8, rg[1] | rg[2] << 8]
        elif fmt == '22b': units += [code | rg[0] << 8, rg[1] | (o['lit'] & 0xff) << 8]
        elif fmt == '21c':
            k, v = o['ref']; units += [code | rg[0] << 8, idx[k][v]]
        elif fmt == '22c':
            k, v = o['ref']; units += [code | rg[0] << 8 | rg[1] << 12, idx[k][v]]
        elif fmt == '35c':
            c, nme, ps, rt = o['ref'][1]; a = list(rg) + [0] * (5 - len(rg))
            outs = max(outs, len(rg))
            units += [code | len(rg) << 12 | a[4] << 8, idx['m'][o['ref'][1]], a[0] | a[1] << 4 | a[2] << 8 | a[3] << 12]
        else: raise Exception(fmt)
    tries = None
    if m.catch:
        tries = (labels[m.catch[1]], labels[m.catch[2]] - labels[m.catch[1]], labels[m.catch[3]])
    return units, outs, tries

def collect_refs(classes):
    S, T, F, M, P = set(), set(), set(), set(), set()
    def addt(t):
        T.add(t)
        if t[0] == '[':
            T.add(t)
    def addm(ref):
        c, n, ps, r = ref; M.add(ref); addt(c); S.add(n)
        P.add((r, tuple(ps))); addt(r)
        for p in ps: addt(p)
    for k in classes:
        addt(k.name); addt(k.sup); [addt(i) for i in k.ifaces]
        for n, t in k.fields: F.add((k.name, n, t)); S.add(n); addt(t)
        for m in k.methods:
            addm((k.name, m.name, tuple(m.params), m.ret))
            for o in decode_ops(m):
                if 'label' in o: continue
                if o['ref']:
                    kd, v = o['ref']
                    if kd == 's': S.add(v)
                    elif kd == 't': addt(v)
                    elif kd == 'f': F.add(v); S.add(v[1]); addt(v[0]); addt(v[2])
                    elif kd == 'm': addm(v)
            if m.catch: addt(m.catch[0])
            if m.js: addt('Landroid/webkit/JavascriptInterface;')
    for (r, ps) in list(P):
        S.add(shorty(r, ps))
    for t in list(T): S.add(t)
    return S, T, F, M, P

def write_dex(classes):
    S, T, F, M, P = collect_refs(classes)
    strings = sorted(S, key=lambda s: [ord(c) for c in s])
    sidx = {s: i for i, s in enumerate(strings)}
    types = sorted(T, key=lambda t: sidx[t]); tidx = {t: i for i, t in enumerate(types)}
    protos = sorted(P, key=lambda p: (tidx[p[0]], [tidx[x] for x in p[1]])); pidx = {p: i for i, p in enumerate(protos)}
    fields = sorted(F, key=lambda f: (tidx[f[0]], sidx[f[1]], tidx[f[2]])); fidx = {f: i for i, f in enumerate(fields)}
    methods = sorted(M, key=lambda x: (tidx[x[0]], sidx[x[1]], pidx[(x[3], tuple(x[2]))])); midx = {x: i for i, x in enumerate(methods)}
    idx = {'s': sidx, 't': tidx, 'f': fidx, 'm': midx}
    # layout
    H = 0x70
    off_s = H; off_t = off_s + 4 * len(strings); off_p = off_t + 4 * len(types); off_f = off_p + 12 * len(protos)
    off_m = off_f + 8 * len(fields); off_c = off_m + 8 * len(methods); data_off = off_c + 32 * len(classes)
    blob = bytearray(); sections = []  # (type, count, offset)
    def A(n):
        while (data_off + len(blob)) % n: blob.append(0)
    def here(): return data_off + len(blob)
    def section(ty, fn):
        start = here(); cnt = fn()
        if cnt: sections.append((ty, cnt, start))
    # string data
    s_off = []
    def f_str():
        for s in strings:
            s_off.append(here()); blob.extend(uleb(len(s)) + mutf8(s) + b'\0')
        return len(strings)
    section(0x2002, f_str)
    # type lists
    tl_off = {}
    def f_tl():
        A(4); c = 0
        lists = {tuple(p[1]) for p in protos if p[1]} | {tuple(k.ifaces) for k in classes if k.ifaces}
        for l in sorted(lists):
            A(4); tl_off[l] = here(); blob.extend(struct.pack('<I', len(l)) + b''.join(struct.pack('<H', tidx[t]) for t in l)); c += 1
        return c
    A(4); section(0x1001, f_tl)
    # annotation item + set
    ann_set = [0]
    def f_ai():
        if not any(m.js for k in classes for m in k.methods): return 0
        ai = here(); blob.extend(b'\x01' + uleb(tidx['Landroid/webkit/JavascriptInterface;']) + uleb(0)); ann_set.append(ai); return 1
    section(0x2004, f_ai)
    def f_as():
        if len(ann_set) < 2: return 0
        A(4); ann_set[0] = here(); blob.extend(struct.pack('<II', 1, ann_set[1])); return 1
    A(4); section(0x1003, f_as)
    # code items
    code_off = {}
    def f_code():
        c = 0
        for k in classes:
            for m in k.methods:
                units, outs, tries = encode_code(m, idx); A(4); code_off[(k.name, m.name, tuple(m.params), m.ret)] = here()
                hdr = struct.pack('<HHHHII', m.regs, ins_words(m), outs, 1 if tries else 0, 0, len(units))
                body = b''.join(struct.pack('<H', u) for u in units)
                extra = b''
                if tries:
                    if len(units) % 2: body += b'\0\0'
                    st, cnt, hd = tries
                    extra = struct.pack('<IHH', st, cnt, 1) + uleb(1) + sleb(1) + uleb(tidx[m.catch[0]]) + uleb(hd)
                blob.extend(hdr + body + extra); c += 1
        return c
    A(4); section(0x2001, f_code)
    # class data
    cd_off = {}
    def f_cd():
        c = 0
        for k in classes:
            fl = sorted(fidx[(k.name, n, t)] for n, t in k.fields)
            ms = [(midx[(k.name, m.name, tuple(m.params), m.ret)], m) for m in k.methods]
            direct = sorted([x for x in ms if x[1].flags & (8 | 2 | 0x10000)], key=lambda x: x[0])
            virt = sorted([x for x in ms if not x[1].flags & (8 | 2 | 0x10000)], key=lambda x: x[0])
            b = bytearray(uleb(0) + uleb(len(fl)) + uleb(len(direct)) + uleb(len(virt)))
            prev = 0
            for f in fl: b += uleb(f - prev) + uleb(0); prev = f
            for grp in (direct, virt):
                prev = 0
                for mi, m in grp:
                    b += uleb(mi - prev) + uleb(m.flags) + uleb(code_off[(k.name, m.name, tuple(m.params), m.ret)]); prev = mi
            cd_off[k.name] = here(); blob.extend(b); c += 1
        return c
    section(0x2000, f_cd)
    # annotations directory
    ad_off = {}
    def f_ad():
        c = 0
        for k in classes:
            am = sorted(midx[(k.name, m.name, tuple(m.params), m.ret)] for m in k.methods if m.js)
            if am:
                A(4); ad_off[k.name] = here()
                blob.extend(struct.pack('<IIII', 0, 0, len(am), 0) + b''.join(struct.pack('<II', x, ann_set[0]) for x in am)); c += 1
        return c
    A(4); section(0x2006, f_ad)
    # map list placeholder size
    A(4); map_off = here()
    nsec = len(sections) + 8  # header, 6 id sections (type..class_def incl. string_id), map
    # build tables now
    out_ids = bytearray()
    for s in strings: out_ids += struct.pack('<I', s_off[sidx[s]])
    for t in types: out_ids += struct.pack('<I', sidx[t])
    for (r, ps) in protos:
        out_ids += struct.pack('<III', sidx[shorty(r, ps)], tidx[r], tl_off[tuple(ps)] if ps else 0)
    for (c, n, t) in fields: out_ids += struct.pack('<HHI', tidx[c], tidx[t], sidx[n])
    for (c, n, ps, r) in methods: out_ids += struct.pack('<HHI', tidx[c], pidx[(r, tuple(ps))], sidx[n])
    for k in classes:
        ifo = tl_off[tuple(k.ifaces)] if k.ifaces else 0
        out_ids += struct.pack('<IIIIIIII', tidx[k.name], k.flags, tidx[k.sup], ifo, 0xffffffff, ad_off.get(k.name, 0), cd_off[k.name], 0)
    # map list
    ml = [(0x0000, 1, 0), (0x0001, len(strings), off_s), (0x0002, len(types), off_t), (0x0003, len(protos), off_p)]
    if fields: ml.append((0x0004, len(fields), off_f))
    ml += [(0x0005, len(methods), off_m), (0x0006, len(classes), off_c)]
    ml += sorted(sections, key=lambda x: x[2])
    ml.append((0x1000, 1, map_off))
    mb = struct.pack('<I', len(ml)) + b''.join(struct.pack('<HHII', t, 0, c, o) for t, c, o in ml)
    blob.extend(mb)
    total = data_off + len(blob)
    hdr = bytearray(b'dex\n035\0' + b'\0' * 24)
    hdr += struct.pack('<IIIIIIIIIIIIIIIIII', total, H, 0x12345678, 0, 0, map_off,
                       len(strings), off_s, len(types), off_t, len(protos), off_p, len(fields), off_f if fields else 0,
                       len(methods), off_m, len(classes), off_c)
    hdr += struct.pack('<II', total - data_off, data_off)
    assert len(hdr) == H, len(hdr)
    f = bytearray(hdr) + out_ids + blob
    assert len(f) == total, (len(f), total)
    f[12:32] = hashlib.sha1(bytes(f[32:])).digest()
    f[8:12] = struct.pack('<I', zlib.adler32(bytes(f[12:])) & 0xffffffff)
    return bytes(f)

# ---------------------------------------------------------------- dex reader / validator (independen)
def rd_uleb(b, o):
    r = s = 0
    while True:
        x = b[o]; o += 1; r |= (x & 0x7f) << s; s += 7
        if not x & 0x80: return r, o

def read_dex(b, verbose=False):
    rep = []
    assert b[:8] == b'dex\n035\0', 'magic'
    chk, = struct.unpack_from('<I', b, 8); assert chk == zlib.adler32(b[12:]) & 0xffffffff, 'adler32'
    assert b[12:32] == hashlib.sha1(b[32:]).digest(), 'sha1'
    (fsz, hsz, endian, lsz, loff, moff, ss, so, ts, to, ps, po, fs, fo, ms, mo, cs, co, dsz, doff) = struct.unpack_from('<' + 'I' * 20, b, 32)
    assert fsz == len(b) and hsz == 0x70 and endian == 0x12345678 and doff + dsz == fsz
    def S(i):
        o, = struct.unpack_from('<I', b, so + 4 * i); n, o2 = rd_uleb(b, o); e = b.index(b'\0', o2); assert e - o2 == n or True; return b[o2:e].decode('latin1')
    strs = [S(i) for i in range(ss)]
    assert strs == sorted(strs, key=lambda s: [ord(c) for c in s]), 'string_ids tidak terurut'
    types = [struct.unpack_from('<I', b, to + 4 * i)[0] for i in range(ts)]; assert types == sorted(types), 'type_ids tidak terurut'
    protos = [struct.unpack_from('<III', b, po + 12 * i) for i in range(ps)]
    fl = [struct.unpack_from('<HHI', b, fo + 8 * i) for i in range(fs)]
    assert fl == sorted(fl, key=lambda x: (x[0], x[2], x[1])), 'field_ids'
    mt = [struct.unpack_from('<HHI', b, mo + 8 * i) for i in range(ms)]
    assert mt == sorted(mt, key=lambda x: (x[0], x[2], x[1])), 'method_ids tidak terurut'
    T = lambda i: strs[types[i]]
    def PR(i):
        sh, rt, par = protos[i]; ps_ = []
        if par:
            n, = struct.unpack_from('<I', b, par); assert par % 4 == 0
            ps_ = [T(struct.unpack_from('<H', b, par + 4 + 2 * j)[0]) for j in range(n)]
        return '(' + ''.join(ps_) + ')' + T(rt)
    def MN(i): c, p, n = mt[i]; return '%s->%s%s' % (T(c), strs[n], PR(p))
    def FN(i): c, t, n = fl[i]; return '%s->%s:%s' % (T(c), strs[n], T(t))
    # map list
    n, = struct.unpack_from('<I', b, moff); prev = -1
    for j in range(n):
        t, _, c, o = struct.unpack_from('<HHII', b, moff + 4 + 12 * j); assert o > prev or j == 0, 'map tak terurut'; prev = o
    rep.append('map_list: %d entri OK' % n)
    # class defs
    methods_dis = {}; targets = []
    for ci in range(cs):
        (cidx, acc, sup, ifo, srcf, anno, cdo, sv) = struct.unpack_from('<IIIIIIII', b, co + 32 * ci)
        cname = T(cidx)
        o = cdo; sfn, o = rd_uleb(b, o); ifn, o = rd_uleb(b, o); dmn, o = rd_uleb(b, o); vmn, o = rd_uleb(b, o)
        prev = 0
        for _ in range(sfn + ifn): d, o = rd_uleb(b, o); _, o = rd_uleb(b, o)
        for grp, cnt in (('direct', dmn), ('virtual', vmn)):
            prev = 0
            for _ in range(cnt):
                d, o = rd_uleb(b, o); fl_, o = rd_uleb(b, o); co_, o = rd_uleb(b, o); prev += d
                methods_dis[(cname, MN(prev))] = (fl_, co_)
        if anno:
            a = struct.unpack_from('<IIII', b, anno); rep.append('  %s: annotated_methods=%d' % (cname, a[2]))
    # decode code items
    for (cname, mname), (flags, cof) in methods_dis.items():
        regs, ins, outs, tr, dbg, isz = struct.unpack_from('<HHHHII', b, cof); assert cof % 4 == 0
        o = cof + 16; units = struct.unpack_from('<%dH' % isz, b, o); i = 0; starts = set(); text = []
        while i < isz:
            op = units[i] & 0xff
            if op not in BYOP: raise AssertionError('opcode tak dikenal %02x di %s %s @%d' % (op, cname, mname, i))
            nm, fm = BYOP[op]; starts.add(i); sz = FSIZE[fm]; u = units[i:i + sz]
            A_ = (u[0] >> 8) & 0xff; B_ = u[0] >> 12
            if fm == '35c':
                cnt = u[0] >> 12; regs_ = [u[2] & 0xf, (u[2] >> 4) & 0xf, (u[2] >> 8) & 0xf, (u[2] >> 12) & 0xf, (u[0] >> 8) & 0xf][:cnt]
                text.append('%04x: %s {%s}, %s' % (i, nm, ','.join('v%d' % r for r in regs_), MN(u[1])))
            elif fm == '21c':
                ref = strs[u[1]] if nm == 'const-string' else T(u[1]); text.append('%04x: %s v%d, %r' % (i, nm, A_, ref))
            elif fm == '22c':
                ref = FN(u[1]) if nm.startswith(('iget', 'iput')) else T(u[1]); text.append('%04x: %s v%d, v%d, %s' % (i, nm, A_ & 0xf if False else A_, B_, ref))
            elif fm in ('21t', '22t', '20t', '10t'):
                off = (u[1] if fm != '10t' else A_) ; off = off - 65536 if (fm != '10t' and off > 32767) else (off - 256 if fm == '10t' and off > 127 else off)
                text.append('%04x: %s ... -> %04x' % (i, nm, i + off)); starts_t = i + off
                text[-1] += ''
                targets.append((cname, mname, i + off))
            else: text.append('%04x: %s' % (i, nm))
            i += sz
        assert i == isz, 'dekode overshoot'
        if verbose: rep.append('%s %s regs=%d ins=%d outs=%d insns=%d tries=%d\n   ' % (cname, mname, regs, ins, outs, isz, tr) + '\n   '.join(text))
        for (c2, m2, tgt) in [x for x in targets if x[0] == cname and x[1] == mname]:
            assert tgt in starts, 'target cabang tidak jatuh di batas instruksi: %s %s -> %04x' % (cname, mname, tgt)
        if tr:
            pad = 2 if isz % 2 else 0; to_ = o + 2 * isz + pad; st, cnt, hoff = struct.unpack_from('<IHH', b, to_)
            assert st + cnt <= isz and st in starts, 'try range'
            hbase = to_ + 8; nn, p2 = rd_uleb(b, hbase); sz_, p3 = struct.unpack_from('<b', b, hbase + hoff)[0], hbase + hoff + 1
            ti, p3 = rd_uleb(b, p3); ad, p3 = rd_uleb(b, p3); assert ad in starts, 'handler addr'
    rep.append('%d metode didekode ulang: batas instruksi & target cabang konsisten' % len(methods_dis))
    return rep

def build(smali_dir):
    classes = []
    for root, _, files in sorted(os.walk(smali_dir)):
        for fn in sorted(files):
            if fn.endswith('.smali'): classes.append(parse_smali(open(os.path.join(root, fn), encoding='utf8').read()))
    assert classes, 'tidak ada .smali'
    for k in classes:
        for m in k.methods: verify_method(k, m)
    return write_dex(classes), classes

if __name__ == '__main__':
    d, cl = build(sys.argv[1])
    for r in read_dex(d, verbose=len(sys.argv) > 3): print(r)
    open(sys.argv[2], 'wb').write(d); print('classes.dex', len(d), 'bytes')
