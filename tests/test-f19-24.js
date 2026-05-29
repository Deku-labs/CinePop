const path = require('path');
// Verify Features #19-24: Browse by category
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8924;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function eq(a,e,n){return JSON.stringify(a)===JSON.stringify(e)?ok(n):bad(n,`expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
const sleep = ms => new Promise(r => setTimeout(r,ms));
function waitFor(fn,{timeout=5000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[F19-24] Browse by Category');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.browseTabClicked, {timeout:6000,label:'boot'});
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

  // ── Section + tabs ──
  console.log('  ─ Browse section + tabs');
  truthy(document.getElementById('browseSection'), '#browseSection exists');
  truthy(document.getElementById('browseTabs'), '#browseTabs exists');
  truthy(document.getElementById('browseContent'), '#browseContent exists');
  const tabs = Array.from(document.querySelectorAll('#browseTabs .browse-tab')).map(b => b.dataset.tab);
  eq(tabs, ['genre','decade','country','mood','az'], '5 tabs: genre/decade/country/mood/az');

  // ── Default tab = genre, cards render ──
  await sleep(50);
  const genreCards = document.querySelectorAll('#browseContent .browse-card[data-kind]');
  truthy(genreCards.length === 10, `10 genre cards rendered (got ${genreCards.length})`);
  truthy(document.querySelector('#browseContent .browse-card[data-kind="action"]'), 'Action genre card present');
  truthy(document.querySelector('#browseContent .browse-card[data-kind="horror"]'), 'Horror genre card present');

  // ── Switching tabs ──
  console.log('  ─ Tab switching');
  window.browseTabClicked('decade');
  await sleep(30);
  const decadeCards = document.querySelectorAll('#browseContent .browse-card[data-decade]');
  truthy(decadeCards.length === 6, `6 decade cards (got ${decadeCards.length})`);

  window.browseTabClicked('country');
  await sleep(30);
  const countryCards = document.querySelectorAll('#browseContent .browse-card[data-country]');
  truthy(countryCards.length === 8, `8 country cards (got ${countryCards.length})`);

  window.browseTabClicked('mood');
  await sleep(30);
  const moodCards = document.querySelectorAll('#browseContent .browse-card[data-mood]');
  truthy(moodCards.length === 8, `8 mood cards (got ${moodCards.length})`);

  window.browseTabClicked('az');
  await sleep(30);
  const azLetters = document.querySelectorAll('#browseContent .az-letter');
  truthy(azLetters.length === 27, `27 letters in A-Z grid (got ${azLetters.length})`);
  truthy(document.querySelector('#browseContent .az-letter[data-letter="A"]'), 'A letter present');

  // ── Tab "active" state correctly applied ──
  console.log('  ─ Tab active state');
  truthy(document.querySelector('#browseTabs .browse-tab[data-tab="az"]').classList.contains('active'),
         'A-Z tab has .active class');
  truthy(!document.querySelector('#browseTabs .browse-tab[data-tab="genre"]').classList.contains('active'),
         'genre tab not active anymore');

  // ── Clicking a card opens the new browse-more page ──
  console.log('  ─ Card click → browse-more');
  window.browseTabClicked('genre');
  await sleep(30);
  const actionCard = document.querySelector('#browseContent .browse-card[data-kind="action"]');
  actionCard.click();
  await sleep(50);
  truthy(document.getElementById('bmoreGrid'), '#bmoreGrid host created (new browse-more page)');
  truthy(document.getElementById('bmoreBack'), 'Back button present');
  truthy(document.getElementById('bmoreSort'), 'Sort dropdown present');
  // Wait for tiles (may take a few seconds to fetch rich data)
  await waitFor(() => window.getBmoreState()?.allItems?.length > 0,
                {timeout:15000, label:'browse-more pool'}).catch(()=>{});
  const resultTiles = document.querySelectorAll('#bmoreGrid .tile[data-id]');
  truthy(resultTiles.length > 0, `browse-more rendered tiles (${resultTiles.length})`);

  // ── Back button returns to grid ──
  document.getElementById('bmoreBack').click();
  await sleep(30);
  truthy(document.querySelectorAll('#browseContent .browse-card').length > 0, 'Back returns to grid');

  // ── A-Z letter click ──
  console.log('  ─ A-Z directory');
  window.browseTabClicked('az');
  await sleep(30);
  document.querySelector('#browseContent .az-letter[data-letter="S"]').click();
  await sleep(50);
  truthy(document.getElementById('bmoreGrid'), 'A-Z letter triggers browse-more');
  await waitFor(() => window.getBmoreState()?.allItems?.length > 0,
                {timeout:25000, label:'A-Z pool'}).catch(()=>{});
  const azCount = document.querySelectorAll('#bmoreGrid .tile[data-id]').length;
  const azState = window.getBmoreState();
  truthy(azCount > 0, 'A-Z query returns tiles (count=' + azCount + ', state items=' + (azState?.allItems?.length || 0) + ', label=' + (azState?.label || 'none') + ')');

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
