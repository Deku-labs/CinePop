# Deploying CinePop to Cloudflare Pages

This app works perfectly on **Cloudflare Pages** — static files served from
the edge, plus one tiny **Pages Function** that proxies IMDb's suggestion
endpoint (`/api/imdb/*`).

Everything is on the **free tier**:
- Pages: unlimited requests, 500 builds/month
- Pages Functions: 100 000 requests/day (this app uses ~1 per search keystroke)
- Bandwidth: unlimited

---

## Option A — One-click via GitHub (recommended)

1. **Push this folder to a GitHub repo** (just the `CinePop/` contents).
2. Go to <https://dash.cloudflare.com/> → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Pick your repo, then on the build settings screen:
   - **Framework preset:** *None*
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/` (or leave blank if the repo *is* the app)
4. Click **Save and Deploy**.
5. After ~30 seconds you'll get a URL like `https://CinePop.pages.dev`.

That's it. The `functions/api/imdb/[[path]].js` file is auto-detected and
mounted at `/api/imdb/*` — search will work immediately.

---

## Option B — Direct upload (no Git needed)

```bash
cd CinePop
npx wrangler pages deploy . --project-name CinePop
```

First run will prompt you to log in to Cloudflare. Subsequent deploys re-use
that login. Each deploy gives you a unique preview URL plus updates the
`*.pages.dev` production URL if you pass `--branch main`.

---

## Option C — Local preview that mimics production

If you want to test the Cloudflare runtime locally (instead of `./start.sh`):

```bash
cd CinePop
npx wrangler pages dev .
```

This boots a local server that runs the Pages Function the same way
production does. Open <http://127.0.0.1:8788>.

> Note: `./start.sh` still works for plain local dev — it just uses
> `server.py` to do the same proxying.

---

## How the routing works on Cloudflare

| URL                         | Served by               | Notes                             |
|-----------------------------|-------------------------|-----------------------------------|
| `/`, `/index.html`          | static                  | App shell                          |
| `/app.js`, `/sw.js`         | static                  | App + service worker               |
| `/manifest.webmanifest`     | static                  | PWA manifest                       |
| `/icons/*`                  | static, long-cached     | Cached 1 year via `_headers`       |
| `/api/imdb/<letter>/<q>.json` | **Pages Function**    | Proxies → `v3.sg.media-imdb.com`   |

The function lives in `functions/api/imdb/[[path]].js` and uses Cloudflare's
edge cache for 5 minutes per query (good neighbour to IMDb, snappy UX).

---

## Custom domain

Once deployed:

1. Cloudflare Dashboard → your Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter a domain you own (e.g. `play.example.com`).
3. Cloudflare adds the DNS record automatically (if the domain's nameservers are on Cloudflare) or shows you what CNAME to add.
4. HTTPS cert is provisioned in ~1 minute.

---

## Updating the app

Just push to your repo (Option A) or re-run `wrangler pages deploy` (Option B).

Cloudflare caches `sw.js` for 0 seconds (per `_headers`), so service-worker
updates roll out instantly — installed PWAs will pick up the new shell on
their next visit (network-first SW means the user sees the new version
without any "unregister" dance).

---

## Files needed for Cloudflare (already in this folder)

```
CinePop/
├── functions/
│   └── api/
│       └── imdb/
│           └── [[path]].js    # the proxy
├── _headers                   # cache rules
├── index.html
├── app.js
├── sw.js
├── manifest.webmanifest
└── icons/
```

`server.py`, `start.sh`, and this `DEPLOY.md` aren't strictly needed in
production — Cloudflare ignores them — but they don't hurt either.
