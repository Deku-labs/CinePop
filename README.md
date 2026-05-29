# CinePop

![Tests](https://github.com/YOUR-USERNAME/CinePop/actions/workflows/test.yml/badge.svg)
![Build APK](https://github.com/YOUR-USERNAME/CinePop/actions/workflows/build-apk.yml/badge.svg)

A simple installable Progressive Web App for searching and watching movies & TV shows.

## Flow
1. **Open the app** → see Continue Watching, Trending, Top Picks, and Popular TV rows.
2. **Search** any title in the top bar (or tap a poster from a row).
3. **Tap Play** → the chosen embed source loads in an iframe right there.
4. For TV shows, pick **Season / Episode** before/while playing.

## Features
- 📱 Installable PWA (Android, iOS, desktop) with offline app-shell cache
- 🔎 Instant search powered by IMDb's public suggestion JSON
- 🔥 **Trending Now**, 🏆 **IMDb Top Picks**, 📺 **Popular TV Shows** rows on home
- ⏱ **Continue Watching** — last 20 titles saved locally (with remove buttons)
- 🎛 **Multiple player sources** with one-tap switching:
  - CinePop (default)
  - VidSrc (`vidsrc.xyz`)
  - VidSrc.to
  - SuperEmbed (`multiembed.mov`)
  - 2Embed (`2embed.cc`)
- 📺 **TV season/episode selector** for sources that support it
- ⚙️ **Settings drawer** to choose your default source & clear history
- 🌒 Dark, mobile-first UI

## Run locally

PWAs need to be served over HTTP/HTTPS (not `file://`).

**Easiest way — one command:**
```bash
./start.sh
```
This boots `server.py` on <http://127.0.0.1:8080>, opens your browser, and
proxies IMDb's suggestion endpoint at `/api/imdb/*` so the browser doesn't
hit CORS errors. Override the port with `PORT=3000 ./start.sh`.

**Manual:**
```bash
python3 server.py            # same thing without the auto-open
```

> ⚠ Don't use `python3 -m http.server` directly — it won't proxy IMDb and
> search will fail with `Failed to fetch` (browser CORS block).

### Deploying

**Cloudflare Pages** is the recommended host — see [DEPLOY.md](./DEPLOY.md)
for a step-by-step guide. The `functions/api/imdb/[[path]].js` Pages Function
included in this repo is auto-detected and provides the IMDb proxy at the
edge, so search works without any extra setup.

Other static hosts (Netlify, Vercel, GitHub Pages, etc.) will serve the app
fine, but you'll need to add a small serverless function that proxies
`/api/imdb/<rest>` to `https://v3.sg.media-imdb.com/suggestion/<rest>`
(or point `IMDB_API` in `app.js` at a CORS proxy you trust).

On mobile, use "Add to Home Screen" or tap the floating **Install app** pill
in Chrome/Edge.

## Deploy
Drop the folder onto any static host: **Netlify**, **Vercel**, **Cloudflare Pages**,
**GitHub Pages**. HTTPS is required for the service worker.

## Customizing
- **Trending / Top / TV rows** — edit the arrays near the top of `app.js`
  (`TRENDING_QUERIES`, `TOP_QUERIES`, `TV_QUERIES`). Each entry is a search string
  resolved against IMDb's suggestion API at boot.
- **Player sources** — edit the `SOURCES` array in `app.js`. Each entry is:
  ```js
  {
    id: 'unique-id',
    name: 'Display name',
    desc: 'Short description shown in settings',
    movie: (ttId) => `https://example.com/embed/movie/${ttId}`,
    tv:    (ttId, season, ep) => `https://example.com/embed/tv/${ttId}/${season}/${ep}`,
    supportsTV: true
  }
  ```

## Testing

This project has a comprehensive test suite (295 assertions across 14 files):

```bash
cd tests
npm install
npm test          # full suite, ~80 s
npm run perf      # performance audit
```

CI runs all tests on every push + PR via [GitHub Actions](.github/workflows/test.yml). See [`tests/README.md`](tests/README.md) and [`PERFORMANCE.md`](PERFORMANCE.md) for details.

## Files
```
CinePop/
├── index.html              # UI shell (home rows, search, drawer)
├── app.js                  # Search, rows, history, sources, player
├── sw.js                   # Service worker (offline app-shell)
├── manifest.webmanifest    # PWA manifest
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    └── icon-maskable-512.png
```

## Notes / Caveats
- Playback is provided by 3rd-party embed sites via `<iframe>`. Availability varies
  by title and changes often — if one source fails, try another from the dropdown.
- Some browsers/extensions/networks block these iframes. Use the "Open in new tab"
  link as a fallback.
- IMDb's suggestion endpoint is public but unofficial; respect their terms.
- All content is embedded; this app does not host any media.
- Watch history is stored only in your browser's `localStorage` — clear it from
  the Settings drawer or the "Clear" button on the row.
