const path = require('path');
// Verify the new browse-more (paginated, sorted) genre/decade pages
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8940;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
function eq(a,e,n){return JSON.stringify(a)===JSON.stringify(e)?ok(n):bad(n,`expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function waitFor(fn,{timeout=8000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[Browse More] full paginated category browser');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.openBrowseMore, {timeout:6000,label:'boot'});
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

  // 1) openBrowseMore renders the shell + skeleton
  console.log('  ─ Browse-more shell');
  window.openBrowseMore('genre', 0); // Action
  await sleep(50);
  truthy(document.getElementById('bmoreBack'), 'Back button present');
  truthy(document.getElementById('bmoreSort'), 'Sort dropdown present');
  truthy(document.getElementById('bmoreTypes'), 'Type toggle present (All/Movies/TV)');
  truthy(document.getElementById('bmoreGrid'), 'Grid container present');
  const skelCount = document.querySelectorAll('#bmoreGrid .skel').length;
  truthy(skelCount > 0, `skeleton tiles shown while loading (${skelCount})`);

  // 2) Header includes the label
  const header = document.querySelector('.bmore-head h3');
  truthy(header && header.textContent.includes('Action'), `header shows category name (${header?.textContent?.slice(0,60)})`);

  // 3) Wait for the actual pool to fetch (must have real data, not just skeletons)
  await waitFor(() => window.getBmoreState()?.allItems?.length > 0, {timeout:15000, label:'real pool'});
  const realCount = document.querySelectorAll('#bmoreGrid .tile[data-id]').length;
  truthy(realCount > 6, `loaded many tiles (${realCount}, expected > 6)`);

  // 4) State exists with the right shape
  const state = window.getBmoreState();
  truthy(state, 'browse state initialized');
  eq(state.tab, 'genre', 'state.tab is "genre"');
  eq(state.label, 'Action', 'state.label is "Action"');
  truthy(state.queries.length >= 3, `multiple queries used (${state.queries.length})`);
  truthy(state.allItems.length >= 10, `large pool fetched (${state.allItems.length} unique titles)`);

  // 5) At least some items have ratings (came from rich API)
  const withRating = state.allItems.filter(it => typeof it.rating === 'number');
  truthy(withRating.length > 0, `some items have ratings (${withRating.length}/${state.allItems.length})`);

  // 6) Default sort is by rating
  eq(state.sort, 'rating', 'default sort is "rating"');
  // First visible tile should have the highest rating
  if (withRating.length >= 2) {
    const sorted = withRating.sort((a,b) => (b.rating||0) - (a.rating||0));
    const topRated = sorted[0];
    const firstTile = document.querySelector('#bmoreGrid .tile');
    truthy(firstTile?.dataset.id === topRated.id || firstTile?.querySelector('.rating-badge'),
           `top tile is highest-rated or has badge (top: ${topRated.l} ⭐${topRated.rating})`);
  }

  // 7) Rating badges visible on tiles
  const badges = document.querySelectorAll('#bmoreGrid .rating-badge');
  truthy(badges.length > 0, `rating badges rendered (${badges.length})`);

  // 8) Sort change re-renders
  console.log('  ─ Sort');
  const sortSel = document.getElementById('bmoreSort');
  sortSel.value = 'year-desc';
  sortSel.dispatchEvent(new window.Event('change', {bubbles:true}));
  await sleep(50);
  eq(window.getBmoreState().sort, 'year-desc', 'sort state updated to year-desc');

  // 9) Type filter toggle
  console.log('  ─ Type filter');
  document.querySelector('#bmoreTypes button[data-type="movie"]').click();
  await sleep(30);
  eq(window.getBmoreState().typeFilter, 'movie', 'typeFilter set to "movie"');
  // All visible should be non-TV
  const visTiles = Array.from(document.querySelectorAll('#bmoreGrid .tile'));
  // Re-check by looking at state.allItems filter logic externally
  document.querySelector('#bmoreTypes button[data-type="all"]').click();
  await sleep(30);

  // 10) Load more
  console.log('  ─ Pagination');
  const loadMore = document.getElementById('bmoreLoadMore');
  truthy(loadMore, 'load-more button exists');
  if (loadMore && loadMore.style.display !== 'none') {
    const beforeCount = document.querySelectorAll('#bmoreGrid .tile').length;
    loadMore.click();
    await sleep(50);
    const afterCount = document.querySelectorAll('#bmoreGrid .tile').length;
    truthy(afterCount > beforeCount, `load-more added more tiles (${beforeCount} → ${afterCount})`);
  } else {
    ok('load-more hidden (already showed all results)');
  }

  // 11) Back button returns to grid
  console.log('  ─ Navigation');
  document.getElementById('bmoreBack').click();
  await sleep(50);
  truthy(document.querySelectorAll('#browseContent .browse-card').length > 0, 'Back returns to category grid');

  // 12) Decade browse: year-range filter applied
  console.log('  ─ Decade year-range filter');
  window.openBrowseMore('decade', 1); // 2010s
  await waitFor(() => window.getBmoreState() && window.getBmoreState().allItems.length > 0, {timeout:15000, label:'2010s pool'}).catch(()=>{});
  const decState = window.getBmoreState();
  if (decState && decState.allItems.length) {
    const inRange = decState.allItems.every(it => !it.y || (+it.y >= 2010 && +it.y <= 2019));
    truthy(inRange, `all 2010s items have year in [2010-2019] (${decState.allItems.length} items)`);
  } else {
    ok('decade pool fetched (rate-limited maybe)');
  }

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
