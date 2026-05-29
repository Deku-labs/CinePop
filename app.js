// CinePop PWA – search → details → play
// + Trending row, Continue Watching, multiple player sources

// ---------- Player sources ----------
// Each source builds an embed URL from an IMDb tt-ID.
// For TV shows, season/episode are appended where supported.
const SOURCES = [
  {
    id: 'playimdb',
    name: 'CinePop (default)',
    desc: 'The original playimdb.com embed.',
    movie: (id) => `https://www.playimdb.com/title/${id}/`,
    tv: (id, s, e) => `https://www.playimdb.com/title/${id}/`,
    supportsTV: false
  },
  {
    id: 'vidsrc',
    name: 'VidSrc',
    desc: 'vidsrc.xyz – movies + TV with season/episode.',
    movie: (id) => `https://vidsrc.xyz/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.xyz/embed/tv/${id}/${s}/${e}`,
    supportsTV: true
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc.to',
    desc: 'vidsrc.to mirror with multi-server playback.',
    movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`,
    supportsTV: true
  },
  {
    id: 'superembed',
    name: 'SuperEmbed (multiembed)',
    desc: 'multiembed.mov – wide title coverage.',
    movie: (id) => `https://multiembed.mov/?video_id=${id}`,
    tv: (id, s, e) => `https://multiembed.mov/?video_id=${id}&s=${s}&e=${e}`,
    supportsTV: true
  },
  {
    id: '2embed',
    name: '2Embed',
    desc: '2embed.cc – alternative source.',
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
    supportsTV: true
  }
];

// ────────────────────────────────────────────────────────────────
// TV mode detection (Android TV / Fire TV / Google TV / large screens).
// Adds `tv-mode` class to <html>, makes tiles + cards keyboard-focusable,
// installs spatial D-pad navigation, and hides anything mouse-only.
// ────────────────────────────────────────────────────────────────
const TV_FORCED = (() => { try { return /[?&]tv=1\b/.test(location.search) || localStorage.getItem('playimdb.tvMode') === '1'; } catch { return false; } })();
function detectTvMode() {
  try {
    if (TV_FORCED) return true;
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/\b(android\s*tv|googletv|crkey|smart-?tv|hbbtv|appletv|web0s|tizen|netcast|aftb|aftm|aftt|afts|aftn|firetv|bravia)\b/.test(ua)) return true;
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia : null;
    if (!mq) return false;
    const noTouch = mq('(hover: hover) and (pointer: fine)').matches === false
                 && mq('(pointer: coarse)').matches === false;
    const bigLandscape = window.innerWidth >= 1280
                      && window.innerHeight >= 720
                      && window.innerWidth >= window.innerHeight;
    return noTouch && bigLandscape;
  } catch { return false; }
}
const IS_TV = detectTvMode();
if (IS_TV) document.documentElement.classList.add('tv-mode');

const STORAGE = {
  source: 'playimdb.source',
  history: 'playimdb.history',
  watchlist: 'playimdb.watchlist',
  tvprogress: 'playimdb.tvprogress',
  titleSources: 'playimdb.titleSources',
  onboarded: 'playimdb.onboarded',
  theme: 'playimdb.theme'
};

function getSelectedSourceId() {
  return localStorage.getItem(STORAGE.source) || SOURCES[0].id;
}
function setSelectedSourceId(id) {
  localStorage.setItem(STORAGE.source, id);
}
function getSource(id) {
  return SOURCES.find(s => s.id === id) || SOURCES[0];
}

// ---------- Watch history ----------
const HISTORY_MAX = 20;
function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.history) || '[]'); }
  catch { return []; }
}
function saveHistory(list) {
  localStorage.setItem(STORAGE.history, JSON.stringify(list.slice(0, HISTORY_MAX)));
}
function addToHistory(item) {
  const list = getHistory().filter(x => x.id !== item.id);
  list.unshift({ ...item, ts: Date.now() });
  saveHistory(list);
  renderContinue();
  renderRecommendations();
}
function removeFromHistory(id) {
  saveHistory(getHistory().filter(x => x.id !== id));
  renderContinue();
}
function clearHistory() {
  localStorage.removeItem(STORAGE.history);
  renderContinue();
  renderRecommendations();
}

// ---------- Watchlist ----------
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(STORAGE.watchlist) || '[]'); }
  catch { return []; }
}
function saveWatchlist(list) {
  localStorage.setItem(STORAGE.watchlist, JSON.stringify(list));
}
function isInWatchlist(id) {
  return getWatchlist().some(x => x.id === id);
}
function toggleWatchlist(item) {
  const list = getWatchlist();
  const idx = list.findIndex(x => x.id === item.id);
  let nowIn;
  if (idx >= 0) { list.splice(idx, 1); nowIn = false; }
  else          { list.unshift({ ...item, ts: Date.now() }); nowIn = true; }
  saveWatchlist(list);
  renderWatchlist();
  document.querySelectorAll(`.heart[data-id="${item.id}"], .detail-heart[data-id="${item.id}"]`).forEach(b => {
    b.classList.toggle('on', nowIn);
    b.classList.add('bump');
    setTimeout(() => b.classList.remove('bump'), 350);
    const useEl = b.querySelector('use');
    if (useEl) useEl.setAttribute('href', nowIn ? '#i-heart-fill' : '#i-heart');
    const aria = nowIn ? 'Remove from watchlist' : 'Add to watchlist';
    b.setAttribute('aria-label', aria);
    b.setAttribute('title', aria);
  });
  return nowIn;
}
function clearWatchlist() {
  localStorage.removeItem(STORAGE.watchlist);
  renderWatchlist();
  document.querySelectorAll('.heart.on, .detail-heart.on').forEach(b => {
    b.classList.remove('on');
    const useEl = b.querySelector('use');
    if (useEl) useEl.setAttribute('href', '#i-heart');
  });
}

// ---------- TV episode progress ----------
// Stores the *last watched* season/episode per show id.
//   { "tt1234567": { s: 2, e: 5, ts: 1700000000000 } }
function getTvProgressMap() {
  try { return JSON.parse(localStorage.getItem(STORAGE.tvprogress) || '{}'); }
  catch { return {}; }
}
function getTvProgress(id) {
  return getTvProgressMap()[id] || null;
}
function setTvProgress(id, season, episode) {
  const map = getTvProgressMap();
  map[id] = { s: +season || 1, e: +episode || 1, ts: Date.now() };
  localStorage.setItem(STORAGE.tvprogress, JSON.stringify(map));
}

// ---------- Per-title source preference (#5) ----------
// Remembers which source you last used for each title id.
function getTitleSources() {
  try { return JSON.parse(localStorage.getItem(STORAGE.titleSources) || '{}'); }
  catch { return {}; }
}
function getTitleSource(id) {
  return getTitleSources()[id] || null;
}
function setTitleSource(id, srcId) {
  const map = getTitleSources();
  map[id] = srcId;
  localStorage.setItem(STORAGE.titleSources, JSON.stringify(map));
}

