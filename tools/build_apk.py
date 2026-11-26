#!/usr/bin/env python3
"""Membangun APK tanpa Android SDK: AXML + ARSC + classes.dex (dexasm) + ZIP + tanda tangan APK v2.
Pemakaian:  python3 tools/build_apk.py [--no-icon] [--out nama.apk]
"""
import os, sys, struct, zlib, hashlib, subprocess, shutil, io, json
sys.path.insert(0, os.path.dirname(__file__))
import dexasm
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PKG, APPNAME, VCODE, VNAME = 'com.nimiyo.nexora', 'Nimiyo', 1, '1.0.0'
MINSDK, TARGETSDK = 24, 34

# ============================================================ string pool / AXML
def pool(strings, utf8=False):
    assert not utf8
    data = bytearray(); offs = []
    for s in strings:
        offs.append(len(data)); assert len(s) < 0x7fff
        data += struct.pack('<H', len(s)) + s.encode('utf-16le') + b'\0\0'
    while len(data) % 4: data.append(0)
    start = 28 + 4 * len(strings)
    size = start + len(data)
    return struct.pack('<HHIIIIII', 1, 28, size, len(strings), 0, 0, start, 0) + b''.join(struct.pack('<I', o) for o in offs) + bytes(data)

ANS = 'http://schemas.android.com/apk/res/android'
RID = {'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003, 'versionCode': 0x0101021b, 'versionName': 0x0101021c,
       'minSdkVersion': 0x0101020c, 'targetSdkVersion': 0x01010270, 'maxSdkVersion': 0x01010271, 'exported': 0x01010010,
       'configChanges': 0x0101001f, 'windowSoftInputMode': 0x0101022b, 'launchMode': 0x0101001d,
       'usesCleartextTraffic': 0x010104ec, 'hardwareAccelerated': 0x010102d3, 'allowBackup': 0x01010280, 'mimeType': 0x01010026}
T_REF, T_STR, T_DEC, T_HEX, T_BOOL = 1, 3, 0x10, 0x11, 0x12

def E(name, attrs=(), kids=()):
    """attrs: (ns:bool, nama, tipe, nilai)"""
    return {'n': name, 'a': list(attrs), 'k': list(kids)}

def build_axml(root):
    named = {}
    def walk(e):
        for ns, n, t, v in e['a']:
            if ns: named[n] = RID[n]
        for k in e['k']: walk(k)
    walk(root)
    names = sorted(named, key=lambda n: named[n])            # string 0..k-1 = atribut ber-resource-id
    strings = list(names); sidx = {s: i for i, s in enumerate(strings)}
    def S(s):
        if s not in sidx: sidx[s] = len(strings); strings.append(s)
        return sidx[s]
    S('android'); S(ANS)
    def walk2(e):
        S(e['n'])
        for ns, n, t, v in e['a']:
            S(n)
            if t == T_STR: S(v)
        for k in e['k']: walk2(k)
    walk2(root)
    body = bytearray()
    body += struct.pack('<HHIIIII', 0x0100, 16, 24, 1, 0xffffffff, sidx['android'], sidx[ANS])
    def emit(e):
        ats = sorted(e['a'], key=lambda a: (RID[a[1]] if a[0] else 0xffffffff, a[1]))
        ab = bytearray()
        for ns, n, t, v in ats:
            if t == T_STR: raw, data = sidx[v], sidx[v]
            else:
                raw = 0xffffffff; data = v & 0xffffffff
            ab += struct.pack('<IIIHBBI', sidx[ANS] if ns else 0xffffffff, sidx[n], raw, 8, 0, t, data)
        body.extend(struct.pack('<HHIIIIIHHHHHH', 0x0102, 16, 36 + 20 * len(ats), 1, 0xffffffff, 0xffffffff, sidx[e['n']], 0x14, 0x14, len(ats), 0, 0, 0) + ab)
        for k in e['k']: emit(k)
        body.extend(struct.pack('<HHIIIII', 0x0103, 16, 24, 1, 0xffffffff, 0xffffffff, sidx[e['n']]))
    emit(root)
    body += struct.pack('<HHIIIII', 0x0101, 16, 24, 1, 0xffffffff, sidx['android'], sidx[ANS])
    sp = pool(strings)
    rm = struct.pack('<HHI', 0x0180, 8, 8 + 4 * len(names)) + b''.join(struct.pack('<I', RID[n]) for n in names)
    total = 8 + len(sp) + len(rm) + len(body)
    return struct.pack('<HHI', 3, 8, total) + sp + rm + bytes(body)

