const path = require('path');
// Verify Feature #3: Hero backdrop on detail page
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8913;
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
  console.log('\n[F3] Hero backdrop');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.openDetail, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;

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

  // CSS rules
  const styles = Array.from(document.styleSheets).flatMap(ss => {
    try { return Array.from(ss.cssRules || []).map(r => r.cssText) } catch { return [] }
  }).join('\n');
  truthy(styles.includes('.hero'), '.hero CSS class defined');
  truthy(styles.includes('.hero-bg'), '.hero-bg CSS class defined');
  truthy(styles.includes('blur(28px)'), 'hero backdrop uses blur(28px)');

  // Open detail for a title we know has poster art
  // 1) Search first so we have it cached
  const qEl = document.getElementById('q');
  qEl.value = 'dune part two';
  qEl.dispatchEvent(new window.Event('input',{bubbles:true}));
  await waitFor(() => document.querySelectorAll('#results .result').length > 0, {timeout:5000,label:'search results'});
  // Click the first result
  document.querySelector('#results .result').click();
  await waitFor(() => document.querySelector('#detail-body .hero'), {timeout:3000,label:'hero rendered'});

  const hero = document.querySelector('#detail-body .hero');
  truthy(hero, '.hero element rendered on detail page');

  // Backdrop image div should exist and have a background-image URL
  const heroBg = hero.querySelector('.hero-bg');
  truthy(heroBg, '.hero-bg element present (title has art)');
  if (heroBg) {
    const bg = heroBg.style.backgroundImage;
    truthy(bg && bg.includes('http'), `.hero-bg has background-image URL (${bg.slice(0,60)})`);
    truthy(bg.includes('m.media-amazon.com') || bg.includes('imdb'), 'backdrop uses IMDb poster URL');
  }

  // .detail-top should be INSIDE .hero
  const dt = document.querySelector('#detail-body .hero .detail-top');
  truthy(dt, '.detail-top is nested inside .hero');

  // rich meta is OUTSIDE .hero (so the gradient veil ends cleanly)
  const richMeta = document.getElementById('richMeta');
  truthy(richMeta && !richMeta.closest('.hero'), '#richMeta is outside .hero (below the backdrop)');

  // No-art fallback: openDetail with no poster info should add .no-art class
  if (typeof window.openDetail === 'function') {
    // Use a title-id we know won't have an image cached in infoCache
    window.openDetail('tt0000001', 'Test No Art Title');
    await sleep(1500);
    const noArtHero = document.querySelector('#detail-body .hero');
    truthy(noArtHero, 'hero renders even with no image');
    if (noArtHero) {
      const hasNoArt = noArtHero.classList.contains('no-art');
      truthy(hasNoArt, 'hero has .no-art class when there is no poster');
      truthy(!noArtHero.querySelector('.hero-bg'), '.hero-bg omitted when no art');
    }
  }

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
