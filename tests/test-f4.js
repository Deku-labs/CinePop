const path = require('path');
// Verify Feature #4: Theme picker
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const { get: hget } = require('./_httpget');

const PORT = 8914;
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
  console.log('\n[F4] Theme picker');

  const dom = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom.window.setTheme, {timeout:6000,label:'boot'});
  const { window } = dom; const { document } = window;
  await sleep(100);

  // 1) Theme picker UI exists
  truthy(document.getElementById('themeList'), '#themeList exists in drawer');
  eq(document.querySelectorAll('#themeList .theme-opt').length, 4, '4 theme options present');
  const themes = Array.from(document.querySelectorAll('#themeList .theme-opt')).map(b => b.dataset.theme);
  eq(themes.sort(), ['auto','dark','light','oled'], 'options: dark, oled, light, auto');

  // 2) Default theme is dark; <html> has class theme-dark
  truthy(document.documentElement.classList.contains('theme-dark'), 'default theme class is theme-dark');
  eq(window.getTheme(), 'dark', 'getTheme() returns dark by default');

  // 3) Switching theme updates class on <html>
  window.setTheme('oled');
  await sleep(20);
  truthy(document.documentElement.classList.contains('theme-oled'), 'switching to oled adds theme-oled class');
  truthy(!document.documentElement.classList.contains('theme-dark'), 'previous theme class removed');
  eq(window.getTheme(), 'oled', 'getTheme() returns "oled" after switch');
  eq(window.localStorage.getItem('playimdb.theme'), 'oled', 'localStorage updated');

  // 4) Light theme
  window.setTheme('light');
  await sleep(20);
  truthy(document.documentElement.classList.contains('theme-light'), 'light class applied');
  // Light theme has --bg = #fafafa (whitish). Check computed
  const cs = window.getComputedStyle(document.documentElement);
  const bgLight = cs.getPropertyValue('--bg').trim();
  truthy(bgLight === '#fafafa', `light theme --bg is #fafafa (got: ${bgLight})`);
  // text should be dark
  const textLight = cs.getPropertyValue('--text').trim();
  truthy(textLight === '#15151b', `light theme --text is #15151b (got: ${textLight})`);

  // 5) Clicking a theme button switches theme
  window.setTheme('dark');  // reset
  await sleep(20);
  document.querySelector('#themeList .theme-opt[data-theme="oled"]').click();
  await sleep(20);
  eq(window.getTheme(), 'oled', 'clicking option switches theme');
  truthy(document.querySelector('#themeList .theme-opt[data-theme="oled"]').classList.contains('selected'),
         'active option has .selected class');

  // 6) Theme persists across reloads (simulate by checking applyTheme on a fresh instance)
  // Since we already set 'oled' in localStorage, opening a fresh DOM should land on oled
  dom.window.close();
  const dom2 = await JSDOM.fromURL(ORIGIN+'/', {runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  await waitFor(() => dom2.window.getTheme, {timeout:6000,label:'second boot'});
  await sleep(100);
  // localStorage is per-window-origin in jsdom, but fresh window has empty storage; verify default works
  eq(dom2.window.getTheme(), 'dark', 'fresh window with empty storage defaults to dark');

  // 7) Theme commands in cmdk palette (use dom2)
  const win2 = dom2.window; const doc2 = win2.document;
  doc2.getElementById('cmdkInput').value = '';
  win2.dispatchEvent(new win2.KeyboardEvent('keydown', {key:'k',metaKey:true,bubbles:true}));
  await sleep(80);
  const items = Array.from(doc2.querySelectorAll('#cmdkList .cmdk-item .label')).map(x => x.textContent);
  truthy(items.includes('Theme: Dark'), 'palette has "Theme: Dark"');
  truthy(items.includes('Theme: OLED Black'), 'palette has "Theme: OLED Black"');
  truthy(items.includes('Theme: Light'), 'palette has "Theme: Light"');
  truthy(items.includes('Theme: Auto'), 'palette has "Theme: Auto"');
  win2.dispatchEvent(new win2.KeyboardEvent('keydown', {key:'Escape',bubbles:true}));

  // 8) <meta name="theme-color"> gets updated when theme switches
  win2.setTheme('light');
  await sleep(50);
  const metaTC = doc2.querySelector('meta[name="theme-color"]');
  truthy(metaTC, '<meta name="theme-color"> exists');
  const tcContent = metaTC?.getAttribute('content') || '';
  truthy(tcContent.includes('#fafafa') || tcContent.toLowerCase().includes('fafafa') || tcContent.includes('rgb(250'),
         `meta theme-color matches light theme bg (got: ${tcContent})`);

  console.log('\n────────────────');
  console.log(`Passed: ${p}   Failed: ${f}`);
  if (f) { console.log('\nFailures:'); for (const x of fails) console.log('  •', x.n, '—', x.w) }
  dom2.window.close(); srv.kill();
  process.exit(f?1:0);
}

main().catch(e => { console.error('FATAL',e); srv.kill(); process.exit(2) });
