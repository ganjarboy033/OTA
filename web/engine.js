/* Nimiyo-Nexora engine — scraper ringkas untuk 16 platform.
   Semua jaringan lewat satu fungsi http() -> jembatan native NX (CORS-free, header bebas). */
(() => {
'use strict';
const SV = 1;   // scraperVersion bawaan (naikkan tiap rilis bundle OTA)
const W = window, N = W.NX;
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36';
const DUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const IUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const form = o => Object.keys(o).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
const tmo = () => Math.min(180, Math.max(5, +localStorage.getItem('nx_timeout') || 30)) * 1000;
let seq = 0;

/* ---------- HTTP ---------- */
function parseRes(raw) {
  const a = raw.split('\u0001');
  const r = { status: +a[0] || 0, url: a[1] || '', text: a.slice(3).join('\u0001'), headers: {}, cookies: [] };
  if (r.url === 'ERR') throw new Error(r.text || 'Jaringan gagal');
  (a[2] || '').split('\n').forEach(l => {
    const i = l.indexOf(':'); if (i < 1) return;
    const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
    k === 'set-cookie' ? r.cookies.push(v) : (r.headers[k] = v);
  });
  r.ck = r.cookies.map(c => c.split(';')[0]).join('; ');
  return r;
}
async function http(o) {
  const m = (o.method || (o.data != null ? 'POST' : 'GET')).toUpperCase();
  const h = Object.assign({ 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,id;q=0.8' }, o.headers || {});
  let body = '';
  if (o.data != null) {
    if (typeof o.data === 'object') {
      if (!h['Content-Type']) h['Content-Type'] = 'application/json';
      body = /urlencoded/.test(h['Content-Type']) ? form(o.data) : JSON.stringify(o.data);
    } else body = String(o.data);
  }
  const t = o.timeout || tmo();
  if (N) {
    const id = 'r' + (++seq);
    N.req(id, [m, o.url, Object.entries(h).map(([k, v]) => k + ': ' + v).join('\n'), body, String(t)].join('\u0001'));
    const t0 = Date.now();
    while (Date.now() - t0 < t + 4000) { await sleep(60); const r = N.poll(id); if (r) return parseRes(r); }
    throw new Error('Waktu habis');
  }
  const c = new AbortController(), to = setTimeout(() => c.abort(), t);   // mode browser (dev)
  try {
    const r = await fetch(o.url, { method: m, headers: h, body: body || undefined, signal: c.signal });
    return { status: r.status, url: r.url, text: await r.text(), headers: {}, cookies: [], ck: '' };
  } finally { clearTimeout(to); }
}
const J = (r, n = 'Server') => {
  const t = (r.text || '').trim();
  if (t[0] === '<') throw new Error(n + ' memblokir / rate-limit');
  try { return JSON.parse(t); } catch (e) { throw new Error(n + ': respons tidak valid'); }
};
const jget = async (url, h, n) => J(await http({ url, headers: h }), n);
const DOM = h => new DOMParser().parseFromString(h || '', 'text/html');
const abs = (h, b) => { try { return new URL(h, b).href; } catch (_) { return h; } };
const text = e => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
const mp = o => { const b = '----nx' + Math.random().toString(36).slice(2); let s = ''; for (const k in o) s += `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${o[k]}\r\n`; return { body: s + `--${b}--\r\n`, type: 'multipart/form-data; boundary=' + b }; };
const b64j = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(atob(s)); };
const uniq = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };

/* ---------- Items ---------- */
const kindOf = (l, u) => {
  const s = (l + ' ' + u).toLowerCase();
  if (/mp3|m4a|audio|music|flac|wav|\.aac|cover/.test(s) && !/cover/.test(l.toLowerCase())) return 'audio';
  if (/image|photo|foto|jpg|jpeg|png|webp|cover|\.gif/.test(s)) return 'image';
  return /mp3|m4a|audio|\.aac/.test(s) ? 'audio' : 'video';
};
const extOf = (l, u, k) => {
  const m = (u.split('?')[0].match(/\.(mp4|m4a|mp3|webm|mkv|flac|wav|jpe?g|png|webp|gif|zip)$/i) || [])[1];
  if (m) return m.toLowerCase().replace('jpeg', 'jpg');
  return k === 'audio' ? 'mp3' : k === 'image' ? (/png/i.test(l + u) ? 'png' : 'jpg') : 'mp4';
};
const it = (label, url, o = {}) => { const k = o.kind || kindOf(label, url); return Object.assign({ label, url, kind: k, ext: o.ext || extOf(label, url || '', k) }, o); };

/* ---------- URL ---------- */
const PL = [
  ['youtube', 'YouTube', /youtu\.?be/i], ['tiktok', 'TikTok', /tiktok\.com/i], ['instagram', 'Instagram', /instagram\.com|instagr\.am/i],
  ['twitter', 'X / Twitter', /(?:twitter|x|fxtwitter|vxtwitter|fixupx)\.com/i], ['facebook', 'Facebook', /facebook\.com|fb\.watch|fb\.com/i],
  ['threads', 'Threads', /threads\.(?:net|com)/i], ['pinterest', 'Pinterest', /pinterest\.|pin\.it/i],
  ['bilibili', 'Bilibili', /bilibili\.|b23\.tv|bili\.im/i], ['pixiv', 'Pixiv', /pixiv\.net/i],
  ['douyin', 'Douyin', /douyin\.com|iesdouyin/i], ['rednote', 'RedNote', /xiaohongshu\.com|xhslink\.|rednote\.com/i],
  ['shopee', 'Shopee Video', /shopee\.|shp\.ee/i], ['soundcloud', 'SoundCloud', /soundcloud\.com|snd\.sc/i],
  ['spotify', 'Spotify', /spotify\.com|spotify\.link/i], ['applemusic', 'Apple Music', /music\.apple\.com/i], ['bandcamp', 'Bandcamp', /bandcamp\.com/i],
];
const detect = u => { const p = PL.find(x => x[2].test(u)); return p ? p[0] : null; };
function clean(t) {
  if (!t) return '';
  const m = String(t).match(/https?:\/\/[^\s]+/);
  let u = m ? m[0] : String(t).trim();
  if (!u) return '';
  if (!/^https?:\/\//.test(u)) u = 'https://' + u;
  try {
    const x = new URL(u), h = x.hostname;
    ['igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 's', 't', 'si', 'feature'].forEach(p => x.searchParams.delete(p));
    if (/tiktok\.com/.test(h)) x.search = '';
    else if (/youtube\.com|youtu\.be/.test(h)) { if (x.searchParams.has('v')) { const v = x.searchParams.get('v'), l = x.searchParams.get('list'); x.search = ''; x.searchParams.set('v', v); if (l) x.searchParams.set('list', l); } }
    else if (!/xiaohongshu|rednote|xhslink|facebook|bilibili/.test(h) && !x.searchParams.has('id') && !x.searchParams.has('story_fbid')) x.search = '';
    return x.href.replace(/\/$/, '');
  } catch (_) { return u.split('?')[0].replace(/\/$/, ''); }
}

/* ---------- Pola umum "snap*" ---------- */
const BAD = /ko-fi|premium|play\.google|apps\.apple|t\.me|telegram|whatsapp|sharer|intent\/tweet|javascript:|paypal|patreon|chrome\.google|#$/i;
function anchors(doc, base) {
  const out = [];
  doc.querySelectorAll('a[href]').forEach(a => {
    let h = (a.getAttribute('href') || '').trim(); if (!h || h === '#' || BAD.test(h)) return;
    h = abs(h, base); if (/^https?:/.test(h)) out.push({ h, t: text(a), c: a.className || '', a });
  });
  return out;
}
function dss(d) {
  const m = d.match(/eval\(function\(h,u,n,t,e,r\)\{.*?\}\("(.*?)",(\d+),"(.*?)",(\d+),(\d+),(\d+)\)\)/);
  if (!m) return null;
  const h = m[1], n = m[3], t = +m[4], e = +m[5], dl = n[e]; let o = '';
  for (const s of h.split(dl)) { if (s === '') continue; let v = 0; for (let j = 0; j < s.length; j++) v += n.indexOf(s[j]) * Math.pow(e, s.length - 1 - j); o += String.fromCharCode(v - t); }
  try { return decodeURIComponent(escape(o)); } catch (_) { return o; }
}
function ssHtml(t) {
  let d = dss(t); if (!d) return t;
  const i = d.indexOf('innerHTML = "');
  if (i > -1) {
    let raw = d.slice(i + 13, d.lastIndexOf('"'));
    try { raw = JSON.parse('"' + raw + '"'); } catch (_) { raw = raw.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n|\\r|\\t/g, ''); }
    return raw;
  }
  return d;
}
function ssUrl(v) {
  if (!v) return null;
  let raw = v.trim().replace(/^["'\\]+|["'\\]+$/g, '');
  const tk = raw.includes('get_progressApi') && raw.match(/token=([^&'"]+)/); if (tk) raw = tk[1];
  if (raw.includes('.') && !/^https?:|^\//.test(raw)) { try { const p = b64j(raw.split('.')[1]); if (p.video_url) return p.video_url; if (p.url) return p.url; } catch (_) {} }
  if (raw.startsWith('//')) return 'https:' + raw;
  if (raw[0] === '/') return 'https://snapsave.app' + raw;
  return raw;
}
async function snapsave(url, path) {
  const H = { Origin: 'https://snapsave.app', Referer: 'https://snapsave.app' + (path === 'id' ? '/id' : '/'), 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': DUA };
  let ck = '';
  if (path === 'id') ck = (await http({ url: 'https://snapsave.app/id', headers: H })).ck;
  const r = await http({ url: path === 'id' ? 'https://snapsave.app/action.php?lang=id' : 'https://snapsave.app/action.php', data: form({ url }), headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Cookie: ck }, H) });
  const doc = DOM(ssHtml(r.text)), items = [];
  const rows = doc.querySelectorAll('table tbody tr');
  if (rows.length) rows.forEach(tr => {
    const q = text(tr.querySelector('td.video-quality')) || text(tr.querySelector('td')) || 'VIDEO';
    const b = tr.querySelector('a.btn-download') || tr.querySelector('a') || tr.querySelector('button');
    const u = ssUrl(b && (b.getAttribute('href') || b.getAttribute('onclick')));
    if (u && /^https?:/.test(u)) items.push(it(q, u, { kind: 'video' }));
  });
  else doc.querySelectorAll('.download-items, .media-box, .download-item').forEach((box, i) => {
    box.querySelectorAll('a[href]').forEach(a => { const u = ssUrl(a.getAttribute('href')); if (u && /^https?:/.test(u) && !BAD.test(u)) { const t = text(a) || 'Media'; items.push(it((/photo|foto|image/i.test(t) ? 'Foto ' : 'Video ') + (i + 1), u, { kind: /photo|foto|image/i.test(t) ? 'image' : 'video', thumb: box.querySelector('img') && box.querySelector('img').getAttribute('src') })); } });
  });
  if (!items.length) anchors(doc, 'https://snapsave.app').forEach(a => { if (/download|\.mp4|rapidcdn|snapcdn|token=/i.test(a.h + a.t)) items.push(it(a.t || 'Media', a.h)); });
  if (!items.length) throw new Error('Tautan unduhan tidak ditemukan');
  const th = doc.querySelector('.video-preview img, img:not([src*=logo])');
  return { title: '', thumb: th ? abs(th.getAttribute('src') || '', 'https://snapsave.app') : '', items };
}

/* ---------- Keluarga "mate" (Spotify / Apple Music / Bandcamp) ---------- */
const mhead = (b, ck, ref, ct) => ({ Origin: b, Referer: ref || b + '/', 'X-Requested-With': 'XMLHttpRequest', Cookie: ck || '', 'Content-Type': ct || 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json, text/javascript, */*; q=0.01' });
const MATE = {
  spotify: { b: 'https://spotimate.app', ref: 'https://spotimate.app/en1', extra: { 'g-recaptcha-response': 'dummy_token' } },
  apple: { b: 'https://aplmate.com', ref: 'https://aplmate.com/', extra: {} },
  bandcamp: { b: 'https://bandcampdownloader.app', ref: 'https://bandcampdownloader.app/', extra: { type: '320' } },
};
async function mateTrack(k, ck, f) {
  const c = MATE[k];
  const r = await http({ url: c.b + '/action/track', data: form(Object.assign({}, f, c.extra)), headers: mhead(c.b, ck, c.ref) });
  let h = r.text; try { const j = JSON.parse(h); h = j.data || j.html || ''; } catch (_) {}
  const out = [];
  anchors(DOM(h), c.b).forEach(a => {
    if (/another song/i.test(a.t)) return;
    if (/\/dl\?token=|abutton/.test(a.h + a.c) || (k === 'spotify' && /^https?:/.test(a.h))) {
      const cov = /cover|i\.scdn\.co|\.(jpe?g|png|webp)($|\?)/i.test(a.t + a.h);
      out.push({ url: a.h, cover: cov, t: a.t });
    }
  });
  return out;
}
async function mate(k, url) {
  const c = MATE[k]; let ck = '', fields = {};
  const home = await http({ url: k === 'spotify' ? c.ref : c.b + '/', headers: { Accept: 'text/html,*/*' } });
  ck = home.ck;
  let html;
  if (k === 'spotify') {
    let token = '';
    try { const v = await http({ url: c.b + '/api/userverify', data: 'url=' + encodeURIComponent(url), headers: mhead(c.b, ck, c.ref) }); if (v.ck) ck += '; ' + v.ck; const vj = JSON.parse(v.text); if (vj.success && vj.token) token = vj.token; } catch (_) {}
    const m = mp({ url, cftoken: token });
    const r = await http({ url: c.b + '/action', data: m.body, headers: { 'Content-Type': m.type, Referer: c.ref, Origin: c.b, Cookie: ck } });
    if (r.ck) ck += '; ' + r.ck;
    try { html = JSON.parse(r.text).html; } catch (_) { html = r.text; }
  } else if (k === 'apple') {
    const v = J(await http({ url: c.b + '/action/userverify', data: form({ url }), headers: mhead(c.b, ck, c.ref) }), 'Aplmate');
    if (!v.success || !v.token) throw new Error(v.message || 'Verifikasi gagal');
    const r = J(await http({ url: c.b + '/action', data: form({ url, 'cf-turnstile-response': v.token }), headers: mhead(c.b, ck, c.ref) }), 'Aplmate');
    if (r.error) throw new Error(r.message || 'Gagal');
    html = r.html;
  } else {
    const d1 = DOM(home.text), inp = d1.querySelector('form[name="submitbcurl"] input[type="hidden"]');
    if (!inp) throw new Error('CSRF tidak ditemukan');
    const r = J(await http({ url: c.b + '/action', data: form({ url, [inp.getAttribute('name')]: inp.getAttribute('value') }), headers: mhead(c.b, ck, c.ref) }), 'Bandcamp');
    if (r.error || !r.html) throw new Error(r.message || 'Gagal memproses');
    html = r.html;
  }
  if (!html || html.length < 50) throw new Error('Respons kosong');
  const doc = DOM(html), forms = doc.querySelectorAll('form[name="submitapurl"], form[name="submitspurl"], form[name="submiturl"]');
  if (!forms.length) throw new Error('Lagu tidak ditemukan');
  const multi = forms.length > 1, items = [];
  const mainThumb = (doc.querySelector('img') || {}).src || '', mainTitle = text(doc.querySelector('h3'));
  for (let i = 0; i < forms.length; i++) {
    const f = forms[i]; fields = {};
    f.querySelectorAll('input').forEach(x => { const n = x.getAttribute('name'); if (n) fields[n] = x.getAttribute('value') || ''; });
    let meta = {}; try { meta = JSON.parse(atob(fields.data || '')); } catch (_) {}
    const nm = meta.name || meta.title || 'Track ' + (i + 1), ar = meta.artist || meta.singer || '';
    const lab = (multi ? String(i + 1).padStart(String(forms.length).length, '0') + '. ' : '') + (ar ? ar + ' - ' : '') + nm;
    if (!multi) {
      const L = await mateTrack(k, ck, fields);
      L.forEach(l => items.push(it(lab + (l.cover ? ' [Cover]' : l.t ? ' [' + l.t.replace(/download|mp3/gi, '').trim() + ']' : ' [MP3]'), l.url, { kind: l.cover ? 'image' : 'audio', thumb: meta.cover || mainThumb })));
    } else items.push(it(lab + ' [MP3]', '', { kind: 'audio', ext: 'mp3', thumb: meta.cover, lazy: { k: 'mate', m: k, ck, f: fields } }));
  }
  if (!items.length) throw new Error('Tautan unduhan tidak ditemukan');
  return { title: mainTitle || (multi ? 'Koleksi ' + forms.length + ' lagu' : items[0].label), author: '', thumb: mainThumb, items };
}

/* ---------- YouTube ---------- */
const ytId = u => (u.match(/(?:youtube\.com\/(?:(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/i) || [])[1];
const YH = { Origin: 'https://media.ytmp3.gg', Referer: 'https://media.ytmp3.gg/', 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*' };
async function c1s(id, fmt, q) {
  const r = await http({ url: 'https://hub.convert1s.com/api/download', headers: YH, data: JSON.stringify({ url: 'https://www.youtube.com/watch?v=' + id, os: 'macos', output: { type: fmt === 'mp4' ? 'video' : 'audio', format: fmt, quality: q || (fmt === 'mp4' ? '720p' : '') }, audio: { bitrate: '128k' } }) });
  let c; try { c = JSON.parse(r.text); } catch (_) { return null; }
  if (!c || c.error || !c.statusUrl) return null;
  for (let i = 0; i < 14; i++) {
    await sleep(1200);
    let p; try { p = JSON.parse((await http({ url: c.statusUrl, headers: YH })).text); } catch (_) { continue; }
    if (p.status === 'completed' && p.downloadUrl) return { url: p.downloadUrl, q: c.selectedQuality || q };
    if (p.status === 'error' || p.status === 'failed') return null;
  }
  return null;
}
async function ymc(id, fmt) {
  const h = { Origin: 'https://ytmp3.mobi', Referer: 'https://ytmp3.mobi/en8/', Accept: '*/*' };
  const j = async u => JSON.parse((await http({ url: u, headers: h })).text);
  try {
    const ini = await j('https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=' + Math.random());
    if (!ini.convertURL) return null;
    let c = await j(`${ini.convertURL}&v=${id}&f=${fmt}&_=${Math.random()}`);
    for (let i = 0; c && c.redirect > 0 && c.redirectURL && i < 5; i++) c = await j(`${c.redirectURL}&v=${id}&f=${fmt}&_=${Math.random()}`);
    if (!c || c.error) return null;
    let pr = c.progress || 0, dl = c.downloadURL; const pu = c.progressURL;
    for (let i = 0; pr < 3 && i < 12 && pu; i++) { await sleep(1200); const d = await j(pu + '&_=' + Math.random()); if (!d || d.error) break; pr = d.progress ?? 0; if (d.downloadURL) dl = d.downloadURL; if (pr === 4) break; }
    if (dl && (pr >= 3 || dl.includes('/download/'))) { if (dl.startsWith('//')) dl = 'https:' + dl; else if (dl[0] === '/') dl = 'https://ytmp3.mobi' + dl; return { url: dl, q: fmt === 'mp3' ? 'MP3 320k' : 'MP4' }; }
  } catch (_) {}
  return null;
}
const ytGet = async (id, fmt, q) => (await c1s(id, fmt, q).catch(() => null)) || (q === '360p' ? null : await ymc(id, fmt));
async function youtube(url) {
  const id = ytId(url), pl = (url.match(/[?&]list=([^"&?/\s]+)/) || [])[1];
  if (!id && !pl) throw new Error('Link YouTube tidak valid');
  if (!id) return ytPlaylist(pl);
  let title = 'YouTube Video', author = '', thumb = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  try { const o = await jget(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`); title = o.title || title; author = o.author_name || ''; thumb = o.thumbnail_url || thumb; } catch (_) {}
  const jobs = [['mp4', '720p'], ['mp4', '360p'], ['mp3', '']];
  const res = await Promise.all(jobs.map(([f, q]) => ytGet(id, f, q).catch(() => null)));
  const items = [];
  res.forEach((r, i) => { if (r && r.url) items.push(it(jobs[i][0] === 'mp3' ? 'MP3 128k' : 'MP4 ' + (r.q || jobs[i][1]), r.url, { kind: jobs[i][0] === 'mp3' ? 'audio' : 'video' })); });
  if (!items.length) throw new Error('Server konversi YouTube tidak merespons');
  return { title, author, thumb, items: uniq(items, x => x.url) };
}
async function ytPlaylist(pl) {
  let title = 'YouTube Playlist', thumb = '', vids = [];
  try {
    const r = await http({ url: 'https://www.youtube.com/playlist?list=' + pl, headers: { 'Accept-Language': 'en-US,en;q=0.9', Cookie: 'SOCS=CAESEwgDEgk2MTc4OTU0NzQaAmVuIAEaBgiA_LyaBg; CONSENT=PENDING+999' } });
    const m = r.text.match(/ytInitialData\s*=\s*({.+?});<\/script>/s);
    if (m) {
      const d = JSON.parse(m[1]);
      title = (d.metadata && d.metadata.playlistMetadataRenderer && d.metadata.playlistMetadataRenderer.title) || title;
      const list = (((d.contents || {}).twoColumnBrowseResultsRenderer || {}).tabs || [{}])[0];
      const sec = (((((list.tabRenderer || {}).content || {}).sectionListRenderer || {}).contents || [{}])[0].itemSectionRenderer || {}).contents;
      ((sec && sec[0].playlistVideoListRenderer || {}).contents || []).forEach(v => { const p = v.playlistVideoRenderer; if (p && p.videoId) vids.push({ id: p.videoId, t: ((p.title.runs || [])[0] || {}).text || 'Track', c: ((p.shortBylineText || {}).runs || [{}])[0].text || '' }); });
    }
  } catch (_) {}
  if (!vids.length) try { const j = await jget('https://yt-meta.convert1s.com/playlist?id=' + pl, YH); (j.items || []).forEach(v => vids.push({ id: v.id, t: v.title, c: v.channel || '' })); } catch (_) {}
  if (!vids.length) throw new Error('Playlist kosong / privat');
  const pad = String(vids.length).length;
  return { title, author: '', thumb: `https://i.ytimg.com/vi/${vids[0].id}/hqdefault.jpg`, items: vids.map((v, i) => it(String(i + 1).padStart(pad, '0') + '. ' + (v.c ? v.c + ' - ' : '') + v.t + ' [MP3]', '', { kind: 'audio', ext: 'mp3', thumb: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, lazy: { k: 'yt', id: v.id, f: 'mp3' } })) };
}

/* ---------- TikTok ---------- */
const TH = b => ({ 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Origin: b, Referer: b + '/id' });
function tkAnchors(doc, base) {
  const items = [];
  doc.querySelectorAll('a[href]').forEach(a => {
    const h = abs((a.getAttribute('href') || '').replace(/&#38;/g, '&'), base); if (!/^https?:/.test(h) || BAD.test(h)) return;
    const t = text(a).toLowerCase(), c = a.className || '';
    if (/mp3|music|audio/.test(t) || /purple/.test(c)) items.push(it('MP3', h, { kind: 'audio' }));
    else if (/\bhd\b/.test(t)) items.push(it('MP4 HD', h, { kind: 'video' }));
    else if (/mp4|video|without watermark|download/.test(t) || /download-btn|tik-button-dl/.test(c)) items.push(it('MP4' + (items.some(x => x.kind === 'video') ? ' (mirror)' : ''), h, { kind: 'video' }));
    else if (/photo|image|foto|jpg/.test(t) || a.closest('.image-item, .photo-list, .images-grid')) items.push(it('Gambar', h, { kind: 'image' }));
  });
  doc.querySelectorAll('.image-item img, .photo-list img, .images-grid img').forEach(im => { const s = abs(im.getAttribute('src') || '', base); if (/^https?:/.test(s) && !items.some(x => x.url === s)) items.push(it('Gambar', s, { kind: 'image' })); });
  let n = 0; items.forEach(x => { if (x.kind === 'image') x.label = 'Gambar ' + (++n); });
  return uniq(items, x => x.url);
}
async function tiktokio(url) {
  const r = await http({ url: 'https://tiktokio.com/api/v1/tk/html', headers: { 'Content-Type': 'application/json', Origin: 'https://tiktokio.com', Referer: 'https://tiktokio.com/' }, data: { vid: url, prefix: 'tiktokio.com' } });
  if (!r.text || /Please paste a valid link/.test(r.text)) throw new Error('Link tidak valid');
  const doc = DOM(r.text), items = tkAnchors(doc, 'https://tiktokio.com');
  if (!items.length) throw new Error('Tautan tidak ditemukan');
  const im = doc.querySelector('img');
  return { title: text(doc.querySelector('h3')) || 'TikTok', author: (url.match(/@([^/]+)/) || [])[1] || '', thumb: im ? im.getAttribute('src').replace(/&#38;/g, '&') : '', items };
}
async function tikdl(url) {
  const r = await http({ url: 'https://tikdownloader.io/api/ajaxSearch', data: 'q=' + encodeURIComponent(url) + '&vt=id', headers: TH('https://tikdownloader.io') });
  const j = J(r, 'TikDownloader'); if (j.status !== 'ok' || !j.data) throw new Error(j.msg || 'Ekstraksi gagal');
  const doc = DOM(j.data), items = tkAnchors(doc, 'https://tikdownloader.io');
  if (!items.length) throw new Error('Tautan tidak ditemukan');
  return { title: text(doc.querySelector('h3')) || 'TikTok', author: (url.match(/@([^/]+)/) || [])[1] || '', thumb: (doc.querySelector('img') || { getAttribute: () => '' }).getAttribute('src'), items };
}
async function tikwm(url) {
  const j = await jget('https://www.tikwm.com/api/?hd=1&url=' + encodeURIComponent(url), {}, 'TikWM');
  if (j.code !== 0 || !j.data) throw new Error(j.msg || 'Gagal');
  const d = j.data, items = [], B = 'https://www.tikwm.com';
  const A = u => u && (u[0] === '/' ? B + u : u);
  (d.images || []).forEach((u, i) => items.push(it('Gambar ' + (i + 1), u, { kind: 'image' })));
  if (d.play) items.push(it('MP4', A(d.play), { kind: 'video' }));
  if (d.hdplay) items.push(it('MP4 HD', A(d.hdplay), { kind: 'video' }));
  if (d.music) items.push(it('MP3', A(d.music), { kind: 'audio' }));
  if (!items.length) throw new Error('Tidak ada media');
  return { title: d.title || 'TikTok', author: (d.author && d.author.nickname) || '', thumb: A(d.cover) || '', items };
}

/* ---------- Instagram ---------- */
async function igEmbed(url) {
  const sc = (url.match(/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/) || [])[1]; if (!sc) throw new Error('Shortcode tidak ada');
  const r = await http({ url: `https://www.instagram.com/p/${sc}/embed/captioned/`, headers: { 'User-Agent': IUA } });
  const u = r.text.replace(/\\"/g, '"').replace(/\\\\/g, '\\'), i = u.indexOf('"shortcode_media":'); if (i < 0) throw new Error('Embed kosong');
  let d = 0, e = -1; const s = i + 18;
  for (let k = s; k < u.length; k++) { const c = u[k]; if (c === '{') d++; else if (c === '}' && --d === 0) { e = k + 1; break; } }
  if (e < 0) throw new Error('Embed rusak');
  const m = JSON.parse(u.slice(s, e)), cap = ((m.edge_media_to_caption || {}).edges || [{}])[0], items = [];
  const nodes = m.edge_sidecar_to_children ? m.edge_sidecar_to_children.edges.map(x => x.node) : [m];
  nodes.forEach((n, i) => { const mu = n.video_url || n.display_url; if (mu) items.push(it((n.is_video ? 'Video ' : 'Foto ') + (nodes.length > 1 ? i + 1 : 'HD'), mu, { kind: n.is_video ? 'video' : 'image', thumb: n.display_url })); });
  if (!items.length) throw new Error('Media tidak ada');
  return { title: ((cap.node || {}).text || 'Instagram').slice(0, 100), author: (m.owner && m.owner.username) || '', thumb: items[0].thumb || items[0].url, items };
}
async function indown(url) {
  const r = await http({ url: 'https://indown.net/api/ajaxSearch', data: 'q=' + encodeURIComponent(url) + '&t=media&lang=id', headers: TH('https://indown.net') });
  const j = J(r, 'Indown'); if (j.status !== 'ok' || !j.data) throw new Error('Gagal');
  const items = tkAnchors(DOM(j.data), 'https://indown.net').map((x, i) => Object.assign(x, { label: x.kind === 'image' ? 'Foto ' + (i + 1) : 'Video' }));
  if (!items.length) throw new Error('Tautan tidak ditemukan');
  return { title: 'Instagram', author: '', thumb: items[0].kind === 'image' ? items[0].url : '', items };
}

/* ---------- X / Twitter ---------- */
async function fxt(url) {
  const id = (url.match(/status(?:es)?\/(\d+)/) || [])[1]; if (!id) throw new Error('Link tweet tidak valid');
  const j = await jget('https://api.fxtwitter.com/status/' + id, {}, 'FxTwitter');
  if (j.code !== 200 || !j.tweet) throw new Error(j.message || 'Tweet tidak ditemukan');
  const t = j.tweet, au = (t.author && (t.author.name || t.author.screen_name)) || 'X', items = [], md = t.media || {};
  (md.videos || []).forEach(v => items.push(it('MP4 ' + (v.width ? v.width + 'x' + v.height : 'HD'), v.url, { kind: 'video' })));
  (md.photos || []).forEach((p, i) => items.push(it('Foto ' + (i + 1), p.url, { kind: 'image' })));
  if (!items.length) (md.all || []).forEach((m, i) => items.push(it((m.type === 'photo' ? 'Foto ' : 'Media ') + (i + 1), m.url, { kind: m.type === 'photo' ? 'image' : 'video' })));
  if (!items.length) throw new Error('Tidak ada media di tweet ini');
  return { title: (t.text || '').replace(/https:\/\/t\.co\/\S+/g, '').trim().slice(0, 90) || au + ' tweet', author: au + (t.author && t.author.screen_name ? ' (@' + t.author.screen_name + ')' : ''), thumb: (md.videos && md.videos[0] && md.videos[0].thumbnail_url) || (md.photos && md.photos[0] && md.photos[0].url) || '', items };
}
async function vxt(url) {
  const id = (url.match(/status(?:es)?\/(\d+)/) || [])[1]; if (!id) throw new Error('Link tweet tidak valid');
  const j = await jget('https://api.vxtwitter.com/Twitter/status/' + id, {}, 'VxTwitter');
  const items = (j.media_extended || []).map((m, i) => it((m.type === 'image' ? 'Foto ' : 'MP4 ') + (i + 1), m.url, { kind: m.type === 'image' ? 'image' : 'video' }));
  if (!items.length) throw new Error('Tidak ada media');
  return { title: (j.text || 'Tweet').slice(0, 90), author: j.user_name || '', thumb: (j.media_extended[0] || {}).thumbnail_url || '', items };
}

/* ---------- Lainnya ---------- */
async function facebook(url) { const r = await snapsave(url, 'id'); r.title = 'Facebook'; return r; }
async function igSnap(url) { const r = await snapsave(url, ''); r.title = 'Instagram'; return r; }
async function threads(url) {
  let u = url;
  if (/\/share\//.test(u)) try { u = (await http({ url: u, headers: { 'User-Agent': DUA } })).url || u; } catch (_) {}
  u = u.replace(/threads\.com/i, 'threads.net');
  const home = await http({ url: 'https://threadster.app/' });
  const r = await http({ url: 'https://threadster.app/download', data: form({ url: u }), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: home.ck, Origin: 'https://threadster.app', Referer: 'https://threadster.app/' } });
  const doc = DOM(r.text), items = [];
  anchors(doc, 'https://threadster.app').forEach(a => {
    if (!/token=|acxcdn\.com/.test(a.h)) return;
    let f = a.h, k = 'video';
    try { const tk = new URL(a.h).searchParams.get('token'); if (tk) { const p = b64j(tk.split('.')[1]); if (p.url) { f = p.url; if (/\.(jpe?g|png|webp)/i.test(f)) k = 'image'; } } } catch (_) {}
    items.push(it((k === 'image' ? 'Foto ' : 'Video ') + (items.length + 1), f, { kind: k, thumb: f }));
  });
  if (!items.length) throw new Error('Tautan tidak ditemukan');
  return { title: text(doc.querySelector('.card-title, .video-title, h1, h2, h3, p')) || 'Threads', author: '', thumb: items[0].kind === 'image' ? items[0].url : '', items: uniq(items, x => x.url) };
}
async function pinterest(url) {
  let u = url;
  if (/pin\.it/.test(u)) try { const h = (await http({ url: u })).text; const c = h.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i); if (c) u = c[1]; } catch (_) {}
  const r = await http({ url: u, headers: { Accept: 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.5' } }), h = r.text;
  const og = h.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || h.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
  const vids = uniq(h.match(/https:\/\/[^"'\s\\]+\.mp4[^\s"'\\]*/gi) || [], x => x);
  let imgs = h.match(/https:\/\/i\.pinimg\.com\/originals\/[a-zA-Z0-9/._-]+\.(?:jpg|jpeg|png|webp)/gi) || h.match(/https:\/\/i\.pinimg\.com\/736x\/[a-zA-Z0-9/._-]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  imgs = uniq(imgs, x => x).filter(x => !/avatars|profile|sprite|placeholder|d53b014d86a6b6761bf649a0ed813c2b/.test(x));
  const items = vids.slice(0, 3).map((v, i) => it('Video ' + (i + 1), v, { kind: 'video' })).concat(imgs.slice(0, 6).map((v, i) => it('Gambar ' + (i + 1), v, { kind: 'image' })));
  if (!items.length) throw new Error('Pin tidak berisi media');
  return { title: og ? og[1].replace(/ \| Pinterest$/i, '') : 'Pinterest', author: '', thumb: imgs[0] || '', items };
}
async function bilibili(url) {
  let u = url;
  if (/b23\.tv|bili\.im/.test(u)) try { u = (await http({ url: u })).url || u; } catch (_) {}
  const bv = (u.match(/(BV[a-zA-Z0-9]{10})/i) || [])[1];
  if (bv) {
    const H = { Referer: 'https://www.bilibili.com/video/' + bv };
    const pl = await jget('https://api.bilibili.com/x/player/pagelist?bvid=' + bv, H, 'Bilibili');
    let title = 'Bilibili', thumb = '';
    try { const h = (await http({ url: 'https://www.bilibili.com/video/' + bv })).text; const a = h.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)/i), b = h.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)/i); if (a) title = a[1].replace(/_哔哩哔哩_bilibili.*$/i, '').trim(); if (b) thumb = b[1]; } catch (_) {}
    if (pl.code !== 0 || !pl.data || !pl.data.length) throw new Error('Video tidak ditemukan');
    const items = [];
    for (let i = 0; i < Math.min(pl.data.length, 30); i++) {
      const p = pl.data[i];
      try {
        const d = await jget(`https://api.bilibili.com/x/player/playurl?bvid=${bv}&cid=${p.cid}&qn=64&fnval=0`, H, 'Bilibili');
        ((d.data || {}).durl || []).forEach(x => x.url && items.push(it((pl.data.length > 1 ? (p.part || 'Part ' + (i + 1)) + ' ' : '') + '720p', x.url.replace(/^http:/, 'https:'), { kind: 'video', h: { Referer: 'https://www.bilibili.com/' } })));
      } catch (_) {}
    }
    if (!items.length) throw new Error('Tautan video tidak tersedia (mungkin butuh login)');
    return { title, author: '', thumb, items };
  }
  const aid = (u.match(/video\/(\d+)/) || u.match(/play\/(?:\d+\/)?(\d+)/) || [])[1];
  if (!aid) throw new Error('Link Bilibili tidak dikenali');
  const d = await jget(`https://api.bilibili.tv/intl/gateway/web/v2/playurl?aid=${aid}&platform=web&s_locale=en_US`, {}, 'Bilibili.tv');
  const pu = (d.data || {}).playurl || {}, items = [];
  (pu.video || pu.durl || []).forEach(v => { let x = v.url || v.base_url || (v.video_resource && v.video_resource.url); if (x) items.push(it((v.quality || (v.stream_info && v.stream_info.desc_words) || 'HD') + (/^\d+$/.test(v.quality) ? 'p' : ''), x.replace(/^http:/, 'https:'), { kind: 'video', h: { Referer: 'https://www.bilibili.tv/' } })); });
  if (!items.length) throw new Error('Tautan video tidak tersedia');
  return { title: 'Bilibili', author: '', thumb: '', items };
}
async function pixiv(url) {
  const id = (url.match(/artworks\/(\d+)/) || url.match(/illust_id=(\d+)/) || url.match(/\/i\/(\d+)/) || [])[1]; if (!id) throw new Error('ID karya tidak ditemukan');
  const H = { Referer: 'https://www.pixiv.net/' }; let d = null;
  try { const j = await jget(`https://www.pixiv.net/ajax/illust/${id}?lang=en`, H, 'Pixiv'); if (!j.error) d = j.body; } catch (_) {}
  const items = [];
  if (d) {
    if (d.illustType === 2) { try { const u = (await jget(`https://www.pixiv.net/ajax/illust/${id}/ugoira_meta?lang=en`, H)).body; items.push(it('Ugoira (ZIP)', u.originalSrc, { kind: 'file', ext: 'zip', h: H })); } catch (_) {} }
    else if (d.pageCount > 1) { try { (await jget(`https://www.pixiv.net/ajax/illust/${id}/pages?lang=en`, H)).body.forEach((p, i) => items.push(it('Halaman ' + (i + 1), p.urls.original, { kind: 'image', h: H, thumb: p.urls.small }))); } catch (_) {} }
    else if (d.urls && d.urls.original) items.push(it('Gambar Original', d.urls.original, { kind: 'image', h: H }));
  }
  if (!items.length) { items.push(it('Gambar (mirror)', `https://pixiv.re/${id}.jpg`, { kind: 'image' })); }
  return { title: (d && d.title) || 'Pixiv #' + id, author: (d && d.userName) || '', thumb: (d && d.urls && d.urls.regular) ? d.urls.regular : '', thumbH: H, items };
}
async function douyin(url) {
  const r = await http({ url, headers: { 'User-Agent': IUA } }), u = r.url || url;
  const id = (u.match(/(?:video|note|slides)\/(\d+)/) || u.match(/modal_id=(\d+)/) || r.text.match(/video\/(\d{15,})/) || [])[1];
  if (!id) throw new Error('ID Douyin tidak ditemukan');
  const d = await jget('https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=' + id, { 'User-Agent': IUA, Accept: 'application/json' }, 'Douyin');
  const x = d.item_list && d.item_list[0]; if (!x) throw new Error('Konten tidak ditemukan');
  const items = [];
  if (x.images && x.images.length) x.images.forEach((m, i) => { const s = (m.url_list || m.download_url_list || [])[0]; if (s) items.push(it('Foto ' + (i + 1), s.replace(/^http:/, 'https:'), { kind: 'image' })); });
  else {
    let w = ((x.video.play_addr || {}).url_list || (x.video.download_addr || {}).url_list || [])[0]; if (!w) throw new Error('Video tidak ada');
    w = w.replace(/^http:/, 'https:').replace('playwm', 'play'); const v = (w.match(/video_id=([^&]+)/) || [])[1];
    items.push(it('MP4 (tanpa watermark)', v ? 'https://aweme.snssdk.com/aweme/v1/play/?video_id=' + v : w, { kind: 'video' }));
    const mu = x.music && x.music.play_url && x.music.play_url.url_list && x.music.play_url.url_list[0]; if (mu) items.push(it('MP3 (musik)', mu, { kind: 'audio' }));
  }
  return { title: x.desc || 'Douyin', author: (x.author && x.author.nickname) || '', thumb: ((x.video || {}).cover || {}).url_list ? x.video.cover.url_list[0] : '', items };
}
async function rednote(url) {
  let r = await http({ url, headers: { 'User-Agent': UA } }), u = r.url || url, h = r.text;
  const id = (u.match(/(?:explore|discovery\/item|item)\/([0-9a-f]{24})/i) || h.match(/\/explore\/([0-9a-f]{24})/i) || [])[1];
  if (!/__INITIAL_STATE__/.test(h) && id) h = (await http({ url: 'https://www.xiaohongshu.com/explore/' + id, headers: { 'User-Agent': UA } })).text;
  const items = []; let title = '', author = '', thumb = '';
  const m = h.match(/__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*<\/script>/);
  if (m) try {
    const st = JSON.parse(m[1].replace(/\bundefined\b/g, 'null')), map = (st.note || {}).noteDetailMap || {};
    const n = (map[id] || map[Object.keys(map)[0]] || {}).note || (st.noteData && st.noteData.data && st.noteData.data.noteData);
    if (n) {
      title = n.title || n.desc || ''; author = (n.user || {}).nickname || '';
      (n.imageList || []).forEach((im, i) => { const s = im.urlDefault || im.url || (im.infoList || [])[0] && im.infoList[0].url; if (s) { if (!thumb) thumb = s; items.push(it('Foto ' + (i + 1), s.replace(/^http:/, 'https:'), { kind: 'image', ext: 'jpg' })); } });
      const st2 = (((n.video || {}).media || {}).stream) || {};
      [].concat(st2.h264 || [], st2.h265 || [], st2.av1 || []).slice(0, 3).forEach((v, i) => v.masterUrl && items.push(it('MP4 ' + (v.height ? v.height + 'p' : 'HD'), v.masterUrl.replace(/^http:/, 'https:'), { kind: 'video' })));
      const ok = ((n.video || {}).consumer || {}).originVideoKey; if (!items.some(x => x.kind === 'video') && ok) items.push(it('MP4 Original', 'https://sns-video-bd.xhscdn.com/' + ok, { kind: 'video' }));
    }
  } catch (_) {}
  if (!items.length) {
    const og = p => (h.match(new RegExp('<meta[^>]+(?:property|name)="' + p + '"[^>]+content="([^"]+)"', 'i')) || [])[1];
    const v = og('og:video'), im = h.match(/<meta[^>]+name="og:image"[^>]+content="([^"]+)"/gi);
    if (v) items.push(it('MP4', v, { kind: 'video' }));
    (im || []).forEach((t, i) => items.push(it('Foto ' + (i + 1), (t.match(/content="([^"]+)"/) || [])[1], { kind: 'image' })));
    title = og('og:title') || title;
  }
  if (!items.length) throw new Error('Media catatan tidak ditemukan (butuh xsec_token di link)');
  return { title: (title || 'RedNote').slice(0, 100), author, thumb: thumb || (items[0].kind === 'image' ? items[0].url : ''), items: uniq(items, x => x.url) };
}
async function shopee(url) {
  const D = { 'User-Agent': DUA, 'Accept-Language': 'en-US,en;q=0.9' };
  const home = await http({ url: 'https://svxtract.com/', headers: D });
  const m = home.text.match(/encodeURIComponent\(["']([a-f0-9]{32,64})["']\)/i) || home.text.match(/csrf_token["']?\s*:\s*["']([^"']+)["']/i) || home.text.match(/csrf_token=([^&"'\s]+)/i);
  if (!m) throw new Error('Token svxtract tidak ditemukan');
  const j = await jget(`https://svxtract.com/apiv3.php?url=${encodeURIComponent(url)}&csrf_token=${encodeURIComponent(m[1])}`, Object.assign({ Referer: 'https://svxtract.com/', Origin: 'https://svxtract.com', Cookie: home.ck, Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' }, D), 'SVXtract');
  const items = [];
  Object.keys(j.stream || {}).forEach(k => { const v = j.stream[k], s = typeof v === 'object' ? v.stream : v; if (s && /^https?:/.test(s)) items.push(it(k + ' (tanpa watermark)', s, { kind: 'video', ext: 'mp4', h: { Referer: 'https://svxtract.com/', 'User-Agent': DUA } })); });
  if (!items.length) throw new Error('Video Shopee tidak ditemukan');
  return { title: (j.username || 'Shopee') + ' di Shopee Video', author: j.username || '', thumb: j.preview || '', items };
}
async function soundcloud(url) {
  let meta = {}; try { meta = await jget('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(url)); } catch (_) {}
  const B = 'https://www.forhub.io', home = B + '/soundcloud/en18/';
  const tk = (await jget(B + '/csrf-token-endpoint.php', { Referer: home, Accept: 'application/json' }, 'Forhub')).csrf_token;
  if (!tk) throw new Error('Token Forhub tidak ada');
  const r = await http({ url: B + '/download.php', data: form({ formurl: url, value: url, csrf_token: tk }), headers: { Referer: home, Origin: B, 'Content-Type': 'application/x-www-form-urlencoded' } });
  const at = (r.text.match(/const\s+FORHUB_API_TOKEN\s*=\s*["']([^"']+)["']/) || [])[1];
  if (!at) throw new Error(text(DOM(r.text).querySelector('.alert')) || 'Forhub menolak link ini');
  const H = { 'X-Forhub-Api-Token': at, Accept: 'application/json, text/plain, */*', Referer: B + '/download.php', Origin: B };
  let q = await http({ url: `https://dl.forhub.io/?url=${encodeURIComponent(url)}&async=1`, headers: H }), d; try { d = JSON.parse(q.text); } catch (_) { d = {}; }
  for (let i = 0; i < 15 && (q.status === 202 || d.pending) && d.pollToken; i++) {
    await sleep(2000);
    q = await http({ url: 'https://dl.forhub.io/status', data: JSON.stringify({ token: d.pollToken }), headers: Object.assign({ 'Content-Type': 'application/json' }, H) });
    try { d = JSON.parse(q.text); } catch (_) { d = {}; }
  }
  if (!d.downloadUrl) throw new Error(d.error || d.message || 'Konversi SoundCloud gagal');
  return { title: meta.title || 'SoundCloud', author: meta.author_name || '', thumb: meta.thumbnail_url || '', items: [it('MP3 128kbps', d.downloadUrl, { kind: 'audio', h: { Referer: B + '/download.php', 'User-Agent': UA } })] };
}

/* ---------- Registri: urutan sumber = fallback otomatis ---------- */
const SRC = {
  youtube: [['ytmp3', youtube]],
  tiktok: [['tikdownloader', tikdl], ['tiktokio', tiktokio], ['tikwm', tikwm]],
  instagram: [['embed', igEmbed], ['snapsave', igSnap], ['indown', indown]],
  twitter: [['fxtwitter', fxt], ['vxtwitter', vxt]],
  facebook: [['snapsave', facebook]], threads: [['threadster', threads]], pinterest: [['direct', pinterest]],
  bilibili: [['api', bilibili]], pixiv: [['ajax', pixiv]], douyin: [['iteminfo', douyin]], rednote: [['direct', rednote]],
  shopee: [['svxtract', shopee]], soundcloud: [['forhub', soundcloud]],
  spotify: [['spotimate', u => mate('spotify', u)]], applemusic: [['aplmate', u => mate('apple', u)]], bandcamp: [['bandcampdl', u => mate('bandcamp', u)]],
};
/* ---------- Adapter scrapr: sumber tambahan dari upstream (coflyn/scrapr) ----------
   tools/make-ota.js menerjemahkan scrapr menjadi window.__SCRAPR dan menempelkannya di depan file ini.
   Tanpa __SCRAPR (APK bawaan) bagian ini tidak melakukan apa-apa. */
const EXTRA = {
  reddit: ['Reddit', /reddit\.com|redd\.it/i],
  terabox: ['Terabox', /tera(?:box|share)|1024tera|4funbox|mirrobox|nephobox|freeterabox/i],
};
function fromScrapr(r) {
  if (!r || r.status === false) throw new Error((r && r.message) || 'Gagal');
  const x = r.result || r, items = [], kmap = { video: 'video', audio: 'audio', image: 'image', photo: 'image', file: 'file' };
  let ni = 0;
  (x.downloads || []).forEach(d => {
    if (!d || !d.url) return;
    const q = String(d.quality || '').trim(), k = kmap[d.type] || kindOf(q, d.url), o = { kind: k };
    let label = k === 'image' ? (/^(photo|image|foto)?$/i.test(q) ? 'Foto ' + (++ni) : q)
      : k === 'audio' ? (/mp3|m4a|flac|wav|kbps/i.test(q) ? q : ('MP3 ' + q).trim())
      : (/mp4|webm|mkv/i.test(q) ? q : ('MP4 ' + q).trim());
    if (d.isMirror) label += ' (mirror)';
    if (d.headers && typeof d.headers === 'object') o.h = d.headers;
    if (d.thumbnail) o.thumb = d.thumbnail;
    const fx = d.filename && (String(d.filename).match(/\.([a-z0-9]{2,4})$/i) || [])[1]; if (fx) o.ext = fx.toLowerCase();
    items.push(it(label, d.url, o));
  });
  if (!items.length && Array.isArray(x.items)) {
    const pad = String(x.items.length).length;
    x.items.forEach((v, i) => v && v.url && items.push(it(String(i + 1).padStart(pad, '0') + '. ' + (v.author ? v.author + ' - ' : '') + (v.title || 'Track') + ' [MP3]', '', { kind: 'audio', ext: 'mp3', thumb: v.thumbnail, lazy: { k: 'run', url: v.url, kind: 'audio' } })));
  }
  if (!items.length) throw new Error('Tidak ada tautan unduhan');
  return { title: x.title || 'Media', author: x.author || x.artist || '', thumb: x.thumbnail || x.thumb || '', items };
}
function adoptScrapr() {
  const S = W.__SCRAPR; if (!S) return;
  Object.keys(S).forEach(p => {
    const mod = S[p]; if (!mod || typeof mod !== 'object') return;
    if (!PL.some(x => x[0] === p)) { const e = EXTRA[p]; if (!e) return; PL.push([p, e[0], e[1]]); }
    const list = SRC[p] || (SRC[p] = []);
    Object.keys(mod).forEach(sn => {
      const fn = mod[sn]; if (typeof fn !== 'function') return;
      list.push(['scrapr:' + sn, async u => {
        if (sn === 'playlist' && !/[?&]list=/.test(u)) throw new Error('bukan playlist');
        return fromScrapr(await fn(u));
      }]);
    });
  });
}

adoptScrapr();
async function run(input, status) {
  const url = clean(input); if (!url) throw new Error('Tempel link terlebih dulu');
  const p = detect(url); if (!p) throw new Error('Platform belum didukung');
  const name = PL.find(x => x[0] === p)[1];
  let err = null;
  for (const [sn, fn] of SRC[p]) {
    status && status(name + ' · ' + sn + '…');
    try {
      const r = await fn(url);
      if (r && r.items && r.items.length) return Object.assign({ platform: p, pname: name, src: sn, url, author: '' }, r);
    } catch (e) { err = e; }
  }
  throw err || new Error('Gagal mengambil media');
}
async function resolve(item) {
  if (!item.lazy) return item;
  const l = item.lazy;
  if (l.k === 'yt') { const r = await ytGet(l.id, l.f); if (!r) throw new Error('Konversi gagal'); return Object.assign({}, item, { url: r.url }); }
  if (l.k === 'run') { const r = await run(l.url); const p = r.items.find(x => x.kind === l.kind && x.url) || r.items.find(x => x.url); if (!p) throw new Error('Tautan tidak ditemukan'); return Object.assign({}, item, { url: p.url, h: p.h }); }
  if (l.k === 'mate') { const L = (await mateTrack(l.m, l.ck, l.f)).filter(x => !x.cover); if (!L[0]) throw new Error('Tautan tidak ditemukan'); return Object.assign({}, item, { url: L[0].url }); }
  return item;
}
W.E = { v: SV, scrapr: W.__SCRAPR_INFO || null, src: SRC, run, resolve, detect, clean, PL, http, UA };
})();