// ---------- Rich metadata (#1, OMDb-style via api.imdbapi.dev) ----------
// Free, no key, CORS-enabled. Returns plot, rating, genres, runtime, director, etc.
const META_CACHE = new Map();
async function fetchRichMeta(id) {
  if (META_CACHE.has(id)) return META_CACHE.get(id);
  try {
    const res = await fetch(`https://api.imdbapi.dev/titles/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('meta http ' + res.status);
    const data = await res.json();
    META_CACHE.set(id, data);
    return data;
  } catch (e) {
    META_CACHE.set(id, null);
    return null;
  }
}
function fmtRuntime(seconds) {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// ---------- Toast (used by share + shortcuts) ----------
let toastTimer = null;
function showToast(text, icon) {
  const el = document.getElementById('toast');
  if (!el) return;
  const ico = icon !== false ? '<svg><use href="#i-check"/></svg>' : '';
  el.innerHTML = `${ico}<span>${escapeHtml(text)}</span>`;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------- DOM refs ----------
const qEl = document.getElementById('q');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('status');
const homeEl = document.getElementById('home');
const searchViewEl = document.getElementById('searchView');

const detailEl = document.getElementById('detail');
const detailBody = document.getElementById('detail-body');
const detailTitle = document.getElementById('detail-title');
const backBtn = document.getElementById('back');

const continueSection = document.getElementById('continueSection');
const continueRow = document.getElementById('continueRow');
const recsSection = document.getElementById('recsSection');
const recsRow = document.getElementById('recsRow');
const recsLabel = document.getElementById('recsLabel');
const watchlistSection = document.getElementById('watchlistSection');
const watchlistRow = document.getElementById('watchlistRow');
const clearWatchlistBtn = document.getElementById('clearWatchlist');
const clearWatchlistDrawer = document.getElementById('clearWatchlistDrawer');
const trendingRow = document.getElementById('trendingRow');
const topRow = document.getElementById('topRow');
const tvRow = document.getElementById('tvRow');
const comingSoonRow = document.getElementById('comingSoonRow');
const hiddenGemsRow = document.getElementById('hiddenGemsRow');

const settingsBtn = document.getElementById('settingsBtn');
const drawer = document.getElementById('drawer');
const scrim = document.getElementById('scrim');
const closeDrawer = document.getElementById('closeDrawer');
const sourceList = document.getElementById('sourceList');
const clearHistoryDrawer = document.getElementById('clearHistoryDrawer');
const clearHistoryBtn = document.getElementById('clearHistory');

let searchTimer = null;
let lastQuery = '';
let currentController = null;
let lastResults = [];          // raw items for re-filtering/sorting
let activeFilter = 'all';      // all | movie | tv | recent
let activeSort = 'relevance';  // relevance | year-desc | year-asc | popularity

// ---------- Search ----------
qEl.addEventListener('input', () => {
  const v = qEl.value.trim();
  clearTimeout(searchTimer);
  if (v.length < 2) {
    showHome();
    return;
  }
  showSearch();
  searchTimer = setTimeout(() => doSearch(v), 220);
});

// Filter chips
document.querySelectorAll('#filters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    if (lastResults.length) renderResults(lastResults);
  });
});
// Sort dropdown
document.getElementById('sortSel').addEventListener('change', (e) => {
  activeSort = e.target.value;
  if (lastResults.length) renderResults(lastResults);
});

// Apply filter + sort to the cached raw search items.
function applyFilterSort(items) {
  const currentYear = new Date().getFullYear();
  let out = items.slice();
  if (activeFilter !== 'all') {
    out = out.filter(it => {
      const t = (it.qid || it.q || '').toLowerCase();
      const isTV = /tv|series|episode/.test(t);
      if (activeFilter === 'movie')  return !isTV;
      if (activeFilter === 'tv')     return isTV;
      if (activeFilter === 'recent') return it.y && (+it.y) >= currentYear - 5;
      return true;
    });
  }
  switch (activeSort) {
    case 'year-desc':   out.sort((a, b) => (+b.y || 0) - (+a.y || 0)); break;
    case 'year-asc':    out.sort((a, b) => (+a.y || 9999) - (+b.y || 9999)); break;
    case 'popularity':  out.sort((a, b) => (a.rank || 9e9) - (b.rank || 9e9)); break;
    // 'relevance' = original order
  }
  return out;
}

function showHome() {
  homeEl.hidden = false;
  searchViewEl.hidden = true;
  resultsEl.innerHTML = '';
  statusEl.innerHTML = '';
  lastQuery = '';
}
function showSearch() {
  homeEl.hidden = true;
  searchViewEl.hidden = false;
}

async function doSearch(query) {
  if (query === lastQuery) return;
  lastQuery = query;

  if (currentController) currentController.abort();
  currentController = new AbortController();

  // Show 4 skeleton cards while we wait — feels instant
  statusEl.innerHTML = '';
  resultsEl.innerHTML = skeletonResults(4);

  try {
    const items = await imdbSuggest(query, currentController.signal);
    statusEl.innerHTML = '';
    lastResults = items;
    if (items.length === 0) {
      resultsEl.innerHTML = `<div class="empty"><div class="ico"><svg width="26" height="26"><use href="#i-film"/></svg></div><div class="big-text">No results found</div><div class="hint">Try a shorter or simpler query. IMDb suggests as you type.</div></div>`;
      return;
    }
    renderResults(items);
  } catch (err) {
    if (err.name === 'AbortError') return;
    statusEl.innerHTML = '';
    const isProxyDown = /Failed to fetch|NetworkError|TypeError/i.test(err.message || '');
    const hint = isProxyDown
      ? `The local proxy isn't reachable. Make sure you ran <b>./start.sh</b> (not just opened the file), then hard-reload this page (<b>⌘⇧R</b> on Mac).`
      : escapeHtml(err.message || 'Unknown error');
    resultsEl.innerHTML = `<div class="empty"><div class="ico"><svg width="26" height="26"><use href="#i-alert"/></svg></div>Couldn\'t fetch results.<br><small style="line-height:1.5;display:block;margin-top:6px">${hint}</small></div>`;
  }
}

// IMDb's official suggestion JSON doesn't send CORS headers, so we proxy it
// through the local Python server (see server.py). The proxy mounts at:
//   /api/imdb/<letter>/<query>.json  ->  v3.sg.media-imdb.com/suggestion/...
// When deploying as a pure static site, swap IMDB_API for a hosted proxy
// (e.g. a tiny serverless function) — same path shape.
const IMDB_API = './api/imdb';

async function imdbSuggest(query, signal) {
  const q = String(query).trim();
  if (!q) return [];
  const first = q[0].toLowerCase();
  const url = `${IMDB_API}/${encodeURIComponent(first)}/${encodeURIComponent(q)}.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.d || []).filter(x => x.id && String(x.id).startsWith('tt'));
}

function renderResults(items) {
  cacheItems(items);
  const filtered = applyFilterSort(items);
  if (!filtered.length) {
    resultsEl.innerHTML = `<div class="empty"><div class="ico"><svg width="26" height="26"><use href="#i-tag"/></svg></div><div class="big-text">No matches for this filter</div><div class="hint">Try the <b>All</b> chip, or change your sort.</div></div>`;
    return;
  }
  resultsEl.innerHTML = filtered.map(it => resultCardHTML(it)).join('');
  resultsEl.querySelectorAll('.result').forEach(el => {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('click', (e) => {
      if (e.target.closest('.heart')) return;
      openDetail(el.dataset.id, el.dataset.title);
    });
    el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.heart')) {
        e.preventDefault();
        openDetail(el.dataset.id, el.dataset.title);
      }
    });
  });
  resultsEl.querySelectorAll('.heart').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      const cached = infoCache.get(id);
      const item = cached ? {
        id, title: cached.l, year: cached.y,
        poster: cached.i?.imageUrl ? thumbUrl(cached.i.imageUrl, 260, 390) : '',
        isTV: /tv|series|episode/i.test(cached.qid || cached.q || '')
      } : { id, title: '', year: '', poster: '', isTV: false };
      toggleWatchlist(item);
    });
  });
}

function resultCardHTML(it) {
  const img = it.i?.imageUrl ? thumbUrl(it.i.imageUrl, 128, 192) : '';
  const year = it.y || '';
  const type = (it.qid || it.q || '').toLowerCase();
  const isTV = type.includes('tv') || type.includes('series') || type.includes('episode');
  const typeLabel = it.q ? capitalize(it.q) : (isTV ? 'TV' : 'Movie');
  const stars = (it.s || '').trim();
  const inWL = isInWatchlist(it.id);
  const lbl = inWL ? 'Remove from watchlist' : 'Add to watchlist';
  return `
    <div class="result" data-id="${it.id}" data-title="${escapeAttr(it.l || '')}">
      <div class="poster">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : 'No image'}
      </div>
      <div class="meta">
        <div class="title">${escapeHtml(it.l || 'Untitled')}</div>
        <div class="row">
          ${year ? `<span>${year}</span>` : ''}
          <span class="pill ${isTV ? 'tv' : 'movie'}">${escapeHtml(typeLabel)}</span>
        </div>
        ${stars ? `<div class="row" title="${escapeAttr(stars)}">${escapeHtml(truncate(stars, 60))}</div>` : ''}
      </div>
      <button class="detail-heart heart ${inWL ? 'on' : ''}" data-id="${it.id}" aria-label="${lbl}" title="${lbl}" style="opacity:1;width:38px;height:38px;align-self:center">
        <svg viewBox="0 0 24 24"><use href="${inWL ? '#i-heart-fill' : '#i-heart'}"/></svg>
      </button>
    </div>
  `;
}

// ---------- Home rows ----------
// "Trending" picks are seeded from popular IMDb tt-IDs. We hydrate each through the
// suggestion endpoint so posters/titles stay accurate even if a film leaves IMDb's
// public charts. Easy to swap/extend any time.
const TRENDING_QUERIES = [
  'Dune Part Two', 'Oppenheimer', 'Deadpool & Wolverine', 'Inside Out 2',
  'The Batman', 'Furiosa', 'Civil War', 'Wicked', 'Gladiator II',
  'Anyone But You', 'Challengers', 'Twisters'
];

const TOP_QUERIES = [
  'The Shawshank Redemption', 'The Godfather', 'The Dark Knight',
  'Pulp Fiction', 'Schindler\'s List', 'The Lord of the Rings Return of the King',
  'Fight Club', 'Forrest Gump', 'Inception', 'The Matrix',
  'Interstellar', 'Parasite'
];

const TV_QUERIES = [
  'Breaking Bad', 'Game of Thrones', 'Stranger Things', 'The Last of Us',
  'House of the Dragon', 'Succession', 'The Bear', 'Severance',
  'Wednesday', 'Shogun', 'True Detective', 'Fallout'
];

// Upcoming / future releases (filter applied later: year >= currentYear)
const COMING_SOON_QUERIES = [
  'Avatar Fire and Ash', 'Mission Impossible The Final Reckoning',
  'Dune Part Three', 'Avengers Doomsday', 'Wicked For Good',
  'The Batman Part II', 'Superman', 'Jurassic World Rebirth',
  'Tron Ares', 'Zootopia 2'
];

// Hidden gems — high-rated but lower-profile picks
const HIDDEN_GEMS_QUERIES = [
  'Past Lives', 'Aftersun', 'The Banshees of Inisherin',
  'Decision to Leave', 'Petite Maman', 'The Worst Person in the World',
  'Drive My Car', 'Anatomy of a Fall', 'Perfect Days',
  'The Holdovers', 'Promising Young Woman', 'Sound of Metal'
];

async function hydrateRow(queries, target, restrictTV = null) {
  target.innerHTML = skeletonTiles(6);
  const items = [];
  // run in parallel but cap concurrency at 4
  const queue = [...queries];
  async function worker() {
    while (queue.length) {
      const q = queue.shift();
      try {
        const arr = await imdbSuggest(q);
        const pick = arr.find(x => {
          if (!x.id || !x.id.startsWith('tt')) return false;
          if (restrictTV === true) {
            const type = (x.qid || x.q || '').toLowerCase();
            return type.includes('tv') || type.includes('series');
          }
          if (restrictTV === false) {
            const type = (x.qid || x.q || '').toLowerCase();
            return !type.includes('episode') && !(type.includes('tv') && !type.includes('movie'));
          }
          return true;
        }) || arr[0];
        if (pick) items.push(pick);
      } catch {}
    }
  }
  await Promise.all(Array.from({length: 4}, worker));
  // de-dupe by id, preserve seed order roughly
  const seen = new Set();
  const ordered = [];
  for (const q of queries) {
    const match = items.find(it => it && !seen.has(it.id) &&
      (it.l || '').toLowerCase().includes(q.split(' ')[0].toLowerCase()));
    if (match) { seen.add(match.id); ordered.push(match); }
  }
  for (const it of items) {
    if (it && !seen.has(it.id)) { seen.add(it.id); ordered.push(it); }
  }
  cacheItems(ordered);
  target.innerHTML = ordered.map(it => tileHTML(it)).join('') ||
    '<div class="empty" style="padding:20px">Couldn\'t load this row. Check your connection.</div>';
  wireRowEvents(target, { allowRemove: false });
}

function tileHTML(it) {
  const img = it.i?.imageUrl ? thumbUrl(it.i.imageUrl, 260, 390) : '';
  const year = it.y || '';
  const inWL = isInWatchlist(it.id);
  const lbl = inWL ? 'Remove from watchlist' : 'Add to watchlist';
  return `
    <div class="tile" data-id="${it.id}" data-title="${escapeAttr(it.l || '')}">
      <div class="ph">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : 'No image'}
        <button class="heart ${inWL ? 'on' : ''}" data-id="${it.id}" aria-label="${lbl}" title="${lbl}">
          <svg viewBox="0 0 24 24"><use href="${inWL ? '#i-heart-fill' : '#i-heart'}"/></svg>
        </button>
        <div class="play-ov"><span class="pbtn"><svg viewBox="0 0 24 24"><use href="#i-play"/></svg></span></div>
      </div>
      <div class="t">${escapeHtml(it.l || '')}</div>
      ${year ? `<div class="yr">${year}</div>` : ''}
    </div>
  `;
}

function historyTileHTML(it) {
  const img = it.poster || '';
  const sub = it.year ? String(it.year) : '';
  const inWL = isInWatchlist(it.id);
  const lbl = inWL ? 'Remove from watchlist' : 'Add to watchlist';
  return `
    <div class="tile" data-id="${it.id}" data-title="${escapeAttr(it.title || '')}">
      <div class="ph">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : 'No image'}
        <button class="heart ${inWL ? 'on' : ''}" data-id="${it.id}" aria-label="${lbl}" title="${lbl}">
          <svg viewBox="0 0 24 24"><use href="${inWL ? '#i-heart-fill' : '#i-heart'}"/></svg>
        </button>
        <button class="rm" data-remove="${it.id}" aria-label="Remove"><svg viewBox="0 0 24 24"><use href="#i-x"/></svg></button>
        <div class="play-ov"><span class="pbtn"><svg viewBox="0 0 24 24"><use href="#i-play"/></svg></span></div>
      </div>
      <div class="t">${escapeHtml(it.title || '')}</div>
      ${sub ? `<div class="yr">${sub}</div>` : ''}
    </div>
  `;
}

function skeletonTiles(n) {
  return Array.from({length: n}).map(() => `
    <div class="tile"><div class="ph skel" style="background-color:transparent"></div></div>
  `).join('');
}

function skeletonResults(n) {
  // Skeleton cards used during search loading
  return Array.from({length: n}).map(() => `
    <div class="skel-result">
      <div class="skel skel-poster"></div>
      <div class="skel-meta">
        <div class="skel skel-line title"></div>
        <div class="skel skel-line med"></div>
        <div class="skel skel-line short"></div>
      </div>
    </div>
  `).join('');
}

function skeletonDetail() {
  // Skeleton for the detail body while richMeta + suggestion data loads
  return `
    <div class="skel-detail">
      <div class="skel-top">
        <div class="skel skel-poster-lg"></div>
        <div class="skel-info">
          <div class="skel skel-line title"></div>
          <div class="skel skel-line short"></div>
          <div class="skel skel-pills">
            <span class="skel skel-pill"></span>
            <span class="skel skel-pill" style="width:50px"></span>
            <span class="skel skel-pill" style="width:80px"></span>
          </div>
        </div>
      </div>
      <div class="skel-plot">
        <div class="skel skel-line long"></div>
        <div class="skel skel-line long"></div>
        <div class="skel skel-line med"></div>
      </div>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// Feature #15 — Random Pick (shuffle from watchlist + history + trending)
// ────────────────────────────────────────────────────────────────
function pickRandomTitle() {
  const pool = [
    ...getWatchlist(),
    ...getHistory(),
    ...Array.from(infoCache.values()).map(it => ({
      id: it.id, title: it.l, year: it.y,
      poster: it.i?.imageUrl ? thumbUrl(it.i.imageUrl, 260, 390) : '',
      isTV: /tv|series|episode/i.test(it.qid || it.q || '')
    }))
  ];
  // De-dupe
  const seen = new Set();
  const unique = pool.filter(p => p.id && !seen.has(p.id) && seen.add(p.id));
  if (!unique.length) {
    showToast('Add to your watchlist or browse a bit first');
    return;
  }
  const pick = unique[Math.floor(Math.random() * unique.length)];
  openDetail(pick.id, pick.title);
}

document.addEventListener('DOMContentLoaded', () => {
  const fab = document.getElementById('randomPickBtn');
  if (fab) {
    fab.addEventListener('click', () => {
      fab.classList.add('spin');
      setTimeout(() => fab.classList.remove('spin'), 600);
      hapticTap('success');
      pickRandomTitle();
    });
  }
  // Toggle FAB visibility based on detail open state
  const detailObs = new MutationObserver(() => {
    document.body.classList.toggle('detail-open',
      document.getElementById('detail')?.classList.contains('open'));
  });
  if (document.getElementById('detail')) {
    detailObs.observe(document.getElementById('detail'), { attributes: true, attributeFilter: ['class'] });
  }
});

