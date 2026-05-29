const path = require('path');
// Verify Feature #11: "Because you watched ___" recommendations
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8921;
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
  console.log('\n[F11] Recommendations');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.renderRecommendations, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;

  const httpMod = require('http');
  const httpsMod = require('https');
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

  // 1) Row + label elements exist
  truthy(document.getElementById('recsSection'), '#recsSection exists');
  truthy(document.getElementById('recsRow'), '#recsRow exists');
  truthy(document.getElementById('recsLabel'), '#recsLabel exists');

  // 2) Hidden when no history
  window.localStorage.clear();
  await window.renderRecommendations();
  truthy(document.getElementById('recsSection').hidden, 'hidden when history is empty');

  // 3) Visible after adding a history item — and label updates to seed title
  window.addToHistory({ id:'tt0903747', title:'Breaking Bad', year:2008, poster:'', isTV:true });
  await sleep(1500); // wait for fetchRichMeta + suggestion calls
  truthy(!document.getElementById('recsSection').hidden, 'visible after adding history');
  const labelText = document.getElementById('recsLabel').textContent;
  truthy(labelText.includes('Breaking Bad'), `label includes seed title (got: "${labelText}")`);

  // 4) Row populated with tiles
  await waitFor(() => document.querySelectorAll('#recsRow .tile').length > 0,
                {timeout:8000, label:'recs tiles render'});
  const tileCount = document.querySelectorAll('#recsRow .tile').length;
  truthy(tileCount >= 3, `at least 3 recommendations rendered (${tileCount} found)`);
  // No skeletons remain
  eq(document.querySelectorAll('#recsRow .skel').length, 0, 'skeleton placeholders all replaced');

  // 5) Recs don't include the seed title itself
  const ids = Array.from(document.querySelectorAll('#recsRow .tile')).map(el => el.dataset.id);
  truthy(!ids.includes('tt0903747'), 'recs exclude the seed title');

  // 6) Tiles are clickable (have data-id + data-title)
  const firstRec = document.querySelector('#recsRow .tile');
  truthy(firstRec.dataset.id && firstRec.dataset.id.startsWith('tt'), 'tile has valid tt-id');
  truthy(firstRec.dataset.title, 'tile has data-title');

  // 7) clearHistory hides the row again
  window.clearHistory();
  await sleep(50);
  truthy(document.getElementById('recsSection').hidden, 'hidden again after clearHistory');

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