def manifest(icon):
    A = lambda n, t, v: (True, n, t, v)
    cfg = 0x80 | 0x20 | 0x10 | 0x400 | 0x800 | 0x100 | 0x200 | 0x4 | 0x2000 | 0x1000
    app_attrs = [A('label', T_STR, APPNAME), A('allowBackup', T_BOOL, 0), A('usesCleartextTraffic', T_BOOL, 0xffffffff), A('hardwareAccelerated', T_BOOL, 0xffffffff)]
    if icon: app_attrs.append(A('icon', T_REF, 0x7f010000))
    act = E('activity', [A('name', T_STR, 'nx.M'), A('label', T_STR, APPNAME), A('exported', T_BOOL, 0xffffffff), A('configChanges', T_HEX, cfg),
                         A('windowSoftInputMode', T_HEX, 0x10), A('launchMode', T_HEX, 2)], [
        E('intent-filter', [], [E('action', [A('name', T_STR, 'android.intent.action.MAIN')]), E('category', [A('name', T_STR, 'android.intent.category.LAUNCHER')])]),
        E('intent-filter', [], [E('action', [A('name', T_STR, 'android.intent.action.SEND')]), E('category', [A('name', T_STR, 'android.intent.category.DEFAULT')]), E('data', [A('mimeType', T_STR, 'text/plain')])]),
    ])
    root = E('manifest', [A('versionCode', T_DEC, VCODE), A('versionName', T_STR, VNAME), (False, 'package', T_STR, PKG)], [
        E('uses-sdk', [A('minSdkVersion', T_DEC, MINSDK), A('targetSdkVersion', T_DEC, TARGETSDK)]),
        E('uses-permission', [A('name', T_STR, 'android.permission.INTERNET')]),
        E('uses-permission', [A('name', T_STR, 'android.permission.WRITE_EXTERNAL_STORAGE'), A('maxSdkVersion', T_DEC, 28)]),
        E('application', app_attrs, [act]),
    ])
    return build_axml(root)

# ============================================================ ARSC (hanya 1 resource: @mipmap/ic -> res/mipmap/ic.png)
def build_arsc(path='res/mipmap/ic.png'):
    gp = pool([path]); tp = pool(['mipmap']); kp = pool(['ic'])
    name = PKG.encode('utf-16le').ljust(256, b'\0')
    spec = struct.pack('<HHIBBHI', 0x0202, 16, 20, 1, 0, 0, 1) + struct.pack('<I', 0)
    cfg = struct.pack('<I', 64) + b'\0' * 60
    entry = struct.pack('<HHI', 8, 0, 0) + struct.pack('<HBBI', 8, 0, 3, 0)
    typ_size = 84 + 4 + len(entry)
    typ = struct.pack('<HHIBBHII', 0x0201, 84, typ_size, 1, 0, 0, 1, 88) + cfg + struct.pack('<I', 0) + entry
    assert len(typ) == typ_size
    pkg_hdr_size = 288
    type_off = pkg_hdr_size; key_off = type_off + len(tp)
    pkg_size = pkg_hdr_size + len(tp) + len(kp) + len(spec) + len(typ)
    pkg = struct.pack('<HHII', 0x0200, pkg_hdr_size, pkg_size, 0x7f) + name + struct.pack('<IIIII', type_off, 1, key_off, 1, 0) + tp + kp + spec + typ
    assert len(pkg) == pkg_size
    return struct.pack('<HHII', 2, 12, 12 + len(gp) + len(pkg), 1) + gp + pkg

