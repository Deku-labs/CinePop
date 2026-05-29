const path = require('path');
// End-to-end user flow: search → detail → play → watchlist → close → recs
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8950;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function waitFor(fn,{timeout=15000,interval=80,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[E2E Flow] Complete user journey');

    const dom = await JSDOM.fromURL(ORIGIN+'/', {
    runScripts: 'dangerously',
    resources: {
      interceptors: [
        requestInterceptor((request) => {
          if (request.url.includes('playimdb.com') || request.url.includes('vidsrc') || request.url.includes('2embed') || request.url.includes('superembed') || request.url.includes('multiembed')) {
            return new Response('<html><body>Blocked</body></html>', {
              headers: { 'Content-Type': 'text/html' }
            });
          }
        })
      ]
    },
    pretendToBeVisual: true,
    virtualConsole: new VirtualConsole()
  });
  await waitFor(() => dom.window.openDetail, {timeout:6000,label:'boot'});
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

  // Stub HTMLIFrameElement so the playimdb player doesn't actually load
  Object.defineProperty(window.HTMLIFrameElement.prototype, 'src', {
    set(_v) { this.setAttribute('src', 'about:blank'); }, get() { return 'about:blank'; }
  });

  // 1. Boot — verify all sections exist
  console.log('  ─ Home boot');
  truthy(document.getElementById('home'), 'Home view present');
  truthy(document.getElementById('browseSection'), 'Browse section present');
  truthy(document.getElementById('continueSection'), 'Continue Watching section present');
  truthy(document.getElementById('watchlistSection'), 'Watchlist section present');
  truthy(document.getElementById('trendingRow'), 'Trending row present');

  // 2. Search flow
  console.log('  ─ Search "inception"');
  const qEl = document.getElementById('q');
  qEl.value = 'inception';
  qEl.dispatchEvent(new window.Event('input',{bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'results'});
  const resultCount = document.querySelectorAll('#results .result').length;
  truthy(resultCount > 0, `Search returned ${resultCount} results`);

  // 3. Open detail
  console.log('  ─ Open first result');
  const firstResult = document.querySelector('#results .result');
  const titleId = firstResult.dataset.id;
  firstResult.click();
  await waitFor(() => document.querySelector('#detail-body .hero'), {timeout:5000, label:'detail loads'});
  truthy(document.querySelector('#detail-body .hero'), 'Hero rendered');
  truthy(document.querySelector('#detail-body .play-btn'), 'Play button rendered');

  // 4. Wait for rich meta + similar
  console.log('  ─ Rich meta loads');
  await waitFor(() => document.querySelector('#detail-body .meta-pills'), {timeout:8000, label:'rich meta'}).catch(()=>{});
  truthy(document.querySelector('#detail-body .meta-pills') || document.querySelector('#detail-body .trailer-btn'),
         'Rich meta or trailer button appeared');

  // 5. Favorite via heart
  console.log('  ─ Heart favorite');
  const detailHeart = document.getElementById('detailHeart');
  truthy(detailHeart, 'Detail heart button present');
  detailHeart.click();
  await sleep(50);
  truthy(detailHeart.classList.contains('on'), 'Heart toggled on');
  truthy(window.isInWatchlist(titleId), `Title added to watchlist (${titleId})`);

  // 6. Click Play
  console.log('  ─ Play');
  const playBtn = document.getElementById('playBtn');
  playBtn.click();
  await sleep(50);
  // Player creates an iframe — jsdom would try to load+execute it which is noisy & slow
  // Block it: replace iframe src before it loads
  const iframe = document.querySelector('#playerHost iframe');
  truthy(iframe, 'Player iframe injected');
  if (iframe) iframe.src = 'about:blank';
  truthy(window.getHistory().some(h => h.id === titleId), 'Added to watch history');

  // 7. Close and see watchlist appear on home
  console.log('  ─ Close & verify home state');
  document.getElementById('back').click();
  await sleep(100);
  truthy(!document.getElementById('detail').classList.contains('open'), 'Detail closed');
  truthy(!document.getElementById('watchlistSection').hidden, 'Watchlist section now visible');
  truthy(!document.getElementById('continueSection').hidden, 'Continue Watching now visible');

  // 8. Recommendations populated
  console.log('  ─ Recs populated');
  await waitFor(() => document.querySelectorAll('#recsRow .tile').length > 0, {timeout:10000, label:'recs'}).catch(()=>{});
  truthy(document.querySelectorAll('#recsRow .tile').length > 0, 'Recommendations rendered');

  // 9. Browse → Genre Action → check it opens browse-more
  console.log('  ─ Browse → Action');
  document.querySelector('#browseTabs .browse-tab[data-tab="genre"]').click();
  await sleep(50);
  document.querySelector('#browseContent .browse-card[data-kind="action"]').click();
  await waitFor(() => window.getBmoreState()?.allItems?.length > 0, {timeout:20000, label:'action pool'}).catch(()=>{});
  truthy(window.getBmoreState()?.allItems?.length > 0,
         `Action browse-more loaded ${window.getBmoreState()?.allItems?.length || 0} titles`);
  truthy(document.querySelectorAll('#bmoreGrid .rating-badge').length > 0, 'Rating badges visible');

  // 10. Back to home + theme switch
  document.getElementById('bmoreBack').click();
  await sleep(50);
  window.setTheme('oled');
  await sleep(50);
  truthy(document.documentElement.classList.contains('theme-oled'), 'Theme switched to OLED');

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
