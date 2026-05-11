// Test palette visibility: which buttons are shown in different states.
const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');
const errors = [];

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() { return { type: '', frequency: { value: 0 }, connect: (n) => n || ({ connect: () => {} }), start: () => {}, stop: () => {} }; }
  createGain() {
    const param = { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} };
    return { gain: param, connect: (n) => n || ({ connect: () => {} }) };
  }
  resume() { return Promise.resolve(); }
}

async function run(seed) {
  let s = seed;
  const seededRand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.Math.random = seededRand;
      window.addEventListener('error', e => errors.push('error: ' + (e.error ? e.error.stack || e.error.message : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(150);

  const messages = document.getElementById('messages');
  const palette = document.getElementById('palette');
  const findInput = () => messages.querySelector('input.term-input');

  const pressKey = key => document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  const clickEl = el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  async function pressAnyKey() { await wait(40); pressKey('Space'); await wait(40); }
  async function waitForInput(t = 1500) {
    const start = Date.now();
    while (Date.now() - start < t) {
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

  function visibleButtons() {
    const result = { plain: [], wraps: [] };
    palette.querySelectorAll('button[data-cmd]').forEach(b => {
      // Check if button itself or any ancestor menu-wrap is hidden
      let el = b;
      let hidden = false;
      while (el && el !== palette) {
        const style = el.style.display;
        if (style === 'none') { hidden = true; break; }
        el = el.parentElement;
      }
      // Check button's own data-cmd visibility (for sub-menu options) — but only count
      // top-level buttons (not inside menu-wraps) and visible wraps
      const cmd = b.dataset.cmd;
      if (!hidden && cmd) result.plain.push(cmd);
    });
    palette.querySelectorAll('.menu-wrap').forEach(w => {
      if (w.style.display !== 'none') {
        result.wraps.push(w.id || w.querySelector('button').textContent.trim());
      }
    });
    return result;
  }

  // Start the game
  await pressAnyKey();
  await sendCommand('TESTER');
  await pressAnyKey();
  await pressAnyKey();
  await wait(150);

  await waitForInput();

  const initial = visibleButtons();
  console.log('=== Seed', seed, '— Initial palette state ===');
  console.log('Plain buttons:', initial.plain);
  console.log('Visible dropdown wraps:', initial.wraps);

  // Status to identify state
  const status = document.getElementById('status').textContent;
  console.log('Room:', status.split('\n')[0].trim());
  console.log('Status (compressed):', status.replace(/\s+/g, ' ').slice(0, 200));

  return errors.length;
}

(async () => {
  let total = 0;
  for (const seed of [42, 100, 333, 17, 7]) {
    total += await run(seed);
    errors.length = 0;
    console.log();
  }
  process.exit(total > 0 ? 1 : 0);
})();