# ============================================================ ikon
def make_icon(size=192):
    from PIL import Image, ImageDraw
    S = 4; n = size * S
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    a, b = (155, 124, 255), (56, 185, 222)
    g = Image.new('RGBA', (n, n))
    px = g.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * n - 2)
            px[x, y] = (int(a[0] + (b[0] - a[0]) * t), int(a[1] + (b[1] - a[1]) * t), int(a[2] + (b[2] - a[2]) * t), 255)
    m = Image.new('L', (n, n), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * 0.24), fill=255)
    im.paste(g, (0, 0), m)
    d = ImageDraw.Draw(im); u = n / 64.0
    d.polygon([(14 * u, 47 * u), (14 * u, 17 * u), (22 * u, 17 * u), (42 * u, 36 * u), (42 * u, 17 * u), (50 * u, 17 * u), (50 * u, 47 * u), (42 * u, 47 * u), (22 * u, 28 * u), (22 * u, 47 * u)], fill=(255, 255, 255, 240))
    d.ellipse([44 * u, 9 * u, 54 * u, 19 * u], fill=(113, 225, 220, 255))
    im = im.resize((size, size), Image.LANCZOS)
    bio = io.BytesIO(); im.save(bio, 'PNG', optimize=True); return bio.getvalue()

# ============================================================ ZIP + v2
def dos(): return 0, ((2026 - 1980) << 9) | (1 << 5) | 1

class Zip:
    def __init__(s): s.buf = bytearray(); s.cd = []
    def add(s, name, data, stored=False):
        nb = name.encode(); crc = zlib.crc32(data) & 0xffffffff
        if stored: cdata, method = data, 0
        else:
            c = zlib.compressobj(9, zlib.DEFLATED, -15); cdata = c.compress(data) + c.flush(); method = 8
            if len(cdata) >= len(data): cdata, method = data, 0
        off = len(s.buf); extra = b''
        if method == 0:
            ds = off + 30 + len(nb)
            pad = (-ds) % 4
            if pad: 
                pad = pad if pad >= 4 else pad + 4
                extra = struct.pack('<HH', 0xd935, pad - 4) + b'\0' * (pad - 4)
        t, d = dos()
        s.buf += struct.pack('<IHHHHHIIIHH', 0x04034b50, 20, 0, method, t, d, crc, len(cdata), len(data), len(nb), len(extra)) + nb + extra + cdata
        s.cd.append((nb, method, t, d, crc, len(cdata), len(data), off))
    def entries(s): return bytes(s.buf)
    def central(s):
        o = bytearray()
        for nb, method, t, d, crc, cs, us, off in s.cd:
            o += struct.pack('<IHHHHHHIIIHHHHHII', 0x02014b50, 0x0314, 20, 0, method, t, d, crc, cs, us, len(nb), 0, 0, 0, 0, 0, off) + nb
        return bytes(o)
    def eocd(s, cd_size, cd_off): return struct.pack('<IHHHHIIH', 0x06054b50, 0, 0, len(s.cd), len(s.cd), cd_size, cd_off, 0)

