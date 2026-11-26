#!/usr/bin/env node
/* Pembuat paket update scraper (OTA) + penerjemah scrapr.
 *
 *   node tools/make-ota.js ["catatan"] [minAppVersion]
 *   env SCRAPR_DIR=<folder clone coflyn/scrapr>   -> ikut menerjemahkan scrapr (opsional)
 *       SCRAPR_SHA=<commit>                        -> dicatat di changelog
 *
 * Hasil: ota/bundle.js + ota/scrapers-version.json  (SATU file bundle = scrapr terjemahan + web/engine.js)
 * Versi (scraperVersion) naik OTOMATIS hanya bila isi bundle berubah; tidak perlu edit `const SV` manual.
 *
 * Fungsi shim* di bawah dijalankan di WebView (bukan di Node): di-stringify lalu dimasukkan ke bundle.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');

/* =============================== SHIM: Buffer =============================== */
function shimBuffer() {
  const e8 = new TextEncoder(), d8 = new TextDecoder();
  const b64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, ''); while (s.length % 4) s += '='; const bin = atob(s), o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; };
  class Buffer extends Uint8Array {
    static from(v, e) {
      if (typeof v === 'string') {
        e = (e || 'utf8').toLowerCase(); let u;
        if (e === 'base64' || e === 'base64url') u = b64(v);
        else if (e === 'hex') { u = new Uint8Array(v.length >> 1); for (let i = 0; i < u.length; i++) u[i] = parseInt(v.substr(i * 2, 2), 16); }
        else if (e === 'binary' || e === 'latin1') u = Uint8Array.from(v, c => c.charCodeAt(0) & 255);
        else u = e8.encode(v);
        return new Buffer(u.buffer, u.byteOffset, u.length);
      }
      if (v instanceof ArrayBuffer) return new Buffer(v.slice(0));
      if (ArrayBuffer.isView(v) || Array.isArray(v)) { const u = Uint8Array.from(v); return new Buffer(u.buffer, 0, u.length); }
      throw new TypeError('Buffer.from: tipe tidak didukung');
    }
    static alloc(n, f) { const b = new Buffer(n); if (f) b.fill(f); return b; }
    static concat(l) { let n = 0; l.forEach(x => n += x.length); const o = new Buffer(n); let p = 0; l.forEach(x => { o.set(x, p); p += x.length; }); return o; }
    static isBuffer(b) { return b instanceof Buffer; }
    static byteLength(s) { return typeof s === 'string' ? e8.encode(s).length : s.length; }
    toString(e) {
      e = (e || 'utf8').toLowerCase();
      if (e === 'hex') return Array.from(this, x => x.toString(16).padStart(2, '0')).join('');
      if (e === 'base64' || e === 'base64url' || e === 'binary' || e === 'latin1') {
        let s = ''; for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000));
        if (e === 'binary' || e === 'latin1') return s;
        const b = btoa(s); return e === 'base64url' ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b;
      }
      return d8.decode(this);
    }
    slice(a, b) { return this.subarray(a, b); }
    equals(o) { if (this.length !== o.length) return false; for (let i = 0; i < this.length; i++) if (this[i] !== o[i]) return false; return true; }
  }
  return { Buffer };
}

