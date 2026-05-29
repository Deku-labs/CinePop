// Verify Feature #1: First-run onboarding
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('path');
const { get: hget } = require('./_httpget');

const APP_DIR = path.resolve(__dirname, '..');
const PORT = 8911;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let p=0,f=0;
const fails=[];
function ok(n){p++; console.log('  \x1b[32m✓\x1b[0m',n);}
function bad(n,w){f++; fails.push({n,w}); console.log('  \x1b[31m✗\x1b[0m',n,'—',w);}
function eq(a,e,n){return JSON.stringify(a)===JSON.stringify(e)?ok(n):bad(n,`expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`);}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`);}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitFor(fn,{timeout=4000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval);})()});}

const srv = spawn('python3', ['server.py'], { cwd: APP_DIR, env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'}, stdio:['ignore','ignore','ignore']});

async function main() {
  for (let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[F1] First-run onboarding');

  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e => errs.push(e.message));
  const dom = await JSDOM.fromURL(ORIGIN+'/', { runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole:vc });
  await waitFor(() => dom.window.openOnboarding, {timeout:6000, label:'app.js boot'});

  const { window } = dom;
  const { document } = window;

  // Patch fetch like the main test suite
  const httpMod = require('http');
  window.fetch = (input, init) => new Promise((resolve, reject) => {
    let url = typeof input === 'string' ? input : input.url;
    if (!/^https?:/.test(url)) url = new URL(url, window.location.href).toString();
    const req = httpMod.request(url, init || {}, res => {
      const c = []; res.on('data', x => c.push(x)); res.on('end', () => {
        const b = Buffer.concat(c);
        resolve({ ok: res.statusCode>=200&&res.statusCode<300, status: res.statusCode,
          headers:{get:k=>res.headers[k.toLowerCase()]||null},
          text:()=>Promise.resolve(b.toString('utf8')),
          json:()=>Promise.resolve(JSON.parse(b.toString('utf8'))) });
      });
    });
    req.on('error', reject); req.end();
  });

  // 1) Scrim element exists
  const scrim = document.getElementById('onbScrim');
  truthy(scrim, 'onbScrim element exists in DOM');
  truthy(document.getElementById('onbIcon'), 'onbIcon exists');
  truthy(document.getElementById('onbTitle'), 'onbTitle exists');
  truthy(document.getElementById('onbBody'), 'onbBody exists');
  truthy(document.getElementById('onbDots'), 'onbDots exists');
  truthy(document.getElementById('onbNext'), 'onbNext button exists');
  truthy(document.getElementById('onbSkip'), 'onbSkip button exists');

  // 2) shouldShowOnboarding(): true on fresh storage, false after marking done
  window.localStorage.clear();
  // shouldShowOnboarding is module-scoped; we test via the public openOnboarding flow
  truthy(typeof window.replayOnboarding === 'function', 'window.replayOnboarding exposed');

  // 3) Open & verify rendering of step 1
  window.replayOnboarding();
  await sleep(50);
  truthy(scrim.classList.contains('open'), 'scrim opens on call');
  eq(document.getElementById('onbTitle').textContent, 'Search anything', 'step 1 title');
  truthy(document.getElementById('onbBody').innerHTML.includes('search bar'), 'step 1 body mentions search');
  eq(document.getElementById('onbNext').textContent, 'Next', 'first step button = Next');
  eq(document.getElementById('onbDots').children.length, 3, '3 dots present');
  truthy(document.getElementById('onbDots').children[0].classList.contains('on'), 'first dot active');

  // 4) Click Next → step 2
  document.getElementById('onbNext').click();
  await sleep(30);
  eq(document.getElementById('onbTitle').textContent, 'Save for later', 'step 2 title');
  truthy(document.getElementById('onbBody').innerHTML.includes('heart'), 'step 2 mentions heart');
  truthy(document.getElementById('onbDots').children[1].classList.contains('on'), 'second dot active');

  // 5) Click Next → step 3 (final)
  document.getElementById('onbNext').click();
  await sleep(30);
  eq(document.getElementById('onbTitle').textContent, 'Power moves', 'step 3 title');
  eq(document.getElementById('onbNext').textContent, 'Get started', 'final step button = Get started');
  truthy(document.getElementById('onbDots').children[2].classList.contains('on'), 'third dot active');

  // 6) Click Get started → closes + marks done
  document.getElementById('onbNext').click();
  await sleep(50);
  truthy(!scrim.classList.contains('open'), 'scrim closes on final click');
  eq(window.localStorage.getItem('playimdb.onboarded'), '1', 'localStorage marked onboarded');

  // 7) Skip button also closes + marks done
  window.localStorage.removeItem('playimdb.onboarded');
  window.replayOnboarding();
  await sleep(30);
  document.getElementById('onbSkip').click();
  await sleep(30);
  truthy(!scrim.classList.contains('open'), 'Skip closes scrim');
  eq(window.localStorage.getItem('playimdb.onboarded'), '1', 'Skip marks onboarded');

  // 8) Esc closes when open
  window.localStorage.removeItem('playimdb.onboarded');
  window.replayOnboarding();
  await sleep(30);
  truthy(scrim.classList.contains('open'), 'reopened for Esc test');
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
  await sleep(50);
  truthy(!scrim.classList.contains('open'), 'Esc closes scrim');

  // 9) ArrowRight advances (re-open + go forward)
  window.replayOnboarding();
  await sleep(30);
  // scrim is open; press ArrowRight twice
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true}));
  await sleep(30);
  eq(document.getElementById('onbTitle').textContent, 'Save for later', 'ArrowRight advances to step 2');
  // ArrowLeft goes back
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true}));
  await sleep(30);
  eq(document.getElementById('onbTitle').textContent, 'Search anything', 'ArrowLeft returns to step 1');
  document.getElementById('onbSkip').click();

  // 10) Command palette has the "Show app tour" entry
  document.getElementById('cmdkInput').value='';  // ensure input is empty
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'k',metaKey:true,bubbles:true}));
  await sleep(80);
  const items = Array.from(document.querySelectorAll('#cmdkList .cmdk-item .label')).map(x => x.textContent);
  truthy(items.includes('Show app tour'), `Command palette has "Show app tour" (items: ${items.join(', ')})`);
  window.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w); }
  dom.window.close();
  srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL', e); srv.kill(); process.exit(2); });