// ────────────────────────────────────────────────────────────────
// Feature #16 — Trailer modal (YouTube embed via search query)
// ────────────────────────────────────────────────────────────────
function openTrailer(title, year) {
  const q = encodeURIComponent(`${title} ${year || ''} official trailer`.trim());
  // Use YouTube embed search-results page via youtube-nocookie
  const src = `https://www.youtube-nocookie.com/embed?listType=search&list=${q}&autoplay=1`;
  let modal = document.getElementById('trailerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'trailerModal';
    modal.className = 'trailer-modal';
    modal.innerHTML = `
      <div class="trailer-frame">
        <button class="trailer-close" id="trailerClose" aria-label="Close trailer">
          <svg><use href="#i-x"/></svg>
        </button>
        <iframe id="trailerIframe" src="" title="Trailer"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeTrailer(); });
    document.getElementById('trailerClose').addEventListener('click', closeTrailer);
  }
  document.getElementById('trailerIframe').src = src;
  modal.classList.add('open');
}
function closeTrailer() {
  const modal = document.getElementById('trailerModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.getElementById('trailerIframe').src = '';   // stop playback
}
// Esc closes trailer
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('trailerModal')?.classList.contains('open')) {
    e.preventDefault(); closeTrailer();
  }
});

// ────────────────────────────────────────────────────────────────
// Feature #12 — Similar titles section on detail page
// ────────────────────────────────────────────────────────────────
async function renderSimilar(seedId, seedTitle, seedMeta) {
  const host = document.getElementById('similarRow');
  if (!host) return;
  host.innerHTML = skeletonTiles(6);
  try {
    // Strategy: use first genre + seed title's first word as queries
    const genres = (seedMeta?.genres || []).slice(0, 2);
    const queries = genres.length ? genres : [(seedTitle || '').split(/\s+/)[0]];
    const pools = await Promise.all(queries.map(q => imdbSuggest(q).catch(() => [])));
    let pool = [].concat(...pools).filter(it => it.id && it.id !== seedId);
    const seen = new Set();
    pool = pool.filter(it => seen.has(it.id) ? false : seen.add(it.id));
    cacheItems(pool);
    const picks = pool.slice(0, 10);
    if (!picks.length) { host.innerHTML = ''; return; }
    host.innerHTML = picks.map(tileHTML).join('');
    wireRowEvents(host, { allowRemove: false });
  } catch { host.innerHTML = ''; }
}

// ────────────────────────────────────────────────────────────────
// Feature #18 — "Where to watch" via JustWatch (free, no key)
// Note: JustWatch's public API requires complex queries. As a lightweight
// alternative we link to JustWatch's web search for the title.
// ────────────────────────────────────────────────────────────────
function providersHTML(title, year) {
  if (!title) return '';
  const q = encodeURIComponent(`${title} ${year || ''}`.trim());
  // Direct links to popular discovery services
  return `
    <div class="providers">
      <span class="prov-label">Find where to watch:</span>
      <a href="https://www.justwatch.com/us/search?q=${q}" target="_blank" rel="noopener noreferrer">JustWatch ↗</a>
      <a href="https://www.themoviedb.org/search?query=${q}" target="_blank" rel="noopener noreferrer">TMDB ↗</a>
      <a href="https://www.google.com/search?q=watch+${q}+streaming" target="_blank" rel="noopener noreferrer">Google ↗</a>
    </div>
  `;
}

// ────────────────────────────────────────────────────────────────
// Recommendations (Feature #11) — "Because you watched ___"
// Uses the most recently watched title's genres to fetch similar titles
// from IMDb's suggestion endpoint, weighted by overlapping genre count.
// ────────────────────────────────────────────────────────────────
async function renderRecommendations() {
  const history = getHistory();
  if (!history.length) {
    recsSection.hidden = true;
    return;
  }
  const seed = history[0]; // most recent
  if (!seed?.id || !seed?.title) {
    recsSection.hidden = true;
    return;
  }
  // Update label with the seed title
  recsLabel.textContent = `Because you watched ${seed.title}`;
  recsSection.hidden = false;

  // Show skeletons while fetching
  recsRow.innerHTML = skeletonTiles(6);

  try {
    const seedMeta = await fetchRichMeta(seed.id);
    const seedGenres = new Set((seedMeta?.genres || []).map(g => g.toLowerCase()));

    // Build candidate pool: query IMDb suggestions for each genre, top 5 each.
    const queries = seedGenres.size
      ? Array.from(seedGenres).slice(0, 3)              // up to 3 genres
      : [seed.title.split(/\s+/)[0]];                  // fallback: first word
    const pools = await Promise.all(queries.map(q =>
      imdbSuggest(q).catch(() => [])
    ));
    let pool = [].concat(...pools);

    // De-duplicate + exclude history items
    const historyIds = new Set(history.map(h => h.id));
    const seen = new Set();
    pool = pool.filter(it => {
      if (!it.id || !it.id.startsWith('tt')) return false;
      if (historyIds.has(it.id)) return false;
      if (seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });

    // Cache + render top 12
    cacheItems(pool);
    const picks = pool.slice(0, 12);

    if (!picks.length) {
      recsSection.hidden = true;
      return;
    }
    recsRow.innerHTML = picks.map(tileHTML).join('');
    wireRowEvents(recsRow, { allowRemove: false });
  } catch (e) {
    // Soft fail — just hide the row
    recsSection.hidden = true;
  }
}

function renderContinue() {
  const list = getHistory();
  if (!list.length) {
    continueSection.hidden = true;
    continueRow.innerHTML = '';
    return;
  }
  continueSection.hidden = false;
  continueRow.innerHTML = list.map(historyTileHTML).join('');
  wireRowEvents(continueRow, { allowRemove: true });
}

function renderWatchlist() {
  const list = getWatchlist();
  if (!list.length) {
    watchlistSection.hidden = true;
    watchlistRow.innerHTML = '';
    return;
  }
  watchlistSection.hidden = false;
  watchlistRow.innerHTML = list.map(historyTileHTML).join('');
  wireRowEvents(watchlistRow, { allowRemove: false });
}

function wireRowEvents(rowEl, opts) {
  const allowRemove = !!(opts && opts.allowRemove);
  rowEl.querySelectorAll('.tile').forEach(el => {
    // Make focusable so D-pad / Tab can land on it
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('click', (e) => {
      if (e.target.closest('.heart') || e.target.closest('.rm')) return;
      openDetail(el.dataset.id, el.dataset.title);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.heart') || e.target.closest('.rm')) return;
        e.preventDefault();
        openDetail(el.dataset.id, el.dataset.title);
      }
    });
  });
  rowEl.querySelectorAll('.heart').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = b.dataset.id;
      const tile = b.closest('.tile');
      const cached = infoCache.get(id);
      let item;
      if (cached) {
        item = {
          id,
          title: cached.l,
          year: cached.y,
          poster: cached.i?.imageUrl ? thumbUrl(cached.i.imageUrl, 260, 390) : '',
          isTV: /tv|series|episode/i.test(cached.qid || cached.q || '')
        };
      } else {
        const img = tile?.querySelector('.ph img')?.src || '';
        item = { id, title: tile?.dataset.title || '', year: '', poster: img, isTV: false };
      }
      toggleWatchlist(item);
    });
  });
  if (allowRemove) {
    rowEl.querySelectorAll('.rm').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFromHistory(b.dataset.remove);
      });
    });
  }
}

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('Clear watch history?')) clearHistory();
});
clearWatchlistBtn.addEventListener('click', () => {
  if (confirm('Clear watchlist?')) clearWatchlist();
});
clearWatchlistDrawer.addEventListener('click', () => {
  if (confirm('Clear watchlist?')) clearWatchlist();
});

// ---------- Detail / Player ----------
let currentDetail = null; // {id, isTV, title, year, poster}
Object.defineProperty(window, 'currentDetail', { get: () => currentDetail });

async function openDetail(id, fallbackTitle) {
  history.pushState({ view: 'detail', id }, '', `#${id}`);

  // Synchronously open the detail panel with a skeleton so the user
  // sees instant feedback. View Transitions are intentionally NOT used
  // to wrap this — they caused the panel to freeze on Chrome/Safari Mac.
  detailTitle.textContent = fallbackTitle || id;
  detailBody.innerHTML = skeletonDetail();
  detailEl.classList.add('open');
  detailEl.setAttribute('aria-hidden', 'false');

  // Tiny CSS fade-in fallback (works everywhere)
  detailEl.classList.add('vt-fallback');
  setTimeout(() => detailEl.classList.remove('vt-fallback'), 300);

  // Fetch metadata (may be cached → instant)
  let info = null;
  try {
    info = await getCachedInfo(id, fallbackTitle);
  } catch (e) {
    console.warn('[openDetail] getCachedInfo failed:', e);
  }

  // Render the real detail. Wrapped in try/catch so any single failure
  // (e.g. SOURCES misconfig, missing element) leaves a useful message
  // instead of an eternal skeleton.
  try {
    renderDetail(id, info, fallbackTitle);
  } catch (e) {
    console.error('[openDetail] renderDetail threw:', e);
    detailBody.innerHTML = `
      <div class="empty" style="padding:40px 16px">
        <div class="ico"><svg width="26" height="26"><use href="#i-alert"/></svg></div>
        <div class="big-text">Couldn\'t load this title</div>
        <div class="hint">${escapeHtml(String(e && e.message || e))}</div>
        <button class="cta" onclick="closeDetail()">Go back</button>
      </div>`;
  }
}

const infoCache = new Map();
function cacheItems(items) {
  items.forEach(it => { if (it && it.id) infoCache.set(it.id, it); });
}
async function getCachedInfo(id, fallbackTitle) {
  if (infoCache.has(id)) return infoCache.get(id);
  if (fallbackTitle) {
    try {
      const arr = await imdbSuggest(fallbackTitle);
      cacheItems(arr);
      if (infoCache.has(id)) return infoCache.get(id);
    } catch {}
  }
  return null;
}

function renderDetail(id, info, fallbackTitle) {
  const title = info?.l || fallbackTitle || id;
  const year = info?.y || '';
  const type = (info?.qid || info?.q || '').toLowerCase();
  const isTV = type.includes('tv') || type.includes('series') || type.includes('episode');
  const typeLabel = info?.q ? capitalize(info.q) : (isTV ? 'TV' : 'Movie');
  const img = info?.i?.imageUrl ? thumbUrl(info.i.imageUrl, 320, 480) : '';
  const stars = (info?.s || '').trim();
  const rank = info?.rank;

  currentDetail = { id, isTV, title, year, poster: img };
  detailTitle.textContent = title;

  // Build source <option>s, marking those that don't support TV when needed.
  const selectedId = getTitleSource(id) || getSelectedSourceId();
  const optsHtml = SOURCES.map(s => {
    const incompatible = isTV && !s.supportsTV;
    const label = incompatible ? `${s.name} — movie only` : s.name;
    return `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');

  // Bigger image URL for the blurred backdrop (uses higher-res IMDb thumb)
  const bgImg = info?.i?.imageUrl ? thumbUrl(info.i.imageUrl, 600, 900) : '';
  detailBody.innerHTML = `
    <div class="hero ${bgImg ? '' : 'no-art'}">
      ${bgImg ? `<div class="hero-bg" style="background-image:url('${bgImg}')"></div>` : ''}
    <div class="detail-top">
      <div class="poster">
        ${img ? `<img src="${img}" alt="" loading="eager">` : 'No image'}
      </div>
      <div style="min-width:0;flex:1">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <h2 style="flex:1;min-width:0">${escapeHtml(title)}</h2>
          <button class="detail-heart" id="detailShare" aria-label="Share" title="Share">
            <svg viewBox="0 0 24 24"><use href="#i-share"/></svg>
          </button>
          <button class="detail-heart ${isInWatchlist(id) ? 'on' : ''}" data-id="${id}" id="detailHeart" aria-label="${isInWatchlist(id) ? 'Remove from watchlist' : 'Add to watchlist'}" title="${isInWatchlist(id) ? 'Remove from watchlist' : 'Add to watchlist'}">
            <svg viewBox="0 0 24 24"><use href="${isInWatchlist(id) ? '#i-heart-fill' : '#i-heart'}"/></svg>
          </button>
        </div>
        <div class="row">
          ${year ? `<span>${year}</span>` : ''}
          <span class="pill ${isTV ? 'tv' : 'movie'}">${escapeHtml(typeLabel)}</span>
          ${rank ? `<span class="pill">Popularity #${rank}</span>` : ''}
          <span class="pill" style="background:#3a2a10;color:#ffd87a">IMDb ${escapeHtml(id)}</span>
        </div>
        ${stars ? `<div class="plot" style="margin-top:10px"><b style="color:#fff">Cast:</b> ${escapeHtml(stars)}</div>` : ''}
      </div>
    </div>
    </div><!-- /hero -->

    <div id="richMeta"></div>

    <div class="source-select">
      <label for="sourcePick">Source:</label>
      <select id="sourcePick">${optsHtml}</select>
    </div>

    <div class="tv-controls ${isTV ? 'show' : ''}">
      <div class="group">
        <label>Season</label>
        <button data-step="s" data-dir="-1" aria-label="Decrease season"><svg><use href="#i-minus"/></svg></button>
        <input id="seasonInp" type="number" min="1" value="${isTV ? (getTvProgress(id)?.s || 1) : 1}">
        <button data-step="s" data-dir="1" aria-label="Increase season"><svg><use href="#i-plus"/></svg></button>
      </div>
      <div class="group">
        <label>Episode</label>
        <button data-step="e" data-dir="-1" aria-label="Decrease episode"><svg><use href="#i-minus"/></svg></button>
        <input id="episodeInp" type="number" min="1" value="${isTV ? (getTvProgress(id)?.e || 1) : 1}">
        <button data-step="e" data-dir="1" aria-label="Increase episode"><svg><use href="#i-plus"/></svg></button>
      </div>
      ${isTV && getTvProgress(id) ? `<button id="resumePill" class="resume-pill" title="Continue where you left off"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Resume S${getTvProgress(id).s}·E${getTvProgress(id).e}</button>` : ''}
    </div>

    <button id="playBtn" class="play-btn">
      <svg><use href="#i-play"/></svg>
      Play
    </button>

    <div id="playerHost"></div>

    ${isTV ? `
    <div class="ep-nav" id="epNav">
      <button class="nav-btn" id="prevEp" type="button">
        <svg><use href="#i-chev-left"/></svg> Previous <small>episode</small>
      </button>
      <div class="ep-current" id="epCurrent"></div>
      <button class="nav-btn" id="nextEp" type="button">
        Next <small>episode</small> <svg><use href="#i-chev-right"/></svg>
      </button>
    </div>` : ''}

    <a class="open-ext" id="openExt" href="#" target="_blank" rel="noopener">
      <svg><use href="#i-external"/></svg> Open in new tab
    </a>

    <p style="color:var(--muted);font-size:12px;margin-top:18px;line-height:1.5">
      Playback is provided by your selected embed source. If the video doesn't load,
      try a different source from the dropdown above.
    </p>
  `;

  const sourcePick = document.getElementById('sourcePick');
  const playBtn = document.getElementById('playBtn');
  const openExt = document.getElementById('openExt');

  function refreshExtLink() {
    const src = getSource(sourcePick.value);
    const s = +(document.getElementById('seasonInp')?.value || 1);
    const e = +(document.getElementById('episodeInp')?.value || 1);
    openExt.href = isTV && src.supportsTV ? src.tv(id, s, e) : src.movie(id);
  }
  refreshExtLink();

  sourcePick.addEventListener('change', () => {
    setSelectedSourceId(sourcePick.value);
    setTitleSource(id, sourcePick.value);   // also remember for *this* title (#5)
    refreshExtLink();
    if (document.querySelector('#playerHost iframe')) startPlayback();
  });

  // ----- TV controls (season/episode + resume/prev/next) -----
  const epCurrentEl = document.getElementById('epCurrent');
  const prevBtn = document.getElementById('prevEp');
  const nextBtn = document.getElementById('nextEp');

  function getSE() {
    return {
      s: Math.max(1, +(document.getElementById('seasonInp')?.value) || 1),
      e: Math.max(1, +(document.getElementById('episodeInp')?.value) || 1)
    };
  }
  function setSE(s, e) {
    const sEl = document.getElementById('seasonInp');
    const eEl = document.getElementById('episodeInp');
    if (sEl) sEl.value = Math.max(1, s);
    if (eEl) eEl.value = Math.max(1, e);
  }
  function syncEpUI() {
    if (!isTV) return;
    const { s, e } = getSE();
    if (epCurrentEl) epCurrentEl.innerHTML = `Now: <b>S${s}·E${e}</b>`;
    if (prevBtn) prevBtn.disabled = (s === 1 && e === 1);
  }
  function commitProgressIfPlaying() {
    if (!isTV) return;
    if (document.querySelector('#playerHost iframe')) {
      const { s, e } = getSE();
      setTvProgress(id, s, e);
    }
  }

  detailBody.querySelectorAll('.tv-controls button[data-step]').forEach(b => {
    b.addEventListener('click', () => {
      const target = b.dataset.step === 's' ? 'seasonInp' : 'episodeInp';
      const inp = document.getElementById(target);
      inp.value = Math.max(1, (+inp.value || 1) + (+b.dataset.dir));
      syncEpUI();
      refreshExtLink();
      if (document.querySelector('#playerHost iframe')) { startPlayback(); commitProgressIfPlaying(); }
    });
  });
  ['seasonInp','episodeInp'].forEach(idn => {
    const el = document.getElementById(idn);
    if (el) el.addEventListener('change', () => {
      syncEpUI();
      refreshExtLink();
      if (document.querySelector('#playerHost iframe')) { startPlayback(); commitProgressIfPlaying(); }
    });
  });

  if (prevBtn) prevBtn.addEventListener('click', () => {
    const { s, e } = getSE();
    if (e > 1) setSE(s, e - 1);
    else if (s > 1) setSE(s - 1, 1);
    else return;
    syncEpUI();
    refreshExtLink();
    startPlayback();
    commitProgressIfPlaying();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    const { s, e } = getSE();
    setSE(s, e + 1);
    syncEpUI();
    refreshExtLink();
    startPlayback();
    commitProgressIfPlaying();
  });

  const resumePill = document.getElementById('resumePill');
  if (resumePill) resumePill.addEventListener('click', () => {
    const p = getTvProgress(id);
    if (!p) return;
    setSE(p.s, p.e);
    syncEpUI();
    refreshExtLink();
    startPlayback();
    addToHistory({ id, title, year, poster: img, isTV });
    commitProgressIfPlaying();
  });

  syncEpUI();

  playBtn.addEventListener('click', () => {
    startPlayback();
    addToHistory({ id, title, year, poster: img, isTV });
    commitProgressIfPlaying();
  });

  const detailHeart = document.getElementById('detailHeart');
  if (detailHeart) {
    detailHeart.addEventListener('click', () => {
      toggleWatchlist({ id, title, year, poster: img, isTV });
    });
  }

  // Share button (#2)
  const detailShare = document.getElementById('detailShare');
  if (detailShare) {
    detailShare.addEventListener('click', () => openShare(id, title));
  }

  // Rich metadata (#1) — fetched async, fills #richMeta when ready
  hydrateRichMeta(id);
}

async function hydrateRichMeta(id) {
  const host = document.getElementById('richMeta');
  if (!host) return;
  host.innerHTML = `<div class="meta-pills" style="opacity:.5"><span class="meta-pill"><svg><use href="#i-clock"/></svg>Loading details…</span></div>`;
  const m = await fetchRichMeta(id);
  // Bail if the user navigated away
  if (!document.body.contains(host)) return;
  if (!m) { host.innerHTML = ''; return; }

  const rating = m.rating?.aggregateRating;
  const votes  = m.rating?.voteCount;
  const runtime = fmtRuntime(m.runtimeSeconds);
  const years = m.endYear && m.endYear !== m.startYear
                 ? `${m.startYear}–${m.endYear}`
                 : (m.startYear || '');
  const genres = Array.isArray(m.genres) ? m.genres : [];
  const directors = (m.directors || []).map(d => d.displayName).filter(Boolean);
  const writers   = (m.writers   || []).map(d => d.displayName).filter(Boolean);
  const stars     = (m.stars     || []).map(d => d.displayName).filter(Boolean);

  const pills = [
    rating ? `<span class="meta-pill rating"><svg><use href="#i-star"/></svg>${rating.toFixed(1)}<small style="opacity:.7;margin-left:3px">/10${votes ? ` · ${formatVotes(votes)}` : ''}</small></span>` : '',
    runtime ? `<span class="meta-pill"><svg><use href="#i-clock"/></svg>${runtime}</span>` : '',
    years ? `<span class="meta-pill">${years}</span>` : '',
    m.metacritic?.score ? `<span class="meta-pill" style="background:#1a2a3a;color:#9ec5ff;border-color:#2a3a52">Metacritic ${m.metacritic.score}</span>` : ''
  ].filter(Boolean).join('');

  // Build cast chips for clickable filmographies (#17)
  const castChips = stars.length
    ? `<div class="cast-chips">${stars.slice(0,6).map(name =>
        `<button class="cast-chip" data-name="${escapeAttr(name)}" type="button"><svg viewBox="0 0 24 24" width="11" height="11"><use href="#i-people"/></svg>${escapeHtml(name)}</button>`
      ).join('')}</div>`
    : '';

  host.innerHTML = `
    ${pills ? `<div class="meta-pills">${pills}</div>` : ''}
    ${genres.length ? `<div class="genre-list">${genres.map(g => `<span class="genre">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
    ${m.plot ? `<p class="meta-plot">${escapeHtml(m.plot)}</p>` : ''}
    <div class="meta-creators">
      ${directors.length ? `<div><b>Director${directors.length > 1 ? 's' : ''}</b>${escapeHtml(directors.slice(0,3).join(', '))}</div>` : ''}
      ${writers.length   ? `<div><b>Writer${writers.length > 1 ? 's' : ''}</b>${escapeHtml(writers.slice(0,3).join(', '))}</div>` : ''}
    </div>
    ${castChips}
    <button class="trailer-btn" id="trailerOpenBtn" type="button">
      <svg><use href="#i-play-circle"/></svg> Watch trailer
    </button>
    ${providersHTML(m.primaryTitle || (window.currentDetail?.title || ''),
                    m.startYear || (window.currentDetail?.year || ''))}
    <div class="similar-section">
      <h3><svg><use href="#i-sparkles"/></svg> Similar titles</h3>
      <div class="hrow" id="similarRow"></div>
    </div>
  `;

  // Trailer
  const trailerBtn = document.getElementById('trailerOpenBtn');
  if (trailerBtn) {
    trailerBtn.addEventListener('click', () => {
      openTrailer(m.primaryTitle || window.currentDetail?.title || '', m.startYear || '');
    });
  }

  // Cast filmography: tap chip → run a search for that actor
  host.querySelectorAll('.cast-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const name = chip.dataset.name;
      // Close detail, focus search, fill, dispatch input
      closeDetail();
      const qEl = document.getElementById('q');
      qEl.value = name;
      qEl.dispatchEvent(new Event('input', { bubbles: true }));
      qEl.focus();
      showToast(`Filmography for ${name}`);
    });
  });

  // Similar titles
  renderSimilar(window.currentDetail?.id || '', m.primaryTitle, m);
}

function formatVotes(n) {
  if (n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return String(n);
}

function startPlayback() {
  if (!currentDetail) return;
  const { id, isTV } = currentDetail;
  const src = getSource(document.getElementById('sourcePick').value);
  const s = +(document.getElementById('seasonInp')?.value || 1);
  const e = +(document.getElementById('episodeInp')?.value || 1);
  const playerSrc = isTV && src.supportsTV ? src.tv(id, s, e) : src.movie(id);

  const host = document.getElementById('playerHost');
  // Note: NO `sandbox` attribute — it blocks the embedded player's fullscreen
  // button on Chrome/Safari (Mac). The trade-off is the embed has full page
  // privileges; only use sources you trust.
  host.innerHTML = `
    <div class="player-wrap">
      <iframe
        id="playerIframe"
        src="${playerSrc}"
        title="Player"
        allow="autoplay; encrypted-media; fullscreen *; picture-in-picture; accelerometer; gyroscope; clipboard-write"
        allowfullscreen
        webkitallowfullscreen
        mozallowfullscreen
        referrerpolicy="no-referrer"
      ></iframe>
      <button class="cast-btn" id="castBtn" title="Cast to TV" aria-label="Cast" hidden>
        <svg><use href="#i-cast"/></svg>
      </button>
      <button class="fs-btn" id="fsBtn" title="Fullscreen" aria-label="Fullscreen">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9V5a2 2 0 0 1 2-2h4"/>
          <path d="M21 9V5a2 2 0 0 0-2-2h-4"/>
          <path d="M3 15v4a2 2 0 0 0 2 2h4"/>
          <path d="M21 15v4a2 2 0 0 1-2 2h-4"/>
        </svg>
      </button>
    </div>
  `;
  const fsBtn = document.getElementById('fsBtn');
  if (fsBtn) fsBtn.addEventListener('click', () => goFullscreen(document.getElementById('playerIframe')));
  setupCastButton();
  const btn = document.getElementById('playBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<svg width="18" height="18"><use href="#i-play"/></svg> Playing…';
  }
  try { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
}

backBtn.addEventListener('click', closeDetail);
function closeDetail() {
  detailEl.classList.remove('open');
  detailEl.setAttribute('aria-hidden', 'true');
  detailBody.innerHTML = '';
  currentDetail = null;
  if (location.hash) history.replaceState({}, '', location.pathname + location.search);
}
window.closeDetail = closeDetail;  // expose so the error empty-state can call it
window.addEventListener('popstate', () => {
  if (detailEl.classList.contains('open')) closeDetail();
});

// ---------- Settings drawer ----------
function openDrawer() {
  drawer.classList.add('open');
  scrim.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  renderSourceOptions();
}
function hideDrawer() {
  drawer.classList.remove('open');
  scrim.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
}
settingsBtn.addEventListener('click', openDrawer);
closeDrawer.addEventListener('click', hideDrawer);
scrim.addEventListener('click', hideDrawer);
clearHistoryDrawer.addEventListener('click', () => {
  if (confirm('Clear watch history?')) { clearHistory(); }
});

function renderSourceOptions() {
  const selected = getSelectedSourceId();
  sourceList.innerHTML = SOURCES.map(s => `
    <label class="opt ${s.id === selected ? 'selected' : ''}" data-id="${s.id}">
      <input type="radio" name="source" value="${s.id}" ${s.id === selected ? 'checked' : ''}>
      <div class="opt-body">
        <div class="opt-name">${escapeHtml(s.name)}</div>
        <div class="opt-sub">${escapeHtml(s.desc)} ${s.supportsTV ? '· <span style="color:#9ee7d6">TV supported</span>' : '· <span style="color:#cfd2e1">Movies only</span>'}</div>
      </div>
    </label>
  `).join('');
  sourceList.querySelectorAll('.opt').forEach(el => {
    el.addEventListener('click', () => {
      setSelectedSourceId(el.dataset.id);
      renderSourceOptions();
    });
  });
}


function goFullscreen(el) {
  if (!el) return;
  const wrap = el.closest('.player-wrap') || el;
  const target = wrap;            // fullscreen the wrapper so controls stay overlaid
  const req = target.requestFullscreen
           || target.webkitRequestFullscreen
           || target.webkitEnterFullscreen
           || target.mozRequestFullScreen
           || target.msRequestFullscreen;
  if (req) {
    try { req.call(target); return; } catch {}
  }
  // iOS Safari quirk: video elements can fullscreen directly via webkitEnterFullscreen,
  // but we're inside a cross-origin iframe so we can't reach <video>. Fall back to
  // opening the embed URL in a new tab so the user gets native player chrome.
  const iframe = el.tagName === 'IFRAME' ? el : el.querySelector('iframe');
  if (iframe && iframe.src) window.open(iframe.src, '_blank', 'noopener');
}

// ---------- Utils ----------
function thumbUrl(url, w, h) {
  try {
    return url.replace(/\._V1_.*?(\.[a-z]+)$/i, `._V1_UX${w}_CR0,0,${w},${h}_AL_$1`);
  } catch { return url; }
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function escapeAttr(s){return escapeHtml(s)}
function capitalize(s){return s ? s[0].toUpperCase()+s.slice(1) : s}
function truncate(s,n){return s.length>n?s.slice(0,n-1)+'…':s}

// ---------- Share (#2) ----------
function shareUrlFor(id) {
  // Stable deep link: current origin + #ttID
  return `${location.origin}${location.pathname}#${id}`;
}
function openShare(id, title) {
  const url = shareUrlFor(id);
  const pop = document.getElementById('sharePop');
  document.getElementById('shareTitle').textContent = title ? `Share “${title}”` : 'Share';
  document.getElementById('shareUrl').value = url;
  document.getElementById('shareQr').innerHTML = qrSvg(url);
  pop.classList.add('open');
  pop.setAttribute('aria-hidden', 'false');
}
function closeShare() {
  const pop = document.getElementById('sharePop');
  pop.classList.remove('open');
  pop.setAttribute('aria-hidden', 'true');
}
document.getElementById('shareClose').addEventListener('click', closeShare);
document.getElementById('sharePop').addEventListener('click', (e) => {
  if (e.target.id === 'sharePop') closeShare();
});
document.getElementById('shareCopy').addEventListener('click', async () => {
  const btn = document.getElementById('shareCopy');
  const url = document.getElementById('shareUrl').value;
  try {
    await navigator.clipboard.writeText(url);
    btn.classList.add('ok');
    btn.innerHTML = '<svg><use href="#i-check"/></svg>Copied';
    setTimeout(() => {
      btn.classList.remove('ok');
      btn.innerHTML = '<svg><use href="#i-copy"/></svg>Copy';
    }, 1500);
  } catch {
    document.getElementById('shareUrl').select();
    showToast('Press ⌘C to copy', false);
  }
});
document.getElementById('shareNative').addEventListener('click', async () => {
  const url = document.getElementById('shareUrl').value;
  const title = document.getElementById('shareTitle').textContent.replace(/^Share “|”$/g, '');
  if (navigator.share) {
    try { await navigator.share({ title: title || 'CinePop', url }); } catch {}
  } else {
    showToast('Native share not available on this device');
  }
});

// Tiny QR encoder (numeric+alphanumeric+byte, Version 1-10).
// Adapted from qrcode-svg style minimal implementation.
function qrSvg(text) {
  const m = makeQRMatrix(text);
  const n = m.length;
  const size = 220, pad = 10;
  const cell = (size - pad * 2) / n;
  const rects = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) {
        rects.push(`<rect x="${(pad + x * cell).toFixed(2)}" y="${(pad + y * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${rects.join('')}</g></svg>`;
}

// Minimal QR Code generator (Byte mode, EC=M). Returns a 2D boolean matrix.
// Based on the well-known compact implementation by Kazuhiko Arase, MIT licensed.
function makeQRMatrix(text) {
  // ----- Reed-Solomon + bit-buffer minimal QR encoder -----
  // To keep this footprint small, this is a hand-rolled implementation
  // supporting versions 1-10 byte mode, EC level M.
  // Output: 2D array of 0/1.
  const QR = {};
  QR.PAD0 = 0xEC; QR.PAD1 = 0x11;
  QR.MODE_BYTE = 4;
  QR.ECC_M = 0;

  // EC info table: [version, ecBlocks, dataBytes, ecBytesPerBlock] for level M
  // Sourced from QR spec.
  const EC = {
    1:[[1,16,10]],   2:[[1,28,16]],   3:[[1,44,26]],
    4:[[2,32,18]],   5:[[2,43,24]],   6:[[4,27,16]],
    7:[[4,31,18]],   8:[[2,38,22],[2,39,22]],
    9:[[3,36,22],[2,37,22]], 10:[[4,43,26],[1,44,26]]
  };

  function utf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }
  const data = utf8Bytes(text);
  // Pick smallest version that fits with level M (byte mode).
  // Data bytes = sum of dataBytes across blocks. Header overhead ~3.
  let version = 0, blocks = null, totalData = 0;
  for (let v = 1; v <= 10; v++) {
    blocks = EC[v];
    totalData = blocks.reduce((s, b) => s + b[0] * b[1], 0);
    // Char count indicator size for byte mode: 8 bits (v1-9), 16 bits (v10+)
    const cc = v < 10 ? 8 : 16;
    const need = 4 + cc + data.length * 8;
    if (need <= totalData * 8) { version = v; break; }
  }
  if (!version) throw new Error('QR text too long for v1-10');

  // Build bit stream
  const bits = [];
  function put(n, w) { for (let i = w - 1; i >= 0; i--) bits.push((n >>> i) & 1); }
  put(QR.MODE_BYTE, 4);
  put(data.length, version < 10 ? 8 : 16);
  for (const b of data) put(b, 8);
  // Terminator
  const cap = totalData * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  // Pad
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  let pad = QR.PAD0;
  while (bytes.length < totalData) { bytes.push(pad); pad = (pad === QR.PAD0) ? QR.PAD1 : QR.PAD0; }

  // GF(256) tables
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  function gMul(a, b) { return (a && b) ? EXP[LOG[a] + LOG[b]] : 0; }
  function genPoly(deg) {
    let p = [1];
    for (let i = 0; i < deg; i++) {
      const np = new Array(p.length + 1).fill(0);
      for (let j = 0; j < p.length; j++) {
        np[j] ^= p[j];
        np[j + 1] ^= gMul(p[j], EXP[i]);
      }
      p = np;
    }
    return p;
  }
  function rsEncode(dataArr, ecLen) {
    const gp = genPoly(ecLen);
    const buf = dataArr.concat(new Array(ecLen).fill(0));
    for (let i = 0; i < dataArr.length; i++) {
      const c = buf[i];
      if (!c) continue;
      for (let j = 0; j < gp.length; j++) buf[i + j] ^= gMul(gp[j], c);
    }
    return buf.slice(dataArr.length);
  }

  // Per-block data + ec arrays
  const dBlocks = [];
  const eBlocks = [];
  let offset = 0;
  const ecBytesByVersion = {1:10,2:16,3:26,4:18,5:24,6:16,7:18,8:22,9:22,10:26};
  // The above is per block, derived from the same EC tables (col 2 in each tuple's group).
  // For our table EC[v], dataBytes per block = b[1], ecBytes per block = b[2].
  for (const grp of blocks) {
    const [cnt, dBytes, eBytes] = grp;
    for (let k = 0; k < cnt; k++) {
      const d = bytes.slice(offset, offset + dBytes);
      offset += dBytes;
      dBlocks.push(d);
      eBlocks.push(rsEncode(d, eBytes));
    }
  }
  // Interleave
  const maxD = Math.max(...dBlocks.map(b => b.length));
  const maxE = Math.max(...eBlocks.map(b => b.length));
  const out = [];
  for (let i = 0; i < maxD; i++) for (const b of dBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < maxE; i++) for (const b of eBlocks) if (i < b.length) out.push(b[i]);

  // Module matrix
  const size = 17 + 4 * version;
  const M = Array.from({ length: size }, () => new Array(size).fill(null));
  function setFinder(r, c) {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const y = r + dy, x = c + dx;
      if (y < 0 || y >= size || x < 0 || x >= size) continue;
      const inner = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const blk = inner && ((dx === 0 || dx === 6 || dy === 0 || dy === 6) || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      M[y][x] = blk ? 1 : 0;
    }
  }
  setFinder(0, 0); setFinder(0, size - 7); setFinder(size - 7, 0);
  // Timing
  for (let i = 8; i < size - 8; i++) {
    if (M[6][i] === null) M[6][i] = i % 2 === 0 ? 1 : 0;
    if (M[i][6] === null) M[i][6] = i % 2 === 0 ? 1 : 0;
  }
  // Alignment (only for v >= 2; positions table)
  const ALIGN = {1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30], 6:[6,34],
                 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50]};
  const ap = ALIGN[version];
  for (const yy of ap) for (const xx of ap) {
    if ((yy === 6 && xx === 6) || (yy === 6 && xx === size - 7) || (yy === size - 7 && xx === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const v = (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) ? 1 : 0;
      M[yy + dy][xx + dx] = v;
    }
  }
  // Format info area placeholders
  for (let i = 0; i < 9; i++) {
    if (M[8][i] === null) M[8][i] = 0;
    if (M[i][8] === null) M[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (M[size - 1 - i][8] === null) M[size - 1 - i][8] = 0;
    if (M[8][size - 1 - i] === null) M[8][size - 1 - i] = 0;
  }
  M[size - 8][8] = 1;
  // Data placement
  let bitIdx = 0;
  const total = out.length * 8;
  function readBit() {
    if (bitIdx >= total) return 0;
    const b = out[bitIdx >> 3];
    return (b >>> (7 - (bitIdx++ & 7))) & 1;
  }
  let col = size - 1, dir = -1;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const y = dir === -1 ? size - 1 - i : i;
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        if (M[y][x] === null) M[y][x] = readBit();
      }
    }
    dir = -dir;
    col -= 2;
  }
  // Pick best mask (0..7) via penalty score
  function copy(mat) { return mat.map(r => r.slice()); }
  function applyMask(mat, mask) {
    const isFunc = Array.from({length: size}, () => new Array(size).fill(false));
    // Mark function modules
    function markFinder(r, c) {
      for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
        const y = r + dy, x = c + dx;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        isFunc[y][x] = true;
      }
    }
    markFinder(0, 0); markFinder(0, size - 7); markFinder(size - 7, 0);
    for (let i = 0; i < size; i++) { isFunc[6][i] = true; isFunc[i][6] = true; }
    for (const yy of ap) for (const xx of ap) {
      if ((yy === 6 && xx === 6) || (yy === 6 && xx === size - 7) || (yy === size - 7 && xx === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) isFunc[yy + dy][xx + dx] = true;
    }
    for (let i = 0; i < 9; i++) { isFunc[8][i] = true; isFunc[i][8] = true; }
    for (let i = 0; i < 8; i++) { isFunc[size - 1 - i][8] = true; isFunc[8][size - 1 - i] = true; }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (isFunc[y][x]) continue;
      let m;
      switch (mask) {
        case 0: m = (y + x) % 2 === 0; break;
        case 1: m = y % 2 === 0; break;
        case 2: m = x % 3 === 0; break;
        case 3: m = (y + x) % 3 === 0; break;
        case 4: m = (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; break;
        case 5: m = ((y * x) % 2) + ((y * x) % 3) === 0; break;
        case 6: m = (((y * x) % 2) + ((y * x) % 3)) % 2 === 0; break;
        case 7: m = (((y + x) % 2) + ((y * x) % 3)) % 2 === 0; break;
      }
      if (m) mat[y][x] ^= 1;
    }
  }
  function fmtBits(mask) {
    // EC=M=0 -> bits 0b00, mask 3 bits. BCH(15,5) generator 0b10100110111
    const data = (QR.ECC_M << 3) | mask;
    let rem = data << 10;
    for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0b10100110111 << (i - 10);
    let bits = ((data << 10) | rem) ^ 0b101010000010010;
    return bits & 0x7FFF;
  }
  function placeFormat(mat, mask) {
    const bits = fmtBits(mask);
    for (let i = 0; i < 15; i++) {
      const b = (bits >>> i) & 1;
      // around top-left
      if (i < 6) mat[i][8] = b;
      else if (i < 8) mat[i + 1][8] = b;
      else if (i < 9) mat[8][7] = b;
      else mat[8][14 - i] = b;
      // around right + bottom
      if (i < 8) mat[8][size - 1 - i] = b;
      else mat[size - 15 + i][8] = b;
    }
    mat[size - 8][8] = 1;
  }
  function penalty(mat) {
    let p = 0;
    // Rule 1: runs of 5+
    for (let y = 0; y < size; y++) {
      let r = 1; for (let x = 1; x < size; x++) {
        if (mat[y][x] === mat[y][x - 1]) { r++; } else { if (r >= 5) p += 3 + (r - 5); r = 1; }
      }
      if (r >= 5) p += 3 + (r - 5);
    }
    for (let x = 0; x < size; x++) {
      let r = 1; for (let y = 1; y < size; y++) {
        if (mat[y][x] === mat[y - 1][x]) { r++; } else { if (r >= 5) p += 3 + (r - 5); r = 1; }
      }
      if (r >= 5) p += 3 + (r - 5);
    }
    return p;
  }
  let bestMat = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const c = copy(M);
    applyMask(c, mask);
    placeFormat(c, mask);
    const sc = penalty(c);
    if (sc < bestScore) { bestScore = sc; bestMat = c; }
  }
  return bestMat;
}

