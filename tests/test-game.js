// Headless test harness for the Star Wars 1979 port (v2).
// The input element is created dynamically per-prompt; we watch for it.

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

async function run() {
  // Deterministic RNG so the sequence of soldier shots, Vader moves, etc.
  // doesn't randomly kill the player partway through and trash the test.
  // Chosen by trying values until the player survives the command sequence.
  let s = 42;
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

  function pressKey(key) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  }

  async function waitForInput(timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return null;
      const inp = findInput();
      if (inp) return inp;
      await wait(20);
    }
    return null;
  }

  async function sendCommand(cmd) {
    const inp = await waitForInput(2000);
    if (!inp) {
      throw new Error('No input prompt appeared for "' + cmd + '". Tail: ' + getMessages().slice(-200));
    }
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(50);
  }

  async function pressAnyKey() {
    await wait(50);
    pressKey('Space');
    await wait(40);
  }

  await pressAnyKey();
  try { await sendCommand('TESTER'); } catch (e) { console.log('NAME FAIL:', e.message); return finalize(); }
  await pressAnyKey();
  await pressAnyKey();
  await wait(150);

  console.log('=== INITIAL STATUS ===');
  console.log(getStatus());
  console.log('=== INITIAL MESSAGES (tail 600) ===');
  console.log(getMessages().slice(-600));

  const commands = [
    'L', 'SABRE', 'SABRE', 'A H', 'GET A', 'M N', 'M E', 'M W', 'M S',
    '?', 'TOSS', 'SWING', 'SAB', 'TA', 'GIVE P S', 'O W S', 'F', 'L', 'C H'
  ];

  for (const c of commands) {
    if (document.body.classList.contains('game-over')) {
      console.log('Game ended; stopping command loop. (last cmd: previous)');
      break;
    }
    try {
      await sendCommand(c);
      await wait(80);
    } catch (e) {
      console.log('FAIL on cmd "' + c + '": ' + e.message);
      break;
    }
    if (errors.length > 0) {
      console.log('Stopped due to error after cmd "' + c + '"');
      break;
    }
  }

  finalize();

  function finalize() {
    console.log('\n=== FINAL STATUS ===');
    console.log(getStatus());
    console.log('\n=== FINAL MESSAGES (tail 1500) ===');
    console.log(getMessages().slice(-1500));
    console.log('\n=== ERRORS ===');
    if (errors.length === 0) console.log('(none)');
    else for (const e of errors) console.log(e);
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

run().catch(e => {
  console.error('Test harness error:', e);
  for (const er of errors) console.log(er);
  process.exit(2);
});
