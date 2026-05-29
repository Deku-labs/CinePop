const path = require('path');
// Verify Features #12-18: Similar / Coming Soon / Hidden Gems / Random Pick / Trailer / Cast / Providers
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8922;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
const sleep = ms => new Promise(r => setTimeout(r,ms));
function waitFor(fn,{timeout=5000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[F12-18] Discovery bundle');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.pickRandomTitle, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;

  const httpMod = require('http'); const httpsMod = require('https');
  window.fetch = (input, init) => new Promise((resolve, reject) => {
    let url = typeof input === 'string' ? input : input.url;
    if (!/^https?:/.test(url)) url = new URL(url, window.location.href).toString();
    const lib = url.startsWith('https:') ? httpsMod : httpMod;
    const req = lib.request(url, init || {}, res => {
      const c=[]; res.on('data',x=>c.push(x)); res.on('end',()=>{
        const b=Buffer.concat(c);
        resolve({ok:res.statusCode>=200&&res.statusCode<300, status:res.statusCode,
          headers:{get:k=>res.headers[k.toLowerCase()]||null},
          text:()=>Promise.resolve(b.toString('utf8')),
          json:()=>Promise.resolve(JSON.parse(b.toString('utf8')))});
      });
    });
    req.on('error', reject); req.end();
  });

  // ── #15 Random Pick FAB ──
  console.log('  ─ #15 Random Pick FAB');
  truthy(document.getElementById('randomPickBtn'), '#randomPickBtn exists');
  // Add some items to watchlist so the random pick has something to choose from
  window.toggleWatchlist({id:'tt0903747', title:'Breaking Bad', year:2008, poster:'', isTV:true});
  window.toggleWatchlist({id:'tt15239678', title:'Dune: Part Two', year:2024, poster:'', isTV:false});
  // pickRandomTitle should not error
  let called = false;
  const origOpen = window.openDetail;
  window.openDetail = (id, t) => { called = true; return Promise.resolve(); };
  window.pickRandomTitle();
  await sleep(50);
  truthy(called, 'pickRandomTitle() opens a detail page');
  window.openDetail = origOpen;

  // ── #12 Similar titles row ──
  console.log('  ─ #12 Similar titles');
  truthy(typeof window.renderSimilar === 'function', 'renderSimilar() is exposed');

  // Open a detail page and verify the similar row is created
  const qEl = document.getElementById('q');
  qEl.value = 'oppenheimer';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'search'});
  document.querySelector('#results .result').click();
  await waitFor(() => document.querySelector('#similarRow'), {timeout:6000, label:'similar row'});
  truthy(document.getElementById('similarRow'), '#similarRow element rendered on detail page');
  // Wait for similar to populate
  await waitFor(() => document.querySelectorAll('#similarRow .tile').length > 0, {timeout:8000, label:'similar tiles'});
  truthy(document.querySelectorAll('#similarRow .tile').length > 0, 'similar tiles populated');

  // ── #17 Cast filmography chips (check FIRST while detail is fresh) ──
  console.log('  ─ #17 Cast filmography');
  await waitFor(() => document.querySelectorAll('.cast-chip').length > 0, {timeout:8000, label:'cast chips'}).catch(()=>{});
  const chips = document.querySelectorAll('.cast-chip');

  // ── #16 Trailer button + modal ──
  console.log('  ─ #16 Trailer');
  truthy(typeof window.openTrailer === 'function', 'openTrailer() exposed');
  truthy(document.getElementById('trailerOpenBtn'), 'trailer button rendered on detail');
  window.openTrailer('Test Movie', 2024);
  await sleep(30);
  truthy(document.getElementById('trailerModal'), 'trailer modal created');
  truthy(document.getElementById('trailerModal').classList.contains('open'), 'trailer modal is open');
  const trailerIframe = document.getElementById('trailerIframe');
  truthy(trailerIframe && trailerIframe.src.includes('youtube'), 'trailer iframe loaded with YouTube URL');
  truthy(trailerIframe.src.includes('Test%20Movie'), 'trailer URL includes title');
  // Esc closes
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
  await sleep(30);
  truthy(!document.getElementById('trailerModal').classList.contains('open'), 'Esc closes trailer');
  truthy(chips.length > 0, `cast chips rendered (${chips.length} found)`);
  if (chips.length > 0) {
    const name = chips[0].dataset.name;
    truthy(name && name.length > 1, `chip has data-name="${name}"`);
    // Clicking a chip closes detail and fills search
    chips[0].click();
    await sleep(50);
    const qVal = document.getElementById('q').value;
    truthy(qVal === name, `clicking chip fills search with actor name (got: "${qVal}")`);
  }

  // ── #18 Providers ──
  console.log('  ─ #18 Where-to-watch providers');
  // Re-open detail to find providers block
  qEl.value = 'breaking bad';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'search 2'});
  document.querySelector('#results .result').click();
  await waitFor(() => document.querySelector('.providers'), {timeout:6000, label:'providers'});
  const providers = document.querySelector('.providers');
  truthy(providers, '.providers section rendered');
  const provLinks = providers.querySelectorAll('a');
  truthy(provLinks.length >= 2, `at least 2 provider links (${provLinks.length} found)`);
  const hrefs = Array.from(provLinks).map(a => a.href);
  truthy(hrefs.some(h => h.includes('justwatch')), 'JustWatch link present');
  truthy(hrefs.some(h => h.includes('themoviedb')), 'TMDB link present');

  // ── #13 Coming Soon row ──
  console.log('  ─ #13 Coming Soon');
  truthy(document.getElementById('comingSoonRow'), '#comingSoonRow element exists');

  // ── #14 Hidden Gems row ──
  console.log('  ─ #14 Hidden Gems');
  truthy(document.getElementById('hiddenGemsRow'), '#hiddenGemsRow element exists');

  // Manually trigger hydration with our patched fetch (test env uses different fetch
  // than the one used at boot, so we re-call hydrateRow ourselves)
  // The COMING_SOON_QUERIES and HIDDEN_GEMS_QUERIES constants are module-scoped;
  // we test via the imdbSuggest function being callable.
  truthy(typeof window.hydrateRow === 'function', 'hydrateRow function exposed');
  // Force one row to hydrate using a known-good query
  await window.hydrateRow(['Past Lives'], document.getElementById('hiddenGemsRow')).catch(()=>{});
  await sleep(300);
  const _n = document.querySelectorAll('#hiddenGemsRow .tile').length;
  truthy(_n > 0, 'hiddenGems row hydrates when called (' + _n + ' tiles)');

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