def chunk_digests(parts):
    ds = []
    for p in parts:
        for i in range(0, len(p), 1 << 20):
            c = p[i:i + (1 << 20)]; ds.append(hashlib.sha256(b'\xa5' + struct.pack('<I', len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + struct.pack('<I', len(ds)) + b''.join(ds)).digest()

def lp(b): return struct.pack('<I', len(b)) + b

def get_key():
    kd = os.path.join(ROOT, 'tools', 'keys'); os.makedirs(kd, exist_ok=True)
    kp, cp = os.path.join(kd, 'release-key.pem'), os.path.join(kd, 'release-cert.pem')
    if os.path.exists(kp) and os.path.exists(cp):
        return serialization.load_pem_private_key(open(kp, 'rb').read(), None), x509.load_pem_x509_certificate(open(cp, 'rb').read())
    key = rsa.generate_private_key(65537, 2048)
    nm = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Nimiyo Nexora'), x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'Nexora Link')])
    now = datetime.datetime(2026, 1, 1)
    cert = x509.CertificateBuilder().subject_name(nm).issuer_name(nm).public_key(key.public_key()).serial_number(x509.random_serial_number()) \
        .not_valid_before(now).not_valid_after(now + datetime.timedelta(days=365 * 30)).sign(key, hashes.SHA256())
    open(kp, 'wb').write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    open(cp, 'wb').write(cert.public_bytes(serialization.Encoding.PEM))
    return key, cert

def sign_v2(z):
    key, cert = get_key()
    entries, cd = z.entries(), z.central()
    digest = chunk_digests([entries, cd, z.eocd(len(cd), len(entries))])
    certd = cert.public_bytes(serialization.Encoding.DER)
    pub = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    ALGO = 0x0103
    digests = lp(struct.pack('<II', ALGO, len(digest)) + digest)
    signed = lp(digests) + lp(lp(certd)) + lp(b'')
    sig = key.sign(signed, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed) + lp(lp(struct.pack('<II', ALGO, len(sig)) + sig)) + lp(pub)
    value = lp(lp(signer))
    pair = struct.pack('<QI', 4 + len(value), 0x7109871a) + value
    block = struct.pack('<Q', len(pair) + 24) + pair + struct.pack('<Q', len(pair) + 24) + b'APK Sig Block 42'
    return entries + block + cd + z.eocd(len(cd), len(entries) + len(block))

# ---------- verifikasi balik (meniru langkah Android)
def verify_apk(apk):
    eo = apk.rfind(b'PK\x05\x06'); _, _, _, n, _, cdsz, cdoff, _ = struct.unpack_from('<IHHHHIIH', apk, eo)
    assert apk[cdoff - 16:cdoff] == b'APK Sig Block 42', 'magic blok'
    bsz, = struct.unpack_from('<Q', apk, cdoff - 24); bstart = cdoff - bsz - 8
    assert struct.unpack_from('<Q', apk, bstart)[0] == bsz, 'ukuran blok'
    p = bstart + 8; found = None
    while p < cdoff - 24:
        ln, id_ = struct.unpack_from('<QI', apk, p)
        if id_ == 0x7109871a: found = apk[p + 12:p + 8 + ln]
        p += 8 + ln
    assert found, 'tidak ada pasangan v2'
    def rd(b, o):
        l, = struct.unpack_from('<I', b, o); return b[o + 4:o + 4 + l], o + 4 + l
    signers, _ = rd(found, 0); signer, _ = rd(signers, 0)
    signed, o = rd(signer, 0); sigs, o = rd(signer, o); pub, o = rd(signer, o)
    sg, _ = rd(sigs, 0); algo, sl = struct.unpack_from('<II', sg, 0); sig = sg[8:8 + sl]
    key = serialization.load_der_public_key(pub); key.verify(sig, signed, padding.PKCS1v15(), hashes.SHA256())
    digs, o2 = rd(signed, 0); certs, _ = rd(signed, o2); dg, _ = rd(digs, 0); a2, dl = struct.unpack_from('<II', dg, 0); want = dg[8:8 + dl]
    entries = apk[:bstart]; cd = apk[cdoff:eo]; ee = bytearray(apk[eo:]); struct.pack_into('<I', ee, 16, bstart)
    got = chunk_digests([entries, cd, bytes(ee)])
    assert got == want, 'digest tidak cocok'
    c0, _ = rd(certs, 0); assert x509.load_der_x509_certificate(c0).public_key().public_numbers() == key.public_numbers(), 'kunci != sertifikat'
    return 'v2 OK: RSA-SHA256 tanda tangan valid, digest cocok, cert=kunci'

def check_zip(apk):
    import zipfile
    zf = zipfile.ZipFile(io.BytesIO(apk)); assert zf.testzip() is None
    # alignment entri stored
    off = {}
    for zi in zf.infolist():
        if zi.compress_type == 0:
            ds = zi.header_offset + 30 + len(zi.filename.encode()) + struct.unpack_from('<H', apk, zi.header_offset + 28)[0]
            assert ds % 4 == 0, 'tidak sejajar: ' + zi.filename
    return [(i.filename, i.compress_type, i.file_size, i.compress_size) for i in zf.infolist()]

def check_arsc(b):
    t, hs, sz, pc = struct.unpack_from('<HHII', b, 0); assert t == 2 and hs == 12 and sz == len(b) and pc == 1
    o = 12
    t, hs, sz, sc, st, fl, ss, ys = struct.unpack_from('<HHIIIIII', b, o); assert t == 1 and sz % 4 == 0; o += sz
    t, hs, sz, pid = struct.unpack_from('<HHII', b, o); assert t == 0x200 and hs == 288 and pid == 0x7f and o + sz == len(b)
    q = o + hs
    while q < len(b):
        t, hs2, sz2 = struct.unpack_from('<HHI', b, q); assert sz2 >= hs2 and sz2 % 4 == 0, (hex(t), sz2); q += sz2
    assert q == len(b); return 'arsc: chunk & ukuran konsisten'

def check_axml(b):
    t, hs, sz = struct.unpack_from('<HHI', b, 0); assert t == 3 and sz == len(b)
    q = 8; kinds = []
    while q < len(b):
        t, hs2, sz2 = struct.unpack_from('<HHI', b, q); assert sz2 % 4 == 0 and q + sz2 <= len(b); kinds.append(hex(t)); q += sz2
    assert q == len(b)
    depth = kinds.count('0x102') - kinds.count('0x103'); assert depth == 0
    return 'axml: %d chunk, tag seimbang' % len(kinds)

# ============================================================ build
def minify_assets(tmp):
    web = os.path.join(ROOT, 'web'); out = {}
    es = '/opt/npm-tools/node_modules/.bin/esbuild'
    if not os.path.exists(es): es = shutil.which('esbuild')
    for f in ('app.js', 'engine.js', 'app.css'):
        src = os.path.join(web, f)
        if es:
            r = subprocess.run([es, src, '--minify', '--target=es2019', '--log-level=error'], capture_output=True)
            if r.returncode == 0 and r.stdout: out[f] = r.stdout; continue
        out[f] = open(src, 'rb').read()
    h = open(os.path.join(web, 'index.html'), encoding='utf8').read()
    import re
    h = re.sub(r'>\s+<', '><', re.sub(r'\n\s*', '', h)); out['index.html'] = h.encode()
    return out

def build(noicon=False, outname=None):
    classes_dex, _ = dexasm.build(os.path.join(ROOT, 'native', 'smali'))
    dexasm.read_dex(classes_dex)
    z = Zip(); icon = not noicon
    z.add('AndroidManifest.xml', manifest(icon))
    z.add('classes.dex', classes_dex)
    if icon:
        z.add('resources.arsc', build_arsc(), stored=True)
        z.add('res/mipmap/ic.png', make_icon(), stored=True)
    assets = minify_assets(None)
    for k in ('index.html', 'app.js', 'engine.js', 'app.css'): z.add('assets/' + k, assets[k])
    apk = sign_v2(z)
    outname = outname or os.path.join(ROOT, 'dist', 'Nimiyo-Nexora-v%s%s.apk' % (VNAME, '-noicon' if noicon else ''))
    os.makedirs(os.path.dirname(outname), exist_ok=True); open(outname, 'wb').write(apk)
    rep = [verify_apk(apk), check_axml(z_get(apk, 'AndroidManifest.xml'))]
    if icon: rep.append(check_arsc(z_get(apk, 'resources.arsc')))
    info = check_zip(apk)
    return outname, len(apk), rep, info

def z_get(apk, name):
    import zipfile
    return zipfile.ZipFile(io.BytesIO(apk)).read(name)

if __name__ == '__main__':
    noicon = '--no-icon' in sys.argv
    outn = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
    name, size, rep, info = build(noicon, outn)
    print(name, size, 'bytes (%.1f KB)' % (size / 1024))
    for r in rep: print(' ✓', r)
    for i in info: print('   ', i)