/* =============================== SHIM: crypto =============================== */
function shimCrypto(Buffer) {
  const K = [], H0 = [];
  for (let p = 2, c = 0; c < 64; p++) { let pr = 1; for (let d = 2; d * d <= p; d++) if (p % d === 0) { pr = 0; break; } if (pr) { K[c] = Math.floor((Math.cbrt(p) % 1) * 4294967296); if (c < 8) H0[c] = Math.floor((Math.sqrt(p) % 1) * 4294967296); c++; } }
  const R = (x, k) => (x >>> k) | (x << (32 - k));
  function sha256(b) {
    const l = b.length, n = ((l + 9 + 63) >> 6) << 6, d = new Uint8Array(n); d.set(b); d[l] = 128;
    const dv = new DataView(d.buffer); dv.setUint32(n - 4, (l * 8) >>> 0); dv.setUint32(n - 8, Math.floor(l * 8 / 4294967296));
    const h = H0.slice(), w = new Uint32Array(64);
    for (let o = 0; o < n; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) { const a = w[i - 15], c = w[i - 2]; w[i] = (w[i - 16] + (R(a, 7) ^ R(a, 18) ^ (a >>> 3)) + w[i - 7] + (R(c, 17) ^ R(c, 19) ^ (c >>> 10))) >>> 0; }
      let [a, b2, c2, d2, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (R(e, 6) ^ R(e, 11) ^ R(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0, t2 = ((R(a, 2) ^ R(a, 13) ^ R(a, 22)) + ((a & b2) ^ (a & c2) ^ (b2 & c2))) >>> 0;
        hh = g; g = f; f = e; e = (d2 + t1) >>> 0; d2 = c2; c2 = b2; b2 = a; a = (t1 + t2) >>> 0;
      }
      [a, b2, c2, d2, e, f, g, hh].forEach((x, i) => h[i] = (h[i] + x) >>> 0);
    }
    const out = new Uint8Array(32), ov = new DataView(out.buffer); h.forEach((x, i) => ov.setUint32(i * 4, x)); return out;
  }
  /* AES (dekripsi CBC) */
  const sbox = new Uint8Array(256), inv = new Uint8Array(256);
  (() => {
    let p = 1, q = 1; const rl = (x, s) => ((x << s) | (x >> (8 - s))) & 255;
    do {
      p = (p ^ (p << 1) ^ (p & 0x80 ? 0x1b : 0)) & 255;
      q ^= q << 1; q &= 255; q ^= q << 2; q &= 255; q ^= q << 4; q &= 255; if (q & 0x80) q ^= 0x09;
      sbox[p] = (q ^ rl(q, 1) ^ rl(q, 2) ^ rl(q, 3) ^ rl(q, 4) ^ 0x63) & 255;
    } while (p !== 1);
    sbox[0] = 0x63; for (let i = 0; i < 256; i++) inv[sbox[i]] = i;
  })();
  const xt = x => ((x << 1) ^ (x & 0x80 ? 0x1b : 0)) & 255;
  const gm = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };
  function expand(key) {
    const Nk = key.length / 4, Nr = Nk + 6, w = new Uint8Array(16 * (Nr + 1)); w.set(key); let rc = 1;
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
      let t = Array.from(w.subarray((i - 1) * 4, i * 4));
      if (i % Nk === 0) { t = [sbox[t[1]] ^ rc, sbox[t[2]], sbox[t[3]], sbox[t[0]]]; rc = xt(rc); }
      else if (Nk > 6 && i % Nk === 4) t = t.map(b => sbox[b]);
      for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ t[j];
    }
    return { w, Nr };
  }
  function decBlock(s, ks) {
    const { w, Nr } = ks, add = r => { for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i]; };
    const isr = () => { const o = s.slice(); for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[r + 4 * c] = o[r + 4 * ((c - r + 4) % 4)]; };
    const isb = () => { for (let i = 0; i < 16; i++) s[i] = inv[s[i]]; };
    const imc = () => { for (let c = 0; c < 4; c++) { const a = s.slice(c * 4, c * 4 + 4); s[c * 4] = gm(a[0], 14) ^ gm(a[1], 11) ^ gm(a[2], 13) ^ gm(a[3], 9); s[c * 4 + 1] = gm(a[0], 9) ^ gm(a[1], 14) ^ gm(a[2], 11) ^ gm(a[3], 13); s[c * 4 + 2] = gm(a[0], 13) ^ gm(a[1], 9) ^ gm(a[2], 14) ^ gm(a[3], 11); s[c * 4 + 3] = gm(a[0], 11) ^ gm(a[1], 13) ^ gm(a[2], 9) ^ gm(a[3], 14); } };
    add(Nr); for (let r = Nr - 1; r >= 1; r--) { isr(); isb(); add(r); imc(); } isr(); isb(); add(0); return s;
  }
  function cbcDec(key, iv, ct) {
    if (ct.length % 16) throw new Error('error:1C80006B:Provider routines::wrong final block length');
    const ks = expand(key), out = new Buffer(ct.length); let prev = iv;
    for (let o = 0; o < ct.length; o += 16) { const blk = ct.slice(o, o + 16), d = decBlock(Uint8Array.from(blk), ks); for (let i = 0; i < 16; i++) out[o + i] = d[i] ^ prev[i]; prev = blk; }
    return out;
  }
  function createHash(alg) {
    if (!/^sha-?256$/i.test(alg)) throw new Error('hash ' + alg + ' tidak didukung');
    const parts = [], h = {
      update(d, e) { parts.push(typeof d === 'string' ? Buffer.from(d, e || 'utf8') : Buffer.from(d)); return h; },
      digest(e) { const o = Buffer.from(sha256(Buffer.concat(parts))); return e ? o.toString(e) : o; },
    };
    return h;
  }
  function createDecipheriv(alg, key, iv) {
    if (!/^aes-(128|192|256)-cbc$/i.test(alg)) throw new Error('cipher ' + alg + ' tidak didukung');
    const k = Buffer.from(key), v = Buffer.from(iv), parts = []; let pad = true;
    return {
      setAutoPadding(f) { pad = f !== false; return this; },
      update(d) { parts.push(Buffer.from(d)); return Buffer.alloc(0); },
      final() {
        const pt = cbcDec(k, v, Buffer.concat(parts)); if (!pad) return pt;
        const n = pt[pt.length - 1]; if (!n || n > 16 || n > pt.length) throw new Error('error:1C800064:Provider routines::bad decrypt');
        for (let i = 1; i <= n; i++) if (pt[pt.length - i] !== n) throw new Error('error:1C800064:Provider routines::bad decrypt');
        return pt.subarray(0, pt.length - n);
      },
    };
  }
  return {
    createHash, createDecipheriv,
    randomBytes(n) { const b = Buffer.alloc(n); (self.crypto || window.crypto).getRandomValues(b); return b; },
    randomUUID() { return (self.crypto || window.crypto).randomUUID(); },
  };
}

