#!/usr/bin/env node
// Test runner — sequentially runs all test-*.js files, aggregates results.
//
// Usage:
//   node run-all.js                  # all tests
//   node run-all.js test-f1 test-f2  # only specific test files
//   node run-all.js --bail           # stop at first failure
//   node run-all.js --no-color       # plain output (for CI logs)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const bail = args.includes('--bail');
const noColor = args.includes('--no-color') || process.env.NO_COLOR;
const filters = args.filter(a => !a.startsWith('--'));

const c = (code, text) => noColor ? text : `\x1b[${code}m${text}\x1b[0m`;
const green = t => c('32', t);
const red = t => c('31', t);
const yellow = t => c('33', t);
const bold = t => c('1', t);
const dim = t => c('2', t);

// Find every test-*.js in this folder
const testsDir = __dirname;
let testFiles = fs.readdirSync(testsDir)
  .filter(f => /^test.*\.js$/.test(f) && f !== 'run-all.js')
  .sort();

if (filters.length) {
  testFiles = testFiles.filter(f => filters.some(q => f.startsWith(q.replace(/\.js$/, ''))));
  if (!testFiles.length) {
    console.error(red(`No tests matched filters: ${filters.join(', ')}`));
    process.exit(2);
  }
}

console.log(bold('═'.repeat(60)));
console.log(bold(`  CinePop — running ${testFiles.length} test file(s)`));
console.log(bold('═'.repeat(60)) + '\n');

let total = 0, failed = 0, errored = 0;
const results = [];
const startAll = Date.now();

function runOne(file) {
  return new Promise(resolve => {
    const start = Date.now();
    const child = spawn('node', [file], {
      cwd: testsDir,
      env: { ...process.env, NO_COLOR: noColor ? '1' : '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });

    // Safety: 90s timeout per test
    const killer = setTimeout(() => child.kill('SIGKILL'), 90_000);
    child.on('exit', (code) => {
      clearTimeout(killer);
      const dur = Date.now() - start;
      const passedMatch = out.match(/Passed:\s*(\d+)/);
      const failedMatch = out.match(/Failed:\s*(\d+)/);
      const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
      const failedN = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      const status = code === 0 && failedN === 0;

      total += passed;
      failed += failedN;
      if (code !== 0 && failedN === 0) errored++;

      const name = file.padEnd(28);
      const mark = status ? green('✓') : red('✗');
      const counts = `${String(passed).padStart(3)} passed, ${String(failedN).padStart(2)} failed`;
      const time = dim(`${(dur / 1000).toFixed(1)}s`);
      console.log(`  ${mark} ${name} ${counts}  ${time}`);

      if (!status) {
        // Show last 10 lines of output for debugging
        const lines = out.split('\n').slice(-10).filter(Boolean);
        for (const l of lines) console.log(`      ${dim(l)}`);
        if (err.trim()) {
          console.log(`      ${red('STDERR:')}`);
          for (const l of err.split('\n').slice(0, 5)) console.log(`      ${dim(l)}`);
        }
      }
      results.push({ file, passed, failed: failedN, exit: code, ok: status, ms: dur });
      resolve(status);
    });
  });
}

(async () => {
  for (const file of testFiles) {
    const ok = await runOne(file);
    if (!ok && bail) {
      console.log('\n' + red('Stopping early (--bail).'));
      break;
    }
    // Small delay between tests so IMDb API doesn't rate-limit us
    await new Promise(r => setTimeout(r, 1500));
  }

  const totalTime = ((Date.now() - startAll) / 1000).toFixed(1);
  console.log('\n' + bold('═'.repeat(60)));
  if (failed === 0 && errored === 0) {
    console.log(bold(green(`  ✓ ALL TESTS PASS  —  ${total} assertions in ${totalTime}s`)));
  } else {
    console.log(bold(red(`  ✗ ${failed} failed assertion(s) across ${errored + results.filter(r => !r.ok).length} suite(s)`)));
    console.log(bold(`    ${total - failed}/${total} assertions passed in ${totalTime}s`));
  }
  console.log(bold('═'.repeat(60)));

  process.exit(failed > 0 || errored > 0 ? 1 : 0);
})();