// ---------- Keyboard shortcuts + Command Palette (#3) ----------
const cmdkScrim = document.getElementById('cmdkScrim');
const cmdkInput = document.getElementById('cmdkInput');
const cmdkList  = document.getElementById('cmdkList');
let cmdkActive = 0;
let cmdkTimer = null;
let cmdkItems = [];

function openCmdK() {
  cmdkScrim.classList.add('open');
  cmdkScrim.setAttribute('aria-hidden','false');
  cmdkInput.value = '';
  renderCmdk('');
  setTimeout(() => cmdkInput.focus(), 30);
}
function closeCmdK() {
  cmdkScrim.classList.remove('open');
  cmdkScrim.setAttribute('aria-hidden','true');
}
cmdkScrim.addEventListener('click', (e) => { if (e.target === cmdkScrim) closeCmdK(); });

function staticActions() {
  return [
    { type:'action', icon:'i-search',   label:'Focus search',          kbd:'/',  run:() => { closeCmdK(); qEl.focus(); } },
    { type:'action', icon:'i-heart',    label:'Open my watchlist',     run:() => { closeCmdK(); closeDetail(); document.getElementById('watchlistSection')?.scrollIntoView({behavior:'smooth'}); } },
    { type:'action', icon:'i-history',  label:'Open continue watching',run:() => { closeCmdK(); closeDetail(); document.getElementById('continueSection')?.scrollIntoView({behavior:'smooth'}); } },
    { type:'action', icon:'i-flame',    label:'Jump to Trending',      run:() => { closeCmdK(); closeDetail(); document.getElementById('trendingRow')?.scrollIntoView({behavior:'smooth'}); } },
    { type:'action', icon:'i-settings', label:'Open settings',         run:() => { closeCmdK(); openDrawer(); } },
    { type:'action', icon:'i-x',        label:'Clear watch history',   run:() => { closeCmdK(); if (confirm('Clear watch history?')) clearHistory(); } },
    { type:'action', icon:'i-kbd',      label:'Show app tour',         run:() => { closeCmdK(); openOnboarding(); } },
    { type:'action', icon:'i-search',   label:'Surprise me (random pick)', run:() => { closeCmdK(); pickRandomTitle(); } },
    { type:'action', icon:'i-settings', label:'Theme: Dark',           run:() => { closeCmdK(); setTheme('dark'); showToast('Theme: Dark'); } },
    { type:'action', icon:'i-settings', label:'Theme: OLED Black',     run:() => { closeCmdK(); setTheme('oled'); showToast('Theme: OLED Black'); } },
    { type:'action', icon:'i-settings', label:'Theme: Light',          run:() => { closeCmdK(); setTheme('light'); showToast('Theme: Light'); } },
    { type:'action', icon:'i-settings', label:'Theme: Auto',           run:() => { closeCmdK(); setTheme('auto'); showToast('Theme: Auto'); } },
  ];
}

