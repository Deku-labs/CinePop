const path = require('path');
// Reproduce the "stuck on skeleton" bug and verify the fix.
// Simulates Chrome/Safari Mac by providing document.startViewTransition.
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8930;
const ORIGIN = `http://127.0.0.1:${PORT}`;
let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function waitFor(fn,{timeout=5000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[Detail Fix] Verify the stuck-skeleton bug is fixed');

  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', e => errors.push(e.message.split('\n')[0]));
  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc});
  await waitFor(() => dom.window.openDetail, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;

  // Install fetch
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

  // ═══════════════════════════════════════════════════════════
  // 1. Simulate Chrome Mac with document.startViewTransition
  //    (this was the env that triggered the original bug)
  // ═══════════════════════════════════════════════════════════
  document.startViewTransition = (cb) => {
    cb();
    return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve() };
  };
  truthy(typeof document.startViewTransition === 'function', 'mock startViewTransition installed (simulates Chrome Mac)');

  // ═══════════════════════════════════════════════════════════
  // 2. Open Shawshank Redemption (the exact title from the bug screenshot)
  // ═══════════════════════════════════════════════════════════
  console.log('  → openDetail("tt0111161", "The Shawshank Redemption")');
  await window.openDetail('tt0111161', 'The Shawshank Redemption');
  await sleep(2500); // wait for getCachedInfo + renderDetail

  const body = document.getElementById('detail-body').innerHTML;
  truthy(!body.includes('skel-detail'), 'detail body NO LONGER shows the skeleton (the bug)');
  truthy(body.includes('class="hero'), 'hero element rendered');
  truthy(body.includes('detail-top'), 'detail-top rendered');
  truthy(body.includes('Shawshank') || body.length > 1000,
         `detail content is real (length: ${body.length}, contains Shawshank: ${body.includes('Shawshank')})`);
  truthy(document.querySelector('#detail-body .play-btn'), 'play button rendered');

  // ═══════════════════════════════════════════════════════════
  // 3. Verify the error path: closeDetail works even when called from
  //    inside the error empty-state (window.closeDetail must be exposed).
  // ═══════════════════════════════════════════════════════════
  truthy(typeof window.closeDetail === 'function', 'window.closeDetail exposed for inline onclick');

  // ═══════════════════════════════════════════════════════════
  // 4. Open another title to confirm sequential opens still work
  // ═══════════════════════════════════════════════════════════
  window.closeDetail();
  await sleep(50);
  await window.openDetail('tt15239678', 'Dune: Part Two');
  await sleep(2500);
  const body2 = document.getElementById('detail-body').innerHTML;
  truthy(!body2.includes('skel-detail'), 'second openDetail also renders (not stuck on skeleton)');
  truthy(body2.includes('class="hero'), 'second open has hero');

  // ═══════════════════════════════════════════════════════════
  // 5. No new JSDOM errors caused by the fix
  // ═══════════════════════════════════════════════════════════
  const newErrors = errors.filter(e => !/matchMedia|requestAnimation|ResizeObserver/.test(e));
  truthy(newErrors.length === 0, `no unexpected errors (${newErrors.length}: ${newErrors.slice(0,2).join(' | ')})`);

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
