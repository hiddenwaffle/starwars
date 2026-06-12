const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const testsDir = __dirname;
const skip = new Set(['test-restart.js', 'test-visibility.js', 'test-rescue-and-kill.js', 'run-all.js']);

const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.startsWith('test-') && f.endsWith('.js') && !skip.has(f))
  .sort();

console.log('Running ' + testFiles.length + ' tests...\n');

const concurrency = Math.min(4, Math.max(1, os.cpus().length));
let index = 0;
let passed = 0;
let failed = 0;
const results = new Array(testFiles.length);

function runNext(resolve) {
  if (index >= testFiles.length) {
    if (passed + failed === testFiles.length) resolve();
    return;
  }
  const i = index++;
  const f = testFiles[i];
  const child = execFile('node', [path.join(testsDir, f)], { timeout: 180000 }, (err) => {
    if (err) {
      results[i] = { name: f, ok: false, out: (err.stdout || '').toString().slice(-500), err: (err.stderr || '').toString().slice(-500) };
      failed++;
    } else {
      results[i] = { name: f, ok: true };
      passed++;
    }
    runNext(resolve);
  });
}

new Promise(resolve => {
  const workers = Math.min(concurrency, testFiles.length);
  for (let w = 0; w < workers; w++) runNext(resolve);
}).then(() => {
  for (const r of results) {
    console.log(r.name.padEnd(32) + ' ' + (r.ok ? 'PASS' : 'FAIL'));
    if (!r.ok) {
      if (r.out) console.log(r.out);
      if (r.err) console.log(r.err);
    }
  }
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
});