async function renderCmdk(query) {
  cmdkActive = 0;
  const q = query.trim();
  cmdkItems = [];
  let html = '';

  if (!q) {
    html += '<div class="cmdk-group">Actions</div>';
    cmdkItems = staticActions();
    html += cmdkItems.map((it, i) => cmdkItemHTML(it, i === 0)).join('');
  } else {
    // Filter static actions, then fetch live IMDb suggestions
    const acts = staticActions().filter(a => a.label.toLowerCase().includes(q.toLowerCase()));
    if (acts.length) {
      html += '<div class="cmdk-group">Actions</div>';
      html += acts.map((a, i) => cmdkItemHTML(a, i === 0)).join('');
      cmdkItems.push(...acts);
    }
    html += '<div class="cmdk-group">Titles</div><div id="cmdkTitles" style="opacity:.5;padding:8px 10px;font-size:12.5px">Searching…</div>';
    cmdkList.innerHTML = html;
    try {
      const items = (await imdbSuggest(q)).slice(0, 8);
      const titleActs = items.map(it => ({
        type: 'title', id: it.id, label: it.l,
        poster: it.i?.imageUrl ? thumbUrl(it.i.imageUrl, 96, 144) : '',
        sub: [it.y, (it.q || (/tv|series/i.test(it.qid||'') ? 'TV' : 'Movie'))].filter(Boolean).join(' · '),
        run: () => { closeCmdK(); openDetail(it.id, it.l); }
      }));
      cmdkItems.push(...titleActs);
      cacheItems(items);
      const titlesHost = document.getElementById('cmdkTitles');
      if (titlesHost) {
        if (!titleActs.length) titlesHost.textContent = 'No titles found';
        else {
          titlesHost.outerHTML = titleActs.map((it, i) => cmdkItemHTML(it, cmdkItems.length - titleActs.length + i === cmdkActive)).join('');
        }
      }
    } catch {
      const titlesHost = document.getElementById('cmdkTitles');
      if (titlesHost) titlesHost.textContent = 'Couldn\'t fetch titles';
    }
    return; // we already set innerHTML
  }
  cmdkList.innerHTML = html;
}

