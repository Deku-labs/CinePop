const path = require('path');
// Verify A-Z directory now returns many results (parity with other categories)
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8942;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
function eq(a,e,n){return JSON.stringify(a)===JSON.stringify(e)?ok(n):bad(n,`expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function waitFor(fn,{timeout=15000,interval=80,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[A-Z Pagination Fix] big pool + load-more for letter pages');

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

  // ─── 1. Letter "S" — expect a big pool (was 9, now should be 30+)
  console.log('  ─ Open letter "S"');
  window.openBrowseMore('az', 'S');
  // Throttled to 3 concurrent, with 14 queries → wait generously
  await waitFor(() => window.getBmoreState()?.allItems?.length > 20,
                {timeout:30000, label:'S pool ≥ 20'}).catch(()=>{});

  const sState = window.getBmoreState();
  truthy(sState, 'state populated for S');
  truthy(sState?.queries?.length >= 10, `S uses many bigram queries (${sState?.queries?.length})`);
  truthy(sState?.allItems?.length >= 20, `S has many results (got ${sState?.allItems?.length}, want ≥ 20)`);

  // All visible items should start with S (after article-strip)
  const allOK = sState?.allItems?.every(it => {
    let t = (it.l || '').trim().replace(/^(The|A|An|El|La|Le|Les|Los|Las|Der|Die|Das|Il|Lo)\s+/i, '').replace(/^[^A-Za-z0-9]+/, '');
    return t.charAt(0).toUpperCase() === 'S';
  });
  truthy(allOK, 'every result starts with S (post-article strip)');

  // Tiles rendered, capped at PAGE_SIZE (18)
  const tiles = document.querySelectorAll('#bmoreGrid .tile[data-id]');
  truthy(tiles.length === 18 || tiles.length === sState.allItems.length,
         `first page shows up to 18 tiles (got ${tiles.length})`);

  // Load-more button visible if there are more
  const loadMore = document.getElementById('bmoreLoadMore');
  if (sState.allItems.length > 18) {
    truthy(loadMore && loadMore.style.display !== 'none', 'Load more button is visible');
    truthy(/Load more/.test(loadMore.textContent), `Load more shows count (${loadMore.textContent.trim()})`);
    loadMore.click();
    await sleep(100);
    const after = document.querySelectorAll('#bmoreGrid .tile[data-id]').length;
    truthy(after > 18, `clicking Load more reveals more tiles (${after})`);
  } else {
    ok('Load more correctly hidden (pool fit on one page)');
  }

  // ─── 2. Sort by rating works
  document.getElementById('bmoreSort').value = 'rating';
  document.getElementById('bmoreSort').dispatchEvent(new window.Event('change',{bubbles:true}));
  await sleep(50);
  eq(window.getBmoreState().sort, 'rating', 'sort=rating active');
  const ratings = Array.from(document.querySelectorAll('#bmoreGrid .rating-badge')).map(b => parseFloat(b.textContent));
  if (ratings.length >= 2) {
    const sorted = ratings.every((v, i) => i === 0 || v <= ratings[i-1] + 0.01);
    truthy(sorted, `visible tiles are in descending rating order (top: ${ratings[0]})`);
  }

  // ─── 3. Numeric "#" letter
  console.log('  ─ Numeric "#"');
  document.getElementById('bmoreBack').click();
  await sleep(50);
  window.openBrowseMore('az', '#');
  await waitFor(() => window.getBmoreState()?.allItems?.length > 0,
                {timeout:20000, label:'# pool'}).catch(()=>{});
  const hashState = window.getBmoreState();
  if (hashState?.allItems?.length) {
    // Strip articles + leading punctuation, then check for digit first char
    const ARTICLES = /^(The|A|An|El|La|Le|Les|Los|Las|Der|Die|Das|Il|Lo)\s+/i;
    const allDigit = hashState.allItems.every(it => {
      const t = (it.l||'').trim().replace(ARTICLES,'').replace(/^[^A-Za-z0-9]+/,'');
      return /^[0-9]/.test(t);
    });
    truthy(allDigit, `"#" results all start with a digit (${hashState.allItems.length} items)`);
  } else {
    ok('# returned no items (acceptable — rare titles)');
  }

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
