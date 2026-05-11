const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const skip = new Set(['test-restart.js', 'test-visibility.js', 'run-all.js']);

const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.startsWith('test-') && f.endsWith('.js') && !skip.has(f))
  .sort();

console.log('Running ' + testFiles.length + ' tests...\n');

let passed = 0;
let failed = 0;

for (const f of testFiles) {
  process.stdout.write(f.padEnd(32) + ' ');
  try {
    execSync('node ' + path.join(testsDir, f), { timeout: 120000, stdio: 'pipe' });
    console.log('PASS');
    passed++;
  } catch (e) {
    console.log('FAIL');
    if (e.stdout) console.log(e.stdout.toString().slice(-500));
    if (e.stderr) console.log(e.stderr.toString().slice(-500));
    failed++;
  }
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