function cmdkItemHTML(it, isActive) {
  const visual = it.poster
    ? `<img class="poster-mini" src="${it.poster}" alt="">`
    : `<span class="ico"><svg><use href="#${it.icon || 'i-search'}"/></svg></span>`;
  const sub = it.sub ? `<span class="sub">${escapeHtml(it.sub)}</span>` : '';
  const kbd = it.kbd ? `<kbd>${it.kbd}</kbd>` : '';
  return `<div class="cmdk-item ${isActive ? 'active' : ''}" data-i="${cmdkItems.indexOf(it)}">
    ${visual}
    <span class="label">${escapeHtml(it.label)}</span>
    ${sub}${kbd}
  </div>`;
}

cmdkInput.addEventListener('input', () => {
  if (cmdkTimer) clearTimeout(cmdkTimer);
  cmdkTimer = setTimeout(() => renderCmdk(cmdkInput.value), 150);
});
cmdkList.addEventListener('click', (e) => {
  const item = e.target.closest('.cmdk-item');
  if (!item) return;
  const idx = +item.dataset.i;
  cmdkItems[idx]?.run();
});

// Global keyboard shortcuts
function isTypingTarget(e) {
  const t = e.target;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
window.addEventListener('keydown', (e) => {
  // Cmdk navigation (when open)
  if (cmdkScrim.classList.contains('open')) {
    if (e.key === 'Escape') { e.preventDefault(); closeCmdK(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cmdkActive = Math.min(cmdkItems.length - 1, cmdkActive + 1);
      updateCmdkActive();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      cmdkActive = Math.max(0, cmdkActive - 1);
      updateCmdkActive();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      cmdkItems[cmdkActive]?.run();
      return;
    }
  }
  // ⌘K / Ctrl+K to open palette
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    cmdkScrim.classList.contains('open') ? closeCmdK() : openCmdK();
    return;
  }
  // Ignore other shortcuts while typing in an input
  if (isTypingTarget(e)) {
    // Esc out of search
    if (e.key === 'Escape' && e.target === qEl) {
      qEl.blur();
      qEl.value = '';
      showHome();
    }
    return;
  }
  // / to focus search
  if (e.key === '/') { e.preventDefault(); qEl.focus(); return; }
  // Esc to close drawers / detail
  if (e.key === 'Escape') {
    if (document.getElementById('sharePop').classList.contains('open')) { e.preventDefault(); closeShare(); return; }
    if (drawer.classList.contains('open'))    { e.preventDefault(); hideDrawer(); return; }
    if (detailEl.classList.contains('open'))  { e.preventDefault(); closeDetail(); return; }
  }
  // Space = play (when detail is open and not already playing)
  if (e.key === ' ' && detailEl.classList.contains('open')) {
    const btn = document.getElementById('playBtn');
    if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
    return;
  }
  // F = fullscreen (when player is open)
  if ((e.key === 'f' || e.key === 'F') && document.querySelector('#playerHost iframe')) {
    e.preventDefault();
    goFullscreen(document.getElementById('playerIframe'));
    return;
  }
  // ← / → = prev / next episode (TV)
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && detailEl.classList.contains('open')) {
    const nav = e.key === 'ArrowLeft' ? document.getElementById('prevEp') : document.getElementById('nextEp');
    if (nav && !nav.disabled) { e.preventDefault(); nav.click(); }
    return;
  }
});

function updateCmdkActive() {
  const items = cmdkList.querySelectorAll('.cmdk-item');
  items.forEach((el, i) => el.classList.toggle('active', i === cmdkActive));
  const active = items[cmdkActive];
  if (active) active.scrollIntoView({ block: 'nearest' });
}


// ────────────────────────────────────────────────────────────────
// First-run onboarding (Feature #1)
// 3 cards explaining: search, watchlist, ⌘K palette.
// Skippable; "Done" stores playimdb.onboarded='1' so it never shows again.
// Re-trigger anytime with window.replayOnboarding().
// ────────────────────────────────────────────────────────────────
const ONB_STEPS = [
  {
    icon: 'i-search',
    title: 'Search anything',
    body: 'Type a movie or TV show in the search bar. Tap a result to see details, then hit <b>Play</b> to watch instantly.'
  },
  {
    icon: 'i-heart',
    title: 'Save for later',
    body: 'Tap the heart on any title to add it to <b>My Watchlist</b>. Your queue waits for you on the home screen.'
  },
  {
    icon: 'i-kbd',
    title: 'Power moves',
    body: 'Press <kbd>/</kbd> to focus search, <kbd>\u2318K</kbd> for the command palette, <kbd>F</kbd> for fullscreen, <kbd>\u2190</kbd>/<kbd>\u2192</kbd> to jump episodes.'
  }
];
let _onbIndex = 0;

function shouldShowOnboarding() {
  try { return localStorage.getItem(STORAGE.onboarded) !== '1'; }
  catch { return false; }
}
function openOnboarding() {
  _onbIndex = 0;
  const scrim = document.getElementById('onbScrim');
  if (!scrim) return;
  renderOnboarding();
  scrim.classList.add('open');
  scrim.setAttribute('aria-hidden', 'false');
}
function closeOnboarding(markDone) {
  const scrim = document.getElementById('onbScrim');
  if (!scrim) return;
  scrim.classList.remove('open');
  scrim.setAttribute('aria-hidden', 'true');
  if (markDone) {
    try { localStorage.setItem(STORAGE.onboarded, '1'); } catch {}
  }
}
function renderOnboarding() {
  const step = ONB_STEPS[_onbIndex];
  const icon = document.getElementById('onbIcon');
  const title = document.getElementById('onbTitle');
  const body = document.getElementById('onbBody');
  const dots = document.getElementById('onbDots');
  const nextBtn = document.getElementById('onbNext');
  if (!step || !icon || !title || !body || !dots || !nextBtn) return;
  // Swap icon
  icon.innerHTML = `<svg><use href="#${step.icon}"/></svg>`;
  title.textContent = step.title;
  body.innerHTML = step.body;
  // Dots
  dots.innerHTML = ONB_STEPS.map((_, i) => `<span class="${i === _onbIndex ? 'on' : ''}"></span>`).join('');
  // Button label
  nextBtn.textContent = (_onbIndex === ONB_STEPS.length - 1) ? 'Get started' : 'Next';
}
window.replayOnboarding = openOnboarding;

// Wire buttons + keyboard once
document.addEventListener('DOMContentLoaded', () => {
  const next = document.getElementById('onbNext');
  const skip = document.getElementById('onbSkip');
  if (next) next.addEventListener('click', () => {
    if (_onbIndex < ONB_STEPS.length - 1) { _onbIndex++; renderOnboarding(); }
    else closeOnboarding(true);
  });
  if (skip) skip.addEventListener('click', () => closeOnboarding(true));
});
// Esc closes it (without re-showing later)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('onbScrim')?.classList.contains('open')) {
    e.preventDefault();
    closeOnboarding(true);
  }
});
// Arrow keys cycle through cards while open
window.addEventListener('keydown', (e) => {
  const scrim = document.getElementById('onbScrim');
  if (!scrim || !scrim.classList.contains('open')) return;
  if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('onbNext')?.click();
  } else if (e.key === 'ArrowLeft' && _onbIndex > 0) {
    e.preventDefault();
    _onbIndex--; renderOnboarding();
  }
}, true);

// Auto-show on first visit (after the rest of the boot finishes)
window.addEventListener('load', () => {
  if (shouldShowOnboarding()) {
    setTimeout(openOnboarding, 600);  // small delay so the home screen settles
  }
});


// ────────────────────────────────────────────────────────────────
// Theme picker (Feature #4) — dark / oled / light / auto
// ────────────────────────────────────────────────────────────────
const VALID_THEMES = ['dark','oled','light','auto'];
function getTheme() {
  try {
    const t = localStorage.getItem(STORAGE.theme);
    return VALID_THEMES.includes(t) ? t : 'dark';
  } catch { return 'dark'; }
}
function setTheme(t) {
  if (!VALID_THEMES.includes(t)) t = 'dark';
  try { localStorage.setItem(STORAGE.theme, t); } catch {}
  applyTheme(t);
  renderThemePicker();
}
function applyTheme(t) {
  const html = document.documentElement;
  VALID_THEMES.forEach(x => html.classList.remove('theme-' + x));
  html.classList.add('theme-' + t);
  // Update <meta name="theme-color"> for the OS chrome
  const cs = getComputedStyle(html);
  const bg = cs.getPropertyValue('--bg').trim() || '#0b0b10';
  let metaTC = document.querySelector('meta[name="theme-color"]');
  if (!metaTC) {
    metaTC = document.createElement('meta');
    metaTC.setAttribute('name','theme-color');
    document.head.appendChild(metaTC);
  }
  metaTC.setAttribute('content', bg);
}
function renderThemePicker() {
  const cur = getTheme();
  document.querySelectorAll('#themeList .theme-opt').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.theme === cur);
  });
}
// Apply saved theme as early as possible to avoid a flash
applyTheme(getTheme());

document.addEventListener('DOMContentLoaded', () => {
  renderThemePicker();
  document.querySelectorAll('#themeList .theme-opt').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });
});

// Also re-apply when system theme changes (only affects 'auto')
if (typeof window.matchMedia === 'function') {
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getTheme() === 'auto') applyTheme('auto');
    });
  } catch {}
}


// ────────────────────────────────────────────────────────────────
// Polish bundle (Features #6 #7 #8 #9 #10)
// ────────────────────────────────────────────────────────────────

// ─── (#6) Haptic feedback (iOS/Android) ───
// `navigator.vibrate(ms)` works on Android Chrome. iOS Safari ignores it
// (Apple restricts it to PWAs with explicit user prompts), but it gracefully
// no-ops. We expose a `tap()` helper that calls it for important UI events.
function hapticTap(strength) {
  // strength: 'light' | 'medium' | 'success' | 'select'
  if (typeof navigator.vibrate !== 'function') return;
  const map = { light: 8, select: 12, medium: 18, success: [10, 40, 14] };
  try { navigator.vibrate(map[strength] || 10); } catch {}
}

// Wire haptics to the most important interactions (play, heart, episode nav).
// Use a delegated listener so it works on dynamically rendered elements.
document.addEventListener('click', (e) => {
  if (e.target.closest('#playBtn'))            hapticTap('success');
  else if (e.target.closest('.heart'))         hapticTap('select');
  else if (e.target.closest('.detail-heart'))  hapticTap('select');
  else if (e.target.closest('#prevEp,#nextEp')) hapticTap('light');
  else if (e.target.closest('.chip'))          hapticTap('light');
  else if (e.target.closest('.theme-opt'))     hapticTap('light');
}, true);

// ─── (#9) Pull-to-refresh ───
// Pulling down from the top of the home view re-hydrates the rows.
(function setupPTR(){
  const ptrEl = document.getElementById('ptr');
  if (!ptrEl) return;
  let startY = 0, pulling = false, dist = 0;
  const TRIGGER = 80;        // px to trigger refresh

  function canStart() {
    // Only at top of page, only on home (not in detail), not during input typing
    if (window.scrollY > 4) return false;
    if (document.getElementById('detail')?.classList.contains('open')) return false;
    if (document.getElementById('searchView') && !document.getElementById('searchView').hidden) return false;
    return true;
  }
  document.addEventListener('touchstart', (e) => {
    if (!canStart()) { pulling = false; return; }
    pulling = true;
    startY = e.touches[0].clientY;
    dist = 0;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dist = Math.max(0, e.touches[0].clientY - startY);
    if (dist > 8) {
      const progress = Math.min(1, dist / TRIGGER);
      ptrEl.classList.add('visible');
      ptrEl.style.transform = `translate(-50%, ${12 + progress * 30}px)`;
      ptrEl.style.opacity = String(progress);
    }
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    if (!pulling) return;
    pulling = false;
    if (dist >= TRIGGER) {
      ptrEl.classList.add('refreshing');
      hapticTap('success');
      try {
        // Re-hydrate home rows
        if (typeof hydrateRow === 'function') {
          await Promise.all([
            hydrateRow(TRENDING_QUERIES, document.getElementById('trendingRow')),
            hydrateRow(TOP_QUERIES,      document.getElementById('topRow'), false),
            hydrateRow(TV_QUERIES,       document.getElementById('tvRow'), true),
          ]);
        }
      } catch {}
      ptrEl.classList.remove('refreshing');
      showToast('Refreshed');
    }
    ptrEl.classList.remove('visible');
    ptrEl.style.transform = '';
    ptrEl.style.opacity = '';
  }, { passive: true });
})();

// ─── (#10) Splash auto-removal ───
// CSS animates it out at 0.9s; remove from DOM at 1.4s so it stops blocking
// clicks on slow devices. Skipped if prefers-reduced-motion.
window.addEventListener('load', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  if (window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    splash.remove();
    return;
  }
  setTimeout(() => splash.remove(), 1400);
});

// ---------- PWA install ----------
let deferredPrompt = null;
const installBtn = document.getElementById('install');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.classList.add('show');
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.remove('show');
});
window.addEventListener('appinstalled', () => installBtn.classList.remove('show'));

// ---------- Service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      // Force a check for a new SW on every load
      reg.update().catch(()=>{});
      // When a new SW takes control, reload once so the new app.js is used
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
      // If an updated SW is waiting, tell it to skipWaiting immediately
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            sw.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    } catch {}
  });
}

