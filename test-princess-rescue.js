// Princess-rescue path test. Uses the RESCUE TEST debug button (revealed
// via the pi-toggle) to stage princess as "lost" in room 2, then drives
// the player through the rescue → escape → take-off sequence and
// verifies the WITH THE PRINCESS! bonus appears in the endgame score.

const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');

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
const errors = [];

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      // Make randomness deterministic enough that the per-turn machinery
      // (Vader move, soldier shots) doesn't accidentally kill us in the
      // few turns this test runs. Vader was placed at room 22 by the
      // setup; he'll wander but won't reach us in 3 turns.
      let s = 314;
      window.Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };
      window.addEventListener('error', e => errors.push('window.error: ' + (e.error ? (e.error.stack || e.error.message) : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  await wait(200);
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

  // Boot.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  await sendCmd('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(120);

  // Stage rescue scenario via the dev button (revealed by pi-toggle).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('rescue-test-btn').click();
  await wait(80);

  // Move east to find princess.
  const lenBeforeMove = messages.textContent.length;
  await sendCmd('MOVE EAST');
  const afterMove = messages.textContent.slice(lenBeforeMove);
  const sawPrincessFound = afterMove.includes('YOU FOUND THE PRINCESS');
  console.log('Found princess on east move:', sawPrincessFound);

  if (!sawPrincessFound) {
    console.log('=== MESSAGE TAIL ===');
    console.log(messages.textContent.slice(-600));
    process.exit(1);
  }

  // Walk back to the Hangar.
  await sendCmd('MOVE WEST');
  await wait(60);

  // Take off.
  const lenBeforeTakeoff = messages.textContent.length;
  await sendCmd('TAKE-OFF');
  await wait(150);
  const afterTakeoff = messages.textContent.slice(lenBeforeTakeoff);
  const sawEscape   = afterTakeoff.includes('TRACTOR BEAM IS INOPERABLE') ||
                      afterTakeoff.includes('LET\'S SEE HOW YOU DID');
  const sawPrincess = afterTakeoff.includes('WITH THE PRINCESS!');
  const sawFinal    = afterTakeoff.includes('FINAL SCORE');

  console.log('Reached endgame:', sawFinal);
  console.log('WITH THE PRINCESS! bonus:', sawPrincess);
  console.log('=== TAKEOFF OUTPUT (full) ===');
  console.log(afterTakeoff);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  const ok = errors.length === 0 && sawPrincessFound && sawFinal && sawPrincess;
  process.exit(ok ? 0 : 1);
}
run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
