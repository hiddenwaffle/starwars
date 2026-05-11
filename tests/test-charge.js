// Stage the charge scenario via window.__charge_test, then issue CHARGE
// SABRE and watch the message output. Expectation: each follower (princess,
// wookie) should be prompted "DO YOU WANT ... TO SHOOT, ATTACK OR DO
// NOTHING" after the player's attack lands.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'star-wars-1979.html'), 'utf8');

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const param = { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} };
    return { type: '', frequency: param, connect: (n) => n || ({ connect: () => {} }), start: () => {}, stop: () => {} };
  }
  createGain() {
    const param = { value: 0, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, cancelScheduledValues: () => {} };
    return { gain: param, connect: (n) => n || ({ connect: () => {} }) };
  }
  resume() { return Promise.resolve(); }
}

const errors = [];

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.addEventListener('error', e => errors.push('window.error: ' + (e.error ? (e.error.stack || e.error.message) : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await wait(200);

  const messages = document.getElementById('messages');
  const findInput = () => messages ? messages.querySelector('input.term-input') : null;

  async function waitForInput(timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const inp = findInput();
      if (inp) return inp;
      await wait(20);
    }
    return null;
  }

  async function sendCommand(cmd) {
    const inp = await waitForInput(2000);
    if (!inp) throw new Error('No input prompt for "' + cmd + '"');
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(80);
  }

  // Title screen + name
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  await sendCommand('CADET');
  // Briefing dismissals
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(150);

  // Stage the scenario.
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await wait(80);

  console.log('=== STATUS AFTER STAGING ===');
  console.log(document.getElementById('status').textContent);

  // Issue CHARGE SABRE; the player attack should land, then we expect a
  // prompt asking what Princess Leia should do.
  const inp = await waitForInput(2000);
  if (!inp) { console.log('NO INPUT before CHARGE'); return finalize(); }
  const lengthBefore = messages.textContent.length;
  inp.value = 'CHARGE SABRE';
  inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  // Let it settle long enough for sub-prompt to appear, then handle
  // follower prompts (answer N = "do nothing" each time).
  for (let i = 0; i < 5; i++) {
    await wait(120);
    const cur = findInput();
    if (!cur) continue;
    // Look at the prompt text
    const promptText = messages.textContent.slice(lengthBefore);
    const lastLines = promptText.split('\n').slice(-6).join(' / ');
    console.log('[input present, last lines]: ' + lastLines);
    cur.value = 'N';
    cur.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  const after = messages.textContent.slice(lengthBefore);
  console.log('=== FULL OUTPUT AFTER CHARGE SABRE ===');
  console.log(after);
  console.log('=== END FULL OUTPUT ===');

  console.log('=== PROMPT MARKERS ===');
  console.log('Has "DO YOU WANT": ' + after.includes('DO YOU WANT'));
  console.log('Has "PRINCESS LEIA": ' + after.includes('PRINCESS LEIA'));
  console.log('Has "WOOKIE": ' + after.includes('WOOKIE'));
  console.log('Has "ATTACKING": ' + after.includes('ATTACKING'));

  finalize();

  function finalize() {
    console.log('=== ERRORS ===');
    if (errors.length === 0) console.log('(none)');
    else for (const e of errors) console.log(e);
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