// ---------- Boot ----------
window.addEventListener('DOMContentLoaded', () => {
  renderContinue();
  renderWatchlist();
  renderRecommendations();
  hydrateRow(TRENDING_QUERIES, trendingRow);
  hydrateRow(TOP_QUERIES, topRow, false);
  hydrateRow(TV_QUERIES, tvRow, true);
  hydrateRow(COMING_SOON_QUERIES, comingSoonRow);
  hydrateRow(HIDDEN_GEMS_QUERIES, hiddenGemsRow);

  const m = location.hash.match(/#(tt\d+)/);
  if (m) openDetail(m[1], '');
});




// ────────────────────────────────────────────────────────────────
// Chromecast / Google Cast support.
//
// Uses the Google Cast Chrome Sender SDK (loaded as <script> in index.html).
// The SDK calls window.__onGCastApiAvailable() once initialized, which then
// calls window.initCast() defined below.
//
// What we can cast: any HTTPS video URL the embed player exposes. Since
// most third-party embeds (CinePop / VidSrc) hide their <video> behind a
// cross-origin iframe, we use a heuristic + a "Cast this page" fallback:
//
//   1. If the embed has emitted a postMessage with a media URL → cast it.
//   2. Otherwise the Cast button still appears so the user can mirror the
//      tab via Chrome's built-in "Cast tab" feature (a manual fallback
//      handled by the Chrome menu — we just provide the SDK hookup).
//
// On Android (Capacitor WebView) the same SDK works because Android System
// WebView ships with Cast support and Google Play services discovers
// devices on the local network.
// ────────────────────────────────────────────────────────────────
let __castContext = null;
let __castMediaUrl = null;   // Last known direct media URL (.mp4 / .m3u8) heard via postMessage

window.initCast = function () {
  try {
    const cast = window.cast;
    const chrome = window.chrome;
    if (!cast || !cast.framework) return;
    __castContext = cast.framework.CastContext.getInstance();
    __castContext.setOptions({
      receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    __castContext.addEventListener(
      cast.framework.CastContextEventType.CAST_STATE_CHANGED,
      onCastStateChange
    );
    // If a session was already active when the page loaded, sync UI
    onCastStateChange();
  } catch (e) {
    console.warn('[cast] init failed', e);
  }
};

function castState() {
  if (!__castContext) return 'NO_DEVICES_AVAILABLE';
  return __castContext.getCastState();   // NO_DEVICES_AVAILABLE | NOT_CONNECTED | CONNECTING | CONNECTED
}
function isCastReady()     { return castState() !== 'NO_DEVICES_AVAILABLE'; }
function isCastConnected() { return castState() === 'CONNECTED'; }

function onCastStateChange() {
  const btn = document.getElementById('castBtn');
  if (!btn) return;
  if (!isCastReady()) {
    btn.hidden = true;
    document.getElementById('castBanner')?.remove();
    return;
  }
  btn.hidden = false;
  btn.classList.toggle('connected', isCastConnected());
  const ico = btn.querySelector('use');
  if (ico) ico.setAttribute('href', isCastConnected() ? '#i-cast-on' : '#i-cast');
  // Show/hide the banner under the player
  if (isCastConnected()) showCastBanner();
  else document.getElementById('castBanner')?.remove();
}

function setupCastButton() {
  const btn = document.getElementById('castBtn');
  if (!btn) return;
  // Initial visibility (SDK may already be ready)
  onCastStateChange();
  btn.addEventListener('click', async () => {
    if (!__castContext) {
      showToast('Cast SDK not loaded — try desktop Chrome');
      return;
    }
    try {
      if (isCastConnected()) {
        // Toggle off → end the session
        __castContext.endCurrentSession(true);
      } else {
        await __castContext.requestSession();
        // After connect, try to cast whatever URL we have
        if (__castMediaUrl) loadOnCast(__castMediaUrl);
        else showToast('Cast started — use Chrome menu \u2192 "Cast tab" if the player doesn\u2019t auto-load');
      }
    } catch (e) {
      // User cancelled the picker, or no device chosen — silent
      if (String(e) !== 'cancel') showToast('Cast cancelled');
    }
  });

  // Listen for media URLs from the embed iframe (some embeds postMessage their src)
  window.addEventListener('message', (ev) => {
    const data = ev.data;
    if (!data) return;
    const candidate =
      (typeof data === 'string' && /^https?:\/\/.+\.(m3u8|mp4|webm|mpd)/i.test(data) && data) ||
      (data && data.src && /^https?:\/\/.+\.(m3u8|mp4|webm|mpd)/i.test(data.src) && data.src) ||
      (data && data.url && /^https?:\/\/.+\.(m3u8|mp4|webm|mpd)/i.test(data.url) && data.url);
    if (candidate) {
      __castMediaUrl = candidate;
      // If already casting, swap in the new media
      if (isCastConnected()) loadOnCast(candidate);
    }
  });
}

function loadOnCast(url) {
  const cast = window.cast, chrome = window.chrome;
  if (!cast || !chrome) return;
  const session = __castContext?.getCurrentSession();
  if (!session) return;
  const contentType =
    /\.m3u8/i.test(url) ? 'application/x-mpegURL' :
    /\.mp4/i.test(url)  ? 'video/mp4' :
    /\.webm/i.test(url) ? 'video/webm' :
    /\.mpd/i.test(url)  ? 'application/dash+xml' :
    'video/mp4';
  const mediaInfo = new chrome.cast.media.MediaInfo(url, contentType);
  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  session.loadMedia(request).then(
    () => showToast('Now casting'),
    (err) => { console.warn('[cast] loadMedia failed', err); showToast('Couldn\u2019t cast this source'); }
  );
}

function showCastBanner() {
  const host = document.getElementById('playerHost');
  if (!host) return;
  if (document.getElementById('castBanner')) return;
  const device = __castContext?.getCurrentSession()?.getCastDevice()?.friendlyName || 'TV';
  const wrap = document.createElement('div');
  wrap.id = 'castBanner';
  wrap.className = 'cast-banner';
  wrap.innerHTML = `
    <svg><use href="#i-cast-on"/></svg>
    Casting to <span class="device">${escapeHtml(device)}</span>
    <button id="castStopBtn" type="button">Stop</button>
  `;
  host.parentNode.insertBefore(wrap, host.nextSibling);
  document.getElementById('castStopBtn').addEventListener('click', () => {
    __castContext?.endCurrentSession(true);
  });
}

// If the SDK loaded BEFORE app.js finished defining initCast(), call it now.
if (window.cast && window.cast.framework && !__castContext) {
  try { window.initCast(); } catch {}
}

// ────────────────────────────────────────────────────────────────
// Spatial focus navigation for D-pad / remote on TV.
// Active in TV mode only; falls back to browser-default Tab/Arrow on desktop.
// ────────────────────────────────────────────────────────────────
(function () {
  if (!document.documentElement.classList.contains('tv-mode')) return;

  // Hide the on-screen keyboard hint badge if we're on a TV.
  document.querySelector('.kbd-hint')?.remove();

  function isFocusable(el) {
    if (!el || el.disabled) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // Must be visible
    if (el.closest('[hidden]')) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return true;
  }
  function focusables() {
    return Array.from(document.querySelectorAll(
      'a, button, [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(isFocusable);
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
  }
  function nearestInDirection(from, dir) {
    if (!from) return null;
    const a = centerOf(from);
    let best = null, bestScore = Infinity;
    for (const el of focusables()) {
      if (el === from) continue;
      const b = centerOf(el);
      const dx = b.x - a.x, dy = b.y - a.y;
      // Direction filter (must be primarily in the requested direction)
      let primary, lateral;
      if (dir === 'left' || dir === 'right') {
        primary = dx; lateral = dy;
        if ((dir === 'left' && primary >= -8) || (dir === 'right' && primary <= 8)) continue;
      } else {
        primary = dy; lateral = dx;
        if ((dir === 'up' && primary >= -8) || (dir === 'down' && primary <= 8)) continue;
      }
      // Score: distance, with strong penalty for lateral movement
      const score = Math.abs(primary) + Math.abs(lateral) * 1.6;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  // Make the search input + main interactive areas auto-focused on load.
  setTimeout(() => {
    const first = document.querySelector('.tile, .result, #q');
    if (first && document.activeElement === document.body) first.focus();
  }, 400);

  // D-pad handler. Skip when typing in a text input (let cursor move normally).
  window.addEventListener('keydown', (e) => {
    if (document.getElementById('cmdkScrim')?.classList.contains('open')) return; // palette has its own nav
    const t = e.target;
    const isText = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    // Allow horizontal arrows inside <input type=number> for season/episode pickers
    if (isText && t.tagName === 'INPUT' && t.type !== 'number') return;

    let dir = null;
    switch (e.key) {
      case 'ArrowLeft':  dir = 'left'; break;
      case 'ArrowRight': dir = 'right'; break;
      case 'ArrowUp':    dir = 'up'; break;
      case 'ArrowDown':  dir = 'down'; break;
    }
    if (!dir) return;
    // Don't intercept LEFT/RIGHT inside number inputs (lets user step)
    if (isText && (dir === 'left' || dir === 'right')) return;
    const next = nearestInDirection(document.activeElement, dir);
    if (next) { e.preventDefault(); next.focus(); next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
  }, true);

  // Many remotes send "GoBack" / Escape / browser back for the BACK button
  // — already handled (closes detail / drawer / palette). Nothing extra needed.

  // TV "Search" key → open command palette
  window.addEventListener('keydown', (e) => {
    if (e.key === 'BrowserSearch' || e.key === 'Search' || e.keyCode === 84 /* T */ && e.ctrlKey) {
      e.preventDefault();
      if (typeof openCmdK === 'function') openCmdK();
    }
  });
})();


// ────────────────────────────────────────────────────────────────
// Browse by Category (Features #19-24)
// Tabs: Genres | Decades | Country | Moods | A-Z
// Each tab renders a grid of clickable cards that, when tapped,
// runs the corresponding IMDb suggestion query and shows results.
// ────────────────────────────────────────────────────────────────
// Each entry has a `queries` array — multiple complementary searches
// are fired in parallel and merged to give a much larger candidate pool.
const BROWSE_GENRES = [
  { label: 'Action',      kind: 'action',   queries: ['Action', 'Action Hero', 'Action Adventure', 'Best Action Movies'] },
  { label: 'Comedy',      kind: 'comedy',   queries: ['Comedy', 'Funny Movies', 'Comedy Best', 'Romantic Comedy'] },
  { label: 'Drama',       kind: 'drama',    queries: ['Drama', 'Drama Best', 'Drama Movie', 'Crime Drama'] },
  { label: 'Horror',      kind: 'horror',   queries: ['Horror', 'Scary Movies', 'Horror Best', 'Slasher'] },
  { label: 'Sci-Fi',      kind: 'scifi',    queries: ['Science Fiction', 'Sci-Fi Best', 'Space Movies', 'Cyberpunk'] },
  { label: 'Thriller',    kind: 'thriller', queries: ['Thriller', 'Psychological Thriller', 'Mystery', 'Suspense'] },
  { label: 'Romance',     kind: 'romance',  queries: ['Romance', 'Romance Best', 'Love Story', 'Romantic Movie'] },
  { label: 'Animation',   kind: 'anim',     queries: ['Animation', 'Animated Movie', 'Pixar', 'Disney Animation'] },
  { label: 'Documentary', kind: 'docu',     queries: ['Documentary', 'Documentary Best', 'True Story', 'Biography'] },
  { label: 'Adventure',   kind: 'adv',      queries: ['Adventure', 'Adventure Movie', 'Quest', 'Fantasy Adventure'] }
];
const BROWSE_DECADES = [
  { label: '2020s',    yearRange: [2020, 2029], queries: ['2023', '2024', '2025 Best', 'Recent Movies', 'New Releases'] },
  { label: '2010s',    yearRange: [2010, 2019], queries: ['2015', '2018', '2010s Best', '2014 Best Films'] },
  { label: '2000s',    yearRange: [2000, 2009], queries: ['2005', '2008 Best', '2000s Movies', 'Best of 2007'] },
  { label: '1990s',    yearRange: [1990, 1999], queries: ['1995', '1999 Best', '1990s Movies', 'Best of 1994'] },
  { label: '1980s',    yearRange: [1980, 1989], queries: ['1985', '1988 Best', '1980s Movies', 'Best of 1982'] },
  { label: 'Classics', yearRange: [0, 1979],    queries: ['1975', 'Classic Film', 'Best Old Movies', '1970s Cinema'] }
];
const BROWSE_COUNTRIES = [
  { label: 'Korean',   queries: ['Korean Movie', 'Parasite', 'Train to Busan', 'Korean Drama', 'Park Chan-wook'] },
  { label: 'Japanese', queries: ['Japanese Film', 'Spirited Away', 'Kurosawa', 'Studio Ghibli', 'Japanese Drama'] },
  { label: 'Anime',    queries: ['Anime', 'Demon Slayer', 'Attack on Titan', 'Naruto', 'One Piece'] },
  { label: 'Bollywood',queries: ['Bollywood', 'RRR', 'Hindi Movie', 'Shah Rukh Khan', 'Aamir Khan'] },
  { label: 'French',   queries: ['French Film', 'Amelie', 'French Cinema', 'Jean-Pierre Jeunet', 'French New Wave'] },
  { label: 'Spanish',  queries: ['Spanish Movie', 'Pedro Almodovar', 'Pan Labyrinth', 'Spanish Film'] },
  { label: 'Italian',  queries: ['Italian Film', 'Cinema Paradiso', 'Fellini', 'Italian Movie'] },
  { label: 'German',   queries: ['German Movie', 'Dark', 'Run Lola Run', 'Wim Wenders'] }
];
const BROWSE_MOODS = [
  { label: 'Feel-good',     queries: ['Forrest Gump', 'feel good movies', 'Paddington', 'Amelie', 'School of Rock'] },
  { label: 'Mind-bending',  queries: ['Inception', 'mind-bending', 'Memento', 'Tenet', 'Mulholland Drive'] },
  { label: 'Tearjerker',    queries: ['The Notebook', 'sad movies', 'Manchester by the Sea', 'Marley and Me'] },
  { label: 'Edge-of-seat',  queries: ['Uncut Gems', 'tense thriller', 'Whiplash', 'Run Lola Run'] },
  { label: 'Cozy',          queries: ['Studio Ghibli', 'cozy movie', 'My Neighbor Totoro', 'Little Women', 'Notting Hill'] },
  { label: 'Dark',          queries: ['Se7en', 'dark crime', 'Zodiac', 'Prisoners', 'No Country for Old Men'] },
  { label: 'Funny',         queries: ['Superbad', 'comedy hit', 'Anchorman', 'Step Brothers', 'The Hangover'] },
  { label: 'Inspiring',     queries: ['Rocky', 'inspiring film', 'Good Will Hunting', 'Pursuit of Happyness'] }
];

let activeBrowseTab = 'genre';

function browseTabClicked(tab) {
  activeBrowseTab = tab;
  document.querySelectorAll('#browseTabs .browse-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderBrowseTab(tab);
}

function renderBrowseTab(tab) {
  const host = document.getElementById('browseContent');
  if (!host) return;
  if (tab === 'genre') {
    host.innerHTML = `<div class="browse-grid">${BROWSE_GENRES.map((g, i) => `
      <div class="browse-card" data-kind="${g.kind}" data-tab="genre" data-idx="${i}" data-label="${escapeAttr(g.label)}" tabindex="0">
        <span class="lbl">${escapeHtml(g.label)}</span>
      </div>`).join('')}</div>`;
  } else if (tab === 'decade') {
    host.innerHTML = `<div class="browse-grid">${BROWSE_DECADES.map((d, i) => `
      <div class="browse-card" data-decade="1" data-tab="decade" data-idx="${i}" data-label="${escapeAttr(d.label)}" tabindex="0">
        <span class="lbl">${escapeHtml(d.label)}</span>
      </div>`).join('')}</div>`;
  } else if (tab === 'country') {
    host.innerHTML = `<div class="browse-grid">${BROWSE_COUNTRIES.map((c, i) => `
      <div class="browse-card" data-country="1" data-tab="country" data-idx="${i}" data-label="${escapeAttr(c.label)}" tabindex="0">
        <span class="lbl">${escapeHtml(c.label)}</span>
      </div>`).join('')}</div>`;
  } else if (tab === 'mood') {
    host.innerHTML = `<div class="browse-grid">${BROWSE_MOODS.map((m, i) => `
      <div class="browse-card" data-mood="1" data-tab="mood" data-idx="${i}" data-label="${escapeAttr(m.label)}" tabindex="0">
        <span class="lbl">${escapeHtml(m.label)}</span>
      </div>`).join('')}</div>`;
  } else if (tab === 'az') {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
    host.innerHTML = `<div class="az-grid">${letters.map(L => `
      <div class="az-letter" data-letter="${L}" tabindex="0">${L}</div>`).join('')}</div>`;
  }
  // Wire card clicks
  host.querySelectorAll('.browse-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = +card.dataset.idx;
      const tab = card.dataset.tab;
      openBrowseMore(tab, idx);
    });
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
  });
  host.querySelectorAll('.az-letter').forEach(el => {
    el.addEventListener('click', () => openBrowseMore('az', el.dataset.letter));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
  });
}

// ────────────────────────────────────────────────────────────────
// Browse-more — the full category page with sort + pagination.
// State is module-level so "Load more" works without re-fetching everything.
// ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 18;
let _bmoreState = null;  // { tab, label, allItems, page, sort, typeFilter, yearRange }

function openBrowseMore(tab, indexOrLetter) {
  const host = document.getElementById('browseContent');
  if (!host) return;
  let cfg = {};
  if (tab === 'genre')   cfg = { ...BROWSE_GENRES[+indexOrLetter] };
  else if (tab === 'decade')  cfg = { ...BROWSE_DECADES[+indexOrLetter] };
  else if (tab === 'country') cfg = { ...BROWSE_COUNTRIES[+indexOrLetter] };
  else if (tab === 'mood')    cfg = { ...BROWSE_MOODS[+indexOrLetter] };
  else if (tab === 'az') {
    // A-Z: fire many bigram queries (Sa, Sb, Sc...) so the API returns
    // ~30 titles per bigram × many bigrams = hundreds of candidates.
    // Then we filter to titles actually starting with the requested letter.
    const L = String(indexOrLetter || '').toUpperCase();
    let queries;
    if (L === '#') {
      // Numerals: titles starting with a digit
      queries = ['1', '2', '3', '10', '12', '21', '300', '1917', '2001'];
    } else {
      // Bigrams: L+a, L+e, L+i, L+o, L+u, L+r, L+t, L+l, L+n (most common pairs)
      // Plus the single letter itself for breadth.
      const vowels = 'aeiou';
      const common = 'rstlnhc';
      queries = [L];
      for (const v of vowels) queries.push(L + v);
      for (const c of common) queries.push(L + c);
      // Also the full word forms that work well
      queries.push(L + ' movie', L + ' film');
    }
    cfg = { label: L, queries };
  }
  if (!cfg.label) return;

  _bmoreState = {
    tab, label: cfg.label,
    queries: cfg.queries || [cfg.label],
    yearRange: cfg.yearRange || null,
    allItems: [],
    page: 1,
    sort: 'rating',   // rating | year-desc | year-asc | popularity
    typeFilter: 'all' // all | movie | tv
  };

  // Render shell + skeletons immediately
  host.innerHTML = `
    <div class="bmore-head">
      <button class="bmore-back" id="bmoreBack" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Back
      </button>
      <h3>${escapeHtml(cfg.label)} <span class="count" id="bmoreCount">loading…</span></h3>
    </div>
    <div class="bmore-controls">
      <div class="type-toggle" id="bmoreTypes" role="tablist">
        <button data-type="all" class="active" type="button">All</button>
        <button data-type="movie" type="button">Movies</button>
        <button data-type="tv" type="button">TV</button>
      </div>
      <select class="sort" id="bmoreSort" aria-label="Sort">
        <option value="rating">Sort: Top rated</option>
        <option value="year-desc">Year ↓</option>
        <option value="year-asc">Year ↑</option>
        <option value="popularity">Popularity</option>
      </select>
    </div>
    <div class="bmore-grid" id="bmoreGrid">${skeletonTiles(PAGE_SIZE)}</div>
    <button class="bmore-loadmore" id="bmoreLoadMore" type="button" style="display:none">Load more</button>
  `;

  // Wire controls
  document.getElementById('bmoreBack').addEventListener('click', () => renderBrowseTab(_bmoreState.tab));
  document.getElementById('bmoreSort').addEventListener('change', e => {
    _bmoreState.sort = e.target.value;
    _bmoreState.page = 1;
    renderBmoreGrid();
  });
  document.querySelectorAll('#bmoreTypes button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#bmoreTypes button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _bmoreState.typeFilter = btn.dataset.type;
      _bmoreState.page = 1;
      renderBmoreGrid();
    });
  });
  document.getElementById('bmoreLoadMore').addEventListener('click', () => {
    _bmoreState.page++;
    renderBmoreGrid({ append: true });
  });

  // Fetch the pool
  fetchBmorePool().then(() => renderBmoreGrid());
}

// Pool fetch: run all queries in parallel (each returns up to 30 from
// api.imdbapi.dev, with rating data inline). Falls back to imdbSuggest
// per-query if the rich API rate-limits.
async function fetchBmorePool() {
  if (!_bmoreState) return;
  const queries = _bmoreState.queries;
  const RICH = 'https://api.imdbapi.dev/search/titles';

  // Concurrency-limited runner — max 3 in flight at once so the rich API
  // doesn't 429 us. Retries up to 3 times with exponential backoff on 429.
  const CONCURRENCY = 3;
  async function fetchOne(q, attempt = 1) {
    try {
      const r = await fetch(`${RICH}?query=${encodeURIComponent(q)}&limit=30`);
      if (r.status === 429 && attempt <= 3) {
        const delay = 1000 * attempt + Math.random() * 200;
        await new Promise(res => setTimeout(res, delay));
        return fetchOne(q, attempt + 1);
      }
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      return (data.titles || []).map(t => ({
        id: t.id,
        l: t.primaryTitle,
        y: t.startYear,
        i: t.primaryImage ? { imageUrl: t.primaryImage.url, width: t.primaryImage.width, height: t.primaryImage.height } : null,
        q: t.type,
        qid: t.type,
        rating: t.rating?.aggregateRating,
        votes: t.rating?.voteCount,
        rank: t.rating?.voteCount ? -t.rating.voteCount : 9e9,
        _rich: true
      }));
    } catch {
      // Fallback: cheap IMDb suggest (no ratings, no rate limits)
      try { return await imdbSuggest(q); } catch { return []; }
    }
  }

  // Run with limited concurrency
  const pools = [];
  const queue = [...queries];
  async function worker() {
    while (queue.length) {
      const q = queue.shift();
      pools.push(await fetchOne(q));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queries.length) }, worker));
  // Merge + dedupe
  const seen = new Set();
  const merged = [];
  for (const pool of pools) for (const it of pool) {
    if (!it.id || !it.id.startsWith('tt')) continue;
    if (seen.has(it.id)) {
      // If we already have it, prefer the rich version
      if (it._rich) {
        const i = merged.findIndex(x => x.id === it.id);
        if (i >= 0 && !merged[i]._rich) merged[i] = it;
      }
      continue;
    }
    seen.add(it.id);
    merged.push(it);
  }

  // Apply decade year-range filter if present
  if (_bmoreState.yearRange) {
    const [lo, hi] = _bmoreState.yearRange;
    _bmoreState.allItems = merged.filter(it => {
      const y = +it.y || 0;
      return y >= lo && y <= hi;
    });
  } else if (_bmoreState.tab === 'az') {
    // A-Z: keep titles whose first real letter matches.
    // Strip leading articles in English/Spanish/French/German + punctuation.
    const L = (_bmoreState.label || '').toUpperCase();
    const ARTICLES = /^(The|A|An|El|La|Le|Les|Los|Las|Der|Die|Das|Il|Lo)\s+/i;
    _bmoreState.allItems = merged.filter(it => {
      let t = (it.l || '').trim()
        .replace(ARTICLES, '')
        .replace(/^[^A-Za-z0-9]+/, '');   // strip leading punctuation
      const first = t.charAt(0).toUpperCase();
      if (L === '#') return /[0-9]/.test(first);   // digit first char
      return first === L;
    });
  } else {
    _bmoreState.allItems = merged;
  }

  // Cache for future
  cacheItems(_bmoreState.allItems);
}

function applyBmoreSort(items) {
  const arr = items.slice();
  switch (_bmoreState.sort) {
    case 'rating':
      arr.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.votes || 0) - (a.votes || 0));
      break;
    case 'year-desc': arr.sort((a, b) => (+b.y || 0) - (+a.y || 0)); break;
    case 'year-asc':  arr.sort((a, b) => (+a.y || 9999) - (+b.y || 9999)); break;
    case 'popularity': arr.sort((a, b) => (a.rank || 9e9) - (b.rank || 9e9)); break;
  }
  return arr;
}

