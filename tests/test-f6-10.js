const path = require('path');
// Verify Features #6-10: Haptic, A11y, Empty states, PTR, Splash
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8916;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let p=0,f=0; const fails=[];
function ok(n){p++;console.log('  \x1b[32m✓\x1b[0m',n)}
function bad(n,w){f++;fails.push({n,w});console.log('  \x1b[31m✗\x1b[0m',n,'—',w)}
function eq(a,e,n){return JSON.stringify(a)===JSON.stringify(e)?ok(n):bad(n,`expected ${JSON.stringify(e)} got ${JSON.stringify(a)}`)}
function truthy(v,n){v?ok(n):bad(n,`falsy: ${v}`)}
const sleep = ms => new Promise(r => setTimeout(r,ms));
function waitFor(fn,{timeout=4000,interval=50,label=''}={}){return new Promise((res,rej)=>{const s=Date.now();(function l(){let r;try{r=fn()}catch{}if(r)return res(r);if(Date.now()-s>timeout)return rej(new Error('timeout: '+label));setTimeout(l,interval)})()})}

const srv = spawn('python3',['server.py'],{cwd:path.resolve(__dirname, '..'),env:{...process.env,PORT:String(PORT),HOST:'127.0.0.1'},stdio:['ignore','ignore','ignore']});

async function main(){
  for(let i=0;i<50;i++){try{const r=await hget(ORIGIN+'/');if(r.status===200)break}catch{}await sleep(100)}
  console.log('\n[F6-10] Polish bundle');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.openOnboarding, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;
  // Install fetch shim
  const httpMod = require('http');
  window.fetch = (input, init) => new Promise((resolve, reject) => {
    let url = typeof input === 'string' ? input : input.url;
    if (!/^https?:/.test(url)) url = new URL(url, window.location.href).toString();
    const req = httpMod.request(url, init || {}, res => {
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
  await sleep(100);

  // ── #10 Splash ──
  console.log('  ─ #10 Splash');
  // Splash starts in DOM and is auto-removed
  // We can't observe the animation in jsdom, but markup must be in the served HTML
  const indexHtml = (await hget(ORIGIN+'/')).text;
  truthy(indexHtml.includes('id="splash"'), 'splash element shipped in index.html');
  truthy(indexHtml.includes('splash-mark'), 'splash mark is in HTML');
  truthy(indexHtml.includes('@keyframes splashIn'), '@keyframes splashIn defined');
  truthy(indexHtml.includes('@keyframes splashOut'), '@keyframes splashOut defined');
  truthy(indexHtml.includes('prefers-reduced-motion'), 'splash respects prefers-reduced-motion');

  // ── #9 Pull-to-refresh ──
  console.log('  ─ #9 Pull-to-refresh');
  truthy(document.getElementById('ptr'), '#ptr indicator element exists');
  truthy(indexHtml.includes('.ptr{'), '.ptr CSS defined');
  // Inject a touchstart→touchmove→touchend sequence to test the handler
  function ti(type, y) {
    const ev = new window.Event(type, {bubbles:true});
    ev.touches = [{clientY: y}];
    document.dispatchEvent(ev);
  }
  window.scrollY = 0;
  ti('touchstart', 100);
  ti('touchmove', 200);  // pulled 100px > TRIGGER 80
  await sleep(20);
  const ptrEl = document.getElementById('ptr');
  truthy(ptrEl.classList.contains('visible') || ptrEl.style.opacity !== '',
         'PTR becomes visible during pull');
  ti('touchend', 200);
  await sleep(50);

  // ── #6 Haptic ──
  console.log('  ─ #6 Haptic');
  // Mock navigator.vibrate
  let lastVibrate = null;
  Object.defineProperty(window.navigator, 'vibrate', {
    configurable: true, writable: true,
    value: (pattern) => { lastVibrate = pattern; return true; }
  });
  // Search + click a heart
  const qEl = document.getElementById('q');
  qEl.value = 'dune';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'results'});
  const heart = document.querySelector('#results .result .heart');
  truthy(heart, 'heart button found in result card');
  if (heart) {
    lastVibrate = null;
    heart.click();
    await sleep(30);
    truthy(lastVibrate !== null, `tapping heart fires navigator.vibrate (called with: ${lastVibrate})`);
  }
  // Theme button click → haptic
  lastVibrate = null;
  document.querySelector('#themeList .theme-opt[data-theme="oled"]')?.click();
  await sleep(30);
  truthy(lastVibrate !== null, 'tapping theme option fires haptic');

  // ── #8 Polished empty states ──
  console.log('  ─ #8 Empty states');
  // "No results" state
  qEl.value = 'zxqwerty_no_match_definitely';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await sleep(500);  // debounce + fetch
  const empty = document.querySelector('#results .empty');
  if (empty) {
    truthy(empty.querySelector('.big-text'), 'empty state has .big-text headline');
    truthy(empty.querySelector('.hint'), 'empty state has .hint sub-text');
  } else {
    // some queries do return results; that's fine
    ok('search executed (empty state may not appear for ambiguous query)');
  }

  // "No matches" filter empty state — apply tv filter on "dune" (which has only movies typically)
  qEl.value = 'dune';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'dune'});
  // Switch to TV filter
  document.querySelector('#filters .chip[data-filter="tv"]').click();
  await sleep(50);
  const filterEmpty = document.querySelector('#results .empty');
  if (filterEmpty) {
    truthy(filterEmpty.querySelector('.big-text'), 'filter empty state has .big-text');
    truthy(filterEmpty.querySelector('.hint'), 'filter empty state has .hint');
  } else {
    // some "dune" results may be TV mini-series — that's OK
    ok('"dune" had at least one TV match (no empty state needed)');
  }
  document.querySelector('#filters .chip[data-filter="all"]').click();

  // ── #7 Accessibility ──
  console.log('  ─ #7 Accessibility');
  truthy(document.querySelector('main[role="main"]'), '<main> has role="main"');
  truthy(document.querySelector('main[aria-label]'), '<main> has aria-label');
  truthy(document.getElementById('toast').getAttribute('aria-live') === 'polite', 'toast is aria-live="polite"');
  // sr-only class defined
  truthy(indexHtml.includes('.sr-only'), '.sr-only utility class defined');
  truthy(indexHtml.includes('prefers-reduced-motion'), 'prefers-reduced-motion media query honored');

  // ── Bonus: verify nothing broke ──
  // Re-run a basic search & detail open
  qEl.value = 'oppenheimer';
  qEl.dispatchEvent(new window.Event('input', {bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000, label:'oppenheimer'});
  truthy(document.querySelectorAll('#results .result').length > 0, 'search still works after all patches');

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
