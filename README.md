# Nimiyo × Nexora

Downloader media 16 platform (YouTube, TikTok, Instagram, X, Facebook, Threads, Pinterest, Bilibili, Pixiv,
Douyin, RedNote, Shopee Video, SoundCloud, Spotify, Apple Music, Bandcamp) dengan tema/UI Nexora Link.
APK ± 43 KB: satu Activity + WebView, seluruh logika ada di `web/`.

## Struktur
- `web/engine.js` — semua scraper (satu helper HTTP bersama, urutan sumber = fallback otomatis). `const SV` = scraperVersion.
- `web/app.js, app.css, index.html` — UI (Beranda, Riwayat, Pemutar, Theme Studio, Setelan, OTA).
- `native/smali/nx/*.smali` + `android/.../java/nx/*.java` — jembatan native `window.NX` (HTTP bebas-CORS, DownloadManager, clipboard). Smali = terjemahan Java.
- `tools/build_apk.py` — membangun APK tanpa Android SDK (assembler DEX, AXML, ARSC, tanda tangan v2). `python3 tools/build_apk.py`
- `android/` + `.github/workflows/build.yml` — jalur resmi Gradle/GitHub Actions (cadangan bila APK rakitan tidak mau terpasang).
- `tools/make-ota.js` — membuat paket update scraper.

## Update scraper tanpa memasang APK baru (OTA)
Satu file: `ota/bundle.js` = **scrapr (upstream coflyn/scrapr, diterjemahkan otomatis)** + `web/engine.js`.
GitHub Actions (`.github/workflows/ota.yml`) menjalankannya tiap push ke `web/engine.js`/`tools/make-ota.js`, tiap 6 jam, atau manual
(Actions → OTA scraper → Run workflow). Versi (`scraperVersion`) naik otomatis hanya bila isi bundle berubah — tidak perlu edit `const SV`.

Di aplikasi: Setelan → Update Scraper → URL `https://raw.githubusercontent.com/USER/REPO/main/ota` → Cek & perbarui (atau cek otomatis 6 jam).

Urutan sumber per platform: sumber bawaan `engine.js` dulu, lalu semua sumber scrapr sebagai cadangan (badge hasil menampilkan `scrapr:<nama>`).
Platform baru di upstream yang dikenal (Reddit, Terabox) otomatis muncul. `comic`/`anime`/`resolver` tidak diikutkan (API-nya bukan "tempel link lalu unduh").

Penerjemahan (`tools/make-ota.js`): `axios` → jembatan HTTP native, `cheerio` → subset di atas DOMParser, `Buffer`/`crypto` (SHA-256, AES-CBC) → implementasi JS,
`fs/os/child_process/puppeteer/playwright` → stub (sumber yang butuh itu gagal cepat lalu pindah ke fallback).
Batasan: `maxRedirects: 0` tidak bisa dihormati (redirect selalu diikuti), `responseType: arraybuffer/stream` tidak didukung.

Keamanan: kode upstream dijalankan di WebView aplikasimu. Isi `SCRAPR_REF` di `ota.yml` dengan tag yang sudah kamu periksa untuk mengunci versi.
Pengaman app tetap berlaku: HTTPS, SHA-256, uji struktur bundle, kembali ke bawaan bila gagal.

## Catatan
- Scraper memakai layanan pihak ketiga (ytmp3.gg, tikdownloader, snapsave, dst.) yang bisa berubah/mati kapan saja — itulah gunanya OTA.
- `tools/keys/` berisi kunci penanda tangan APK. Simpan; APK versi berikutnya harus ditandatangani kunci yang sama agar bisa menimpa instalasi.