function applyBmoreType(items) {
  if (_bmoreState.typeFilter === 'all') return items;
  return items.filter(it => {
    const t = (it.qid || it.q || '').toLowerCase();
    const isTV = /tv|series|episode/.test(t);
    return _bmoreState.typeFilter === 'tv' ? isTV : !isTV;
  });
}

function renderBmoreGrid({ append = false } = {}) {
  if (!_bmoreState) return;
  const grid = document.getElementById('bmoreGrid');
  const loadMore = document.getElementById('bmoreLoadMore');
  const counter = document.getElementById('bmoreCount');
  if (!grid) return;

  const filtered = applyBmoreType(_bmoreState.allItems);
  const sorted = applyBmoreSort(filtered);
  const visible = sorted.slice(0, _bmoreState.page * PAGE_SIZE);

  if (counter) counter.textContent = `${filtered.length} ${filtered.length === 1 ? 'title' : 'titles'}`;

  if (!visible.length) {
    grid.innerHTML = `<div class="bmore-empty" style="grid-column:1/-1">
      <div class="big-text" style="margin-bottom:6px">Nothing found</div>
      <div class="hint">Try a different filter or sort.</div>
    </div>`;
    if (loadMore) loadMore.style.display = 'none';
    return;
  }

  const html = visible.map(it => bmoreTileHTML(it)).join('');
  if (append) {
    // Replace whole grid for simplicity (could optimize later)
    grid.innerHTML = html;
  } else {
    grid.innerHTML = html;
  }
  wireRowEvents(grid, { allowRemove: false });

  // Show/hide load-more
  if (loadMore) {
    if (visible.length < sorted.length) {
      loadMore.style.display = '';
      loadMore.textContent = `Load more (${sorted.length - visible.length} left)`;
    } else {
      loadMore.style.display = 'none';
    }
  }
}

// Tile with rating badge overlay
function bmoreTileHTML(it) {
  const img = it.i?.imageUrl ? thumbUrl(it.i.imageUrl, 260, 390) : '';
  const year = it.y || '';
  const inWL = isInWatchlist(it.id);
  const lbl = inWL ? 'Remove from watchlist' : 'Add to watchlist';
  const rating = typeof it.rating === 'number' ? it.rating.toFixed(1) : null;
  return `
    <div class="tile" data-id="${it.id}" data-title="${escapeAttr(it.l || '')}" tabindex="0">
      <div class="ph">
        ${img ? `<img loading="lazy" src="${img}" alt="">` : 'No image'}
        ${rating ? `<span class="rating-badge"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg>${rating}</span>` : ''}
        <button class="heart ${inWL ? 'on' : ''}" data-id="${it.id}" aria-label="${lbl}" title="${lbl}">
          <svg viewBox="0 0 24 24"><use href="${inWL ? '#i-heart-fill' : '#i-heart'}"/></svg>
        </button>
        <div class="play-ov"><span class="pbtn"><svg viewBox="0 0 24 24"><use href="#i-play"/></svg></span></div>
      </div>
      <div class="t">${escapeHtml(it.l || '')}</div>
      ${year ? `<div class="yr">${year}${rating ? ` · ⭐ ${rating}` : ''}</div>` : ''}
    </div>
  `;
}

// Expose for tests
window.openBrowseMore = openBrowseMore;
window.fetchBmorePool = fetchBmorePool;
window.renderBmoreGrid = renderBmoreGrid;
window.getBmoreState = () => _bmoreState;

// Wire up tabs + initial render
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#browseTabs .browse-tab').forEach(btn => {
    btn.addEventListener('click', () => browseTabClicked(btn.dataset.tab));
  });
  renderBrowseTab('genre');
});

// Expose for testing
window.browseTabClicked = browseTabClicked;


