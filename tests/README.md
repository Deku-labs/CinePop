# CinePop — Tests

Headless E2E + unit tests using `jsdom`. Real network calls (IMDb, api.imdbapi.dev) are made — no mocks.

## Run all tests

```bash
cd tests
npm install      # one-time
npm test         # ~80 s, 295 assertions across 14 files
```

You'll see something like:

```
════════════════════════════════════════════════════════════
  CinePop — running 14 test file(s)
════════════════════════════════════════════════════════════

  ✓ test-az-pagination.js         11 passed,  0 failed  13.0s
  ✓ test-browse-more.js           22 passed,  0 failed  5.4s
  ✓ test-detail-fix.js            10 passed,  0 failed  6.8s
  ✓ test-e2e-flow.js              21 passed,  0 failed  2.5s
  ✓ test-f1.js                    29 passed,  0 failed  2.0s
  ...
════════════════════════════════════════════════════════════
  ✓ ALL TESTS PASS  —  295 assertions in 81.7s
════════════════════════════════════════════════════════════
```

## Run a single suite

```bash
npm run test:single test-f4.js
# or:
node test-f4.js
```

## Filter by name prefix

```bash
node run-all.js test-f1 test-f2       # only F1 + F2 tests
node run-all.js --bail                # stop at first failure
node run-all.js --no-color            # plain output (for CI logs)
```

## Performance audit

```bash
npm run perf
```

Prints bundle sizes, gzip/Brotli numbers, interaction timings, and a Lighthouse-style scorecard.

## How tests work

Each `test-*.js` file:
1. Boots `server.py` on a unique port (8901-8999 range)
2. Loads `http://127.0.0.1:<port>/` in `jsdom`
3. Patches `window.fetch` to use Node's `http`/`https` (jsdom's undici crashes on Python's HTTP/1.0)
4. Exercises the feature
5. Asserts with custom `ok()` / `bad()` helpers
6. Exits 0 on pass, 1 on fail

The `run-all.js` runner sequentially spawns each test (avoiding port collisions) and aggregates results.

## What's covered

| File | What it tests |
|---|---|
| `test.js` | Original 74-assertion suite (core search, watchlist, history, sources, SW) |
| `test-f1.js` | First-run onboarding |
| `test-f2.js` | Skeleton loaders |
| `test-f3.js` | Hero backdrop |
| `test-f4.js` | Theme picker |
| `test-f5.js` | View Transitions |
| `test-f6-10.js` | Haptic, A11y, Empty states, Pull-to-refresh, Splash |
| `test-f11.js` | "Because you watched" recommendations |
| `test-f12-18.js` | Similar / Trailer / Cast / Providers / Random / Coming Soon |
| `test-f19-24.js` | Browse tabs (Genre / Decade / Country / Mood / A–Z) |
| `test-browse-more.js` | Paginated browse with rating sort |
| `test-az-pagination.js` | A–Z directory big-pool fetch |
| `test-detail-fix.js` | Verifies the View-Transitions-stuck-skeleton bug stays fixed |
| `test-e2e-flow.js` | Full user journey: search → detail → play → close → browse |
| `perf-audit.js` | Bundle sizes, gzip/Brotli, interaction timings (not a test) |

## CI

GitHub Actions runs the whole suite on every push + PR + nightly via `.github/workflows/test.yml`.
See [the latest run](https://github.com/YOUR-USERNAME/CinePop/actions/workflows/test.yml).

## Caveats

- Tests hit **real public APIs** (IMDb, api.imdbapi.dev). If those rate-limit or go down, individual assertions may flake.
- `test-f5.js` simulates View Transitions API since jsdom doesn't implement it natively.
- `test-e2e-flow.js` stubs `HTMLIFrameElement` so the playimdb player doesn't actually load (it's slow and irrelevant for tests).
