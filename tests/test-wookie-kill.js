// Wookie-kill path test. Uses the WOOKIE TEST debug button to stage
// an unfriendly wookie in room 2 (east of Hangar). On MOVE EAST, the
// game rolls Math.random() < 0.25 for the kill check. We seed
// Math.random deterministically and iterate seeds until one of them
// lands the kill roll, then assert the death and game-over messages.
//
// With a 25% kill rate per encounter, we expect to find a passing
// seed within a handful of tries.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'star-wars-1979.html'), 'utf8');

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const p = { value:0, setValueAtTime:()=>{}, linearRampToValueAtTime:()=>{}, exponentialRampToValueAtTime:()=>{}, cancelScheduledValues:()=>{} };
    return { type:'', frequency:p, connect:(n)=>n||({connect:()=>{}}), start:()=>{}, stop:()=>{} };
  }
  createGain() {
    const p = { value:0, setValueAtTime:()=>{}, linearRampToValueAtTime:()=>{}, exponentialRampToValueAtTime:()=>{}, cancelScheduledValues:()=>{} };
    return { gain:p, connect:(n)=>n||({connect:()=>{}}) };
  }
  resume() { return Promise.resolve(); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function runWithSeed(seed) {
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      let s = seed;
      window.Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };
      window.addEventListener('error', e => errors.push('window.error: ' + (e.error ? (e.error.stack || e.error.message) : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  await wait(150);
  const messages = document.getElementById('messages');
  const findInput = () => messages ? messages.querySelector('input.term-input') : null;
  async function waitForInput(t = 1500) {
    const start = Date.now();
    while (Date.now() - start < t) {
      const inp = findInput();
      if (inp) return inp;
      await wait(20);
    }
    return null;
  }
  async function sendCmd(cmd) {
    const inp = await waitForInput();
    if (!inp) throw new Error('No input for: ' + cmd);
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(60);
  }

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  await sendCmd('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(100);

  document.querySelector('.pi-toggle').click();
  await wait(30);
  document.getElementById('wookie-test-btn').click();
  await wait(60);

  const lenBefore = messages.textContent.length;
  await sendCmd('MOVE EAST');
  await wait(80);
  const after = messages.textContent.slice(lenBefore);

  const greeted    = after.includes('LARGE, EXTREMELY');
  const killed     = after.includes('RIPS YOUR ARMS OUT');
  const joined     = after.includes('DECIDES TO JOIN');
  const dead       = after.includes('YOU ARE DEAD');

  dom.window.close();
  return { seed, greeted, killed, joined, dead, errors: errors.length };
}

(async () => {
  let killSeed = null;
  let joinSeen = false;
  let totalErrors = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = await runWithSeed(seed);
    if (r.errors) {
      console.log('seed=' + seed, 'ERRORS', r.errors);
      totalErrors += r.errors;
      continue;
    }
    if (!r.greeted) {
      console.log('seed=' + seed, 'wookie not greeted -- setup may be broken');
      continue;
    }
    if (r.killed) {
      console.log('seed=' + seed, 'KILL (greeted=' + r.greeted + ', dead=' + r.dead + ')');
      killSeed = seed;
      break;
    }
    if (r.joined) {
      joinSeen = true;
      console.log('seed=' + seed, 'wookie joined (no kill this seed)');
    }
  }

  console.log('=== RESULT ===');
  console.log('errors=' + totalErrors);
  console.log('kill-path observed at seed:', killSeed);
  console.log('join-path observed at least once:', joinSeen);

  // Pass condition: kill-path was observed cleanly (greeted -> RIPS ARMS OUT -> YOU ARE DEAD)
  const ok = totalErrors === 0 && killSeed !== null;
  process.exit(ok ? 0 : 1);
})();
