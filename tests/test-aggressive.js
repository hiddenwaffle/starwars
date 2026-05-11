// Aggressive playthrough. Wanders rooms, fights, tries to get into combat.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'star-wars-1979.html'), 'utf8');
const errors = [];

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {}
    };
    return { type: '', frequency: param, connect: (n) => n || ({ connect: () => {} }), start: () => {}, stop: () => {} };
  }
  createGain() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {}
    };
    return { gain: param, connect: (n) => n || ({ connect: () => {} }) };
  }
  resume() { return Promise.resolve(); }
}

async function run(seed) {
  // Seed Math.random for reproducibility
  let s = seed;
  const seededRand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.Math.random = seededRand;
      window.addEventListener('error', (e) => {
        errors.push('window.error: ' + (e.error ? (e.error.stack || e.error.message) : e.message));
      });
      window.addEventListener('unhandledrejection', (e) => {
        errors.push('unhandledrejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)));
      });
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(150);

  const messages = document.getElementById('messages');
  const status = document.getElementById('status');
  function getMessages() { return messages ? messages.textContent : ''; }
  function getStatus()   { return status ? status.textContent : ''; }
  function findInput()   { return messages ? messages.querySelector('input.term-input') : null; }

  function pressKey(key) { document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })); }

  async function waitForInput(timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return null;
      const inp = findInput();
      if (inp) return inp;
      await wait(15);
    }
    return null;
  }

  async function sendCommand(cmd) {
    const inp = await waitForInput(1500);
    if (!inp) return false;
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(40);
    return true;
  }

  async function pressAnyKey() {
    await wait(40);
    pressKey('Space');
    await wait(40);
  }

  await pressAnyKey();
  await sendCommand('TESTER');
  await pressAnyKey();
  await pressAnyKey();
  await wait(120);

  // Random wander + attack loop. Try to maximize coverage.
  const dirs = ['N', 'E', 'W', 'S'];
  const wpns = ['S', 'B', 'H'];
  let turns = 0;
  let lastStatus = '';
  while (turns++ < 80) {
    if (errors.length > 0) break;

    const stat = getStatus();
    const inGame = stat && stat.includes('DOORS OPEN');
    if (!inGame) break;

    // Detect end of game
    const mtail = getMessages().slice(-200);
    if (mtail.includes('FINAL SCORE') || mtail.includes('PRESS RESTART')) break;

    // Pick command based on what's in the room
    let cmd;
    const r = seededRand();
    if (stat.includes('IMPERIAL SOLDIER') || stat.includes('DARTH VADER') || (stat.match(/(\d+) SOLDIERS/) && parseInt(stat.match(/(\d+) SOLDIERS/)[1]) > 0)) {
      // Enemy in room — attack
      if (!stat.includes('SABRE ON') && r < 0.3) cmd = 'SABRE';
      else if (r < 0.6) cmd = 'A S';     // attack with sabre
      else if (r < 0.85) cmd = 'A H';    // hands
      else cmd = 'F';                     // flee
    } else {
      // No enemies — wander, pick up, sabotage, etc.
      if (r < 0.05) cmd = 'L';
      else if (r < 0.10) cmd = '?';
      else if (r < 0.15) cmd = 'GET A';
      else if (r < 0.20) cmd = 'SAB';
      else if (r < 0.25) cmd = 'TOSS';
      else if (r < 0.30) cmd = 'SWING';
      else if (r < 0.35) cmd = 'TA';
      else cmd = 'M ' + dirs[Math.floor(seededRand() * 4)];
    }

    const ok = await sendCommand(cmd);
    if (!ok) {
      // No input prompt - probably mid-output or briefing or anyKey
      // Try pressing space in case we're at an anyKey
      await pressAnyKey();
      await wait(100);
      // If still not back, break
      const inp = findInput();
      if (!inp) {
        const tail = getMessages().slice(-150);
        if (tail.includes('FINAL SCORE') || tail.includes('PRESS RESTART')) break;
        // Stuck somewhere — print state and bail
        console.log('STUCK at turn', turns, '- tail:', tail);
        break;
      }
    }
    await wait(50);
    lastStatus = stat;
  }

  console.log('=== Seed:', seed, ' Turns played:', turns, '===');
  console.log('=== FINAL STATUS ===');
  console.log(getStatus());
  console.log('=== FINAL MESSAGES (tail 800) ===');
  console.log(getMessages().slice(-800));
  console.log('=== ERRORS ===');
  if (errors.length === 0) console.log('(none)');
  else for (const e of errors) console.log(e);

  return errors.length;
}

(async () => {
  // Run with multiple seeds to exercise different random states
  const seeds = [42, 1234, 7, 999, 333];
  let totalErrors = 0;
  for (const s of seeds) {
    console.log('\n############ SEED', s, '############');
    const errCount = await run(s);
    totalErrors += errCount;
    if (errCount > 0) {
      console.log('Stopping due to errors with seed', s);
      break;
    }
    errors.length = 0; // reset between runs
  }
  console.log('\nTotal seeds run:', seeds.length, 'Total errors:', totalErrors);
  process.exit(totalErrors > 0 ? 1 : 0);
})();