/* =============================== SHIM: axios =============================== */
function shimAxios() {
  const isUSP = d => typeof URLSearchParams !== 'undefined' && d instanceof URLSearchParams;
  const enc = o => Object.keys(o).filter(k => o[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
  const merge = (a, b) => { const o = Object.assign({}, a, b); o.headers = Object.assign({}, a && a.headers, b && b.headers); return o; };
  function mkErr(msg, cfg, res, code) { const e = new Error(msg); e.isAxiosError = true; e.config = cfg; e.response = res; e.code = code; e.toJSON = () => ({ message: msg }); return e; }
  async function request(cfg) {
    let url = cfg.url || '';
    if (cfg.baseURL && !/^[a-z]+:\/\//i.test(url)) url = cfg.baseURL.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
    if (cfg.params) { const q = isUSP(cfg.params) ? cfg.params.toString() : enc(cfg.params); if (q) url += (url.includes('?') ? '&' : '?') + q; }
    const method = (cfg.method || (cfg.data != null ? 'post' : 'get')).toUpperCase(), headers = {}, ch = cfg.headers || {};
    Object.keys(ch).forEach(k => {
      if (['common', 'get', 'post', 'put', 'delete', 'head', 'patch', 'options'].includes(k) && ch[k] && typeof ch[k] === 'object') { if (k === 'common' || k === method.toLowerCase()) Object.assign(headers, ch[k]); }
      else if (ch[k] != null) headers[k] = ch[k];
    });
    const hk = n => Object.keys(headers).find(k => k.toLowerCase() === n);
    let data = cfg.data;
    if (data != null) {
      if (isUSP(data)) { data = data.toString(); if (!hk('content-type')) headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
      else if (typeof data === 'object') { const ct = hk('content-type'); if (ct && /urlencoded/i.test(headers[ct])) data = enc(data); else { data = JSON.stringify(data); if (!ct) headers['Content-Type'] = 'application/json'; } }
      else data = String(data);
    }
    if (cfg.responseType === 'arraybuffer' || cfg.responseType === 'stream') throw mkErr('responseType ' + cfg.responseType + ' tidak didukung di aplikasi', cfg, null, 'ERR_UNSUPPORTED');
    let r;
    try { r = await window.E.http({ url, method, headers, data, timeout: cfg.timeout || undefined }); }
    catch (e) { throw mkErr(e.message || 'Network Error', cfg, null, /waktu|timeout/i.test(e.message || '') ? 'ECONNABORTED' : 'ERR_NETWORK'); }
    let body = r.text;
    if (cfg.responseType !== 'text') { const t = (body || '').trim(); if (t[0] === '{' || t[0] === '[') { try { body = JSON.parse(t); } catch (_) {} } }
    const hd = Object.assign({}, r.headers); if (r.cookies && r.cookies.length) hd['set-cookie'] = r.cookies;
    const res = { status: r.status, statusText: '', headers: hd, data: body, config: cfg, request: { res: { responseUrl: r.url }, path: r.url, responseURL: r.url } };
    if (!(cfg.validateStatus || (s => s >= 200 && s < 300))(r.status)) throw mkErr('Request failed with status code ' + r.status, cfg, res, 'ERR_BAD_RESPONSE');
    return res;
  }
  function make(def) {
    const inst = (c, c2) => typeof c === 'string' ? request(merge(def, Object.assign({ url: c }, c2))) : request(merge(def, c));
    inst.request = c => request(merge(def, c));
    ['get', 'delete', 'head', 'options'].forEach(m => inst[m] = (u, c) => request(merge(def, Object.assign({}, c, { url: u, method: m }))));
    ['post', 'put', 'patch'].forEach(m => inst[m] = (u, d, c) => request(merge(def, Object.assign({}, c, { url: u, method: m, data: d }))));
    inst.defaults = def; inst.interceptors = { request: { use() {}, eject() {} }, response: { use() {}, eject() {} } };
    inst.create = c => make(merge(def, c)); inst.isAxiosError = e => !!(e && e.isAxiosError); return inst;
  }
  const ax = make({ headers: {} }); ax.default = ax; return ax;
}

/* =============================== SHIM: cheerio (subset di atas DOMParser) =============================== */
function shimCheerio() {
  const uniq = a => Array.from(new Set(a));
  class C {
    constructor(els) { this.els = els; this.length = els.length; els.forEach((e, i) => { this[i] = e; }); }
    find(sel) { return new C(uniq(this.els.flatMap(e => e.querySelectorAll ? Array.from(e.querySelectorAll(sel)) : []))); }
    each(fn) { for (let i = 0; i < this.els.length; i++) if (fn.call(this.els[i], i, this.els[i]) === false) break; return this; }
    attr(n, v) { if (v === undefined) { const e = this.els[0]; return e && e.hasAttribute && e.hasAttribute(n) ? e.getAttribute(n) : undefined; } this.els.forEach(e => e.setAttribute(n, v)); return this; }
    removeAttr(n) { this.els.forEach(e => e.removeAttribute(n)); return this; }
    text() { return this.els.map(e => e.textContent).join(''); }
    html() { return this.els[0] ? this.els[0].innerHTML : null; }
    val() { const e = this.els[0]; if (!e) return undefined; const t = (e.tagName || '').toLowerCase(); if (t === 'textarea') return e.textContent; if (t === 'select') { const o = e.querySelector('option[selected]') || e.querySelector('option'); return o ? (o.getAttribute('value') != null ? o.getAttribute('value') : o.textContent) : undefined; } return e.hasAttribute('value') ? e.getAttribute('value') : undefined; }
    first() { return new C(this.els.slice(0, 1)); }
    last() { return new C(this.els.slice(-1)); }
    eq(i) { const e = this.els[i < 0 ? this.els.length + i : i]; return new C(e ? [e] : []); }
    get(i) { return i === undefined ? this.els.slice() : this.els[i < 0 ? this.els.length + i : i]; }
    toArray() { return this.els.slice(); }
    map(fn) { const out = []; this.els.forEach((e, i) => { const r = fn.call(e, i, e); if (r != null && r !== false) Array.isArray(r) ? out.push(...r) : out.push(r); }); return new C(out); }
    filter(f) { return new C(this.els.filter((e, i) => typeof f === 'string' ? e.matches(f) : f.call(e, i, e))); }
    not(f) { return new C(this.els.filter((e, i) => typeof f === 'string' ? !e.matches(f) : !f.call(e, i, e))); }
    is(f) { return this.els.some((e, i) => typeof f === 'string' ? e.matches(f) : f.call(e, i, e)); }
    hasClass(c) { return this.els.some(e => e.classList && e.classList.contains(c)); }
    closest(sel) { return new C(uniq(this.els.map(e => e.closest && e.closest(sel)).filter(Boolean))); }
    parent() { return new C(uniq(this.els.map(e => e.parentElement).filter(Boolean))); }
    children(sel) { return new C(this.els.flatMap(e => Array.from(e.children).filter(c => !sel || c.matches(sel)))); }
    next() { return new C(this.els.map(e => e.nextElementSibling).filter(Boolean)); }
    prev() { return new C(this.els.map(e => e.previousElementSibling).filter(Boolean)); }
    data(n) { const e = this.els[0]; if (!e) return undefined; return n === undefined ? Object.assign({}, e.dataset) : e.dataset[n.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; }
    prop(n) { const e = this.els[0]; return e ? (n === 'tagName' ? e.tagName : e[n]) : undefined; }
    remove() { this.els.forEach(e => e.remove()); return this; }
    [Symbol.iterator]() { return this.els[Symbol.iterator](); }
  }
  function load(html) {
    const doc = new DOMParser().parseFromString(String(html == null ? '' : html), 'text/html');
    const $ = (sel, ctx) => {
      if (typeof sel === 'string') { const roots = ctx ? (ctx instanceof C ? ctx.els : [ctx]) : [doc]; return new C(uniq(roots.flatMap(r => Array.from(r.querySelectorAll(sel))))); }
      if (sel instanceof C) return sel;
      if (sel && sel.nodeType) return new C([sel]);
      if (Array.isArray(sel)) return new C(sel);
      return new C([]);
    };
    $.html = x => x ? (x.els[0] ? x.els[0].outerHTML : '') : doc.documentElement.outerHTML;
    $.text = x => x ? x.text() : doc.body.textContent;
    $.root = () => new C([doc.documentElement]);
    return $;
  }
  return { load, default: { load } };
}

/* =============================== penerjemah scrapr =============================== */
const SKIP_PLATFORM = new Set(['comic', 'anime', 'resolver']);   // API-nya beda (search/getChapters), bukan "tempel link lalu unduh"
const NODE_STUB = "module.exports=new Proxy(function(){},{get:function(t,k){if(k==='__esModule'||k==='then')return undefined;return function(){throw new Error('Node API tidak tersedia di aplikasi: '+String(k))}}});";
const fnSrc = f => '(' + f.toString() + ')';

function buildScrapr(dir, esbuild, sha) {
  const lib = path.join(dir, 'lib');
  if (!fs.existsSync(lib)) throw new Error('lib/ tidak ada di ' + dir);
  const plats = fs.readdirSync(lib).filter(p => !SKIP_PLATFORM.has(p) && fs.existsSync(path.join(lib, p, 'index.js'))).sort();
  let ver = ''; try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version; } catch (_) {}
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scrapr-'));
  const entry = path.join(tmp, 'entry.js'), inject = path.join(tmp, 'inject.js');
  fs.writeFileSync(entry, 'var S={};\n' + plats.map(p => 'try{S[' + JSON.stringify(p) + ']=require(' + JSON.stringify(path.join(lib, p, 'index.js')) + ')}catch(e){}').join('\n')
    + '\nglobalThis.__SCRAPR=S;globalThis.__SCRAPR_INFO=' + JSON.stringify({ name: 'coflyn/scrapr', version: ver, commit: sha || '' }) + ';\n');
  fs.writeFileSync(inject, "import {Buffer as B} from 'nx-buffer';export {B as Buffer};export var process={env:{},platform:'browser',argv:[],versions:{},cwd:function(){return '/'}};\n");
  const virt = {
    'nx-buffer': 'module.exports=(' + fnSrc(shimBuffer) + ')();',
    axios: 'module.exports=(' + fnSrc(shimAxios) + ')();',
    cheerio: 'module.exports=(' + fnSrc(shimCheerio) + ')();',
    crypto: 'module.exports=(' + fnSrc(shimCrypto) + ')(require("nx-buffer").Buffer);',
  };
  const plugin = {
    name: 'nx-shims',
    setup(b) {
      b.onResolve({ filter: /^[^./]/ }, a => {
        if (a.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(a.path)) return null;
        const bare = a.path.replace(/^node:/, '');
        return { path: bare in virt ? bare : '__stub__:' + bare, namespace: 'nx' };
      });
      b.onLoad({ filter: /.*/, namespace: 'nx' }, a => ({ contents: virt[a.path] || NODE_STUB, loader: 'js' }));
    },
  };
  return esbuild.build({
    entryPoints: [entry], bundle: true, platform: 'browser', format: 'iife', target: 'es2019', minify: true, write: false,
    inject: [inject], plugins: [plugin], legalComments: 'none', logLevel: 'error',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).then(res => { fs.rmSync(tmp, { recursive: true, force: true }); return { code: res.outputFiles[0].text, plats, ver }; });
}

/* =============================== main =============================== */
async function main() {
  const root = path.join(__dirname, '..');
  let esbuild; try { esbuild = require('esbuild'); } catch (_) { esbuild = require('/opt/npm-tools/node_modules/esbuild'); }
  const engine = fs.readFileSync(path.join(root, 'web/engine.js'), 'utf8');
  const svRe = /(?:const|let|var)\s+SV\s*=\s*\d+/;
  const svSrc = +(engine.match(/(?:const|let|var)\s+SV\s*=\s*(\d+)/) || [])[1];
  if (!svSrc) throw new Error('const SV tidak ditemukan di web/engine.js');
  let scrapr = '', info = '';
  if (process.env.SCRAPR_DIR) {
    const t = await buildScrapr(process.env.SCRAPR_DIR, esbuild, process.env.SCRAPR_SHA);
    scrapr = t.code; info = 'scrapr ' + (t.ver || '?') + (process.env.SCRAPR_SHA ? ' @' + process.env.SCRAPR_SHA : '') + ' (' + t.plats.length + ' platform)';
    console.log('scrapr diterjemahkan:', t.plats.join(', '), '|', Math.round(scrapr.length / 1024) + ' KB');
  }
  const dir = path.join(root, 'ota'); fs.mkdirSync(dir, { recursive: true });
  let prev = null; try { prev = JSON.parse(fs.readFileSync(path.join(dir, 'scrapers-version.json'), 'utf8')); } catch (_) {}
  const bodyHash = crypto.createHash('sha256').update(scrapr + '\n' + engine.replace(svRe, 'const SV = 0')).digest('hex');
  const same = !!(prev && prev.bodyHash === bodyHash);
  const version = same ? prev.scraperVersion : Math.max((prev && prev.scraperVersion) || 0, svSrc) + 1;   // naik otomatis hanya jika isi berubah
  const out = esbuild.transformSync(scrapr + '\n' + engine.replace(svRe, 'const SV = ' + version), { minify: true, target: 'es2019', legalComments: 'none' }).code;
  fs.writeFileSync(path.join(dir, 'bundle.js'), out);
  const note = process.argv[2] || '';
  const meta = {
    scraperVersion: version, updatedAt: same ? prev.updatedAt : Date.now(), minAppVersion: process.argv[3] || '1.0.0',
    sourceHash: crypto.createHash('sha256').update(out, 'utf8').digest('hex'), bodyHash,
    changelog: (note + (info ? (note ? ' | ' : '') + info : '')).trim(),
  };
  fs.writeFileSync(path.join(dir, 'scrapers-version.json'), JSON.stringify(meta, null, 2));
  console.log('OK v' + version, out.length + ' B', meta.sourceHash.slice(0, 12), same ? '(tanpa perubahan)' : '(baru)');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { shimBuffer, shimCrypto, shimAxios, shimCheerio, buildScrapr };
