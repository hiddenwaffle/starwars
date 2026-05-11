// Verify that selecting princess: ATTACK results in princess attacking,
// not "doing nothing". Picks: princess=A, player=H (hands), wookie=N.

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
  async function waitForInput(t = 2000) {
    const start = Date.now();
    while (Date.now() - start < t) {
      const inp = findInput();
      if (inp) return inp;
      await wait(20);
    }
    return null;
  }
  async function sendCommand(cmd) {
    const inp = await waitForInput(2000);
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(80);
  }

  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  await sendCommand('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(150);

  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await wait(80);

  const trigger = document.querySelector('#wrap-charge .menu-trigger');
  trigger.click();
  await wait(40);

  const lengthBefore = messages.textContent.length;
  function clickPick(key) {
    const b = document.querySelector('button[data-charge-pick="' + key + '"]');
    b.click();
  }

  // Run several seeds-worth: take many samples by trying repeatedly.
  // We just want to see that ATTACK actually attempts an attack at least
  // once (no "PRINCESS LEIA HAS NO BLASTER" text expected for ATTACK).
  clickPick('princess:A');
  await wait(20);
  clickPick('wookie:A');
  await wait(20);
  clickPick('player:H');
  await wait(250);

  const after = messages.textContent.slice(lengthBefore);
  console.log('=== OUTPUT ===');
  console.log(after);

  // After CHARGE HANDS with princess=A and wookie=A, BOTH followers should
  // attack (HANDS / hp/2). The output should show three "ATTACKING" lines
  // (player, princess, wookie) in BASIC's combat style.
  const attackingCount = (after.match(/ATTACKING /g) || []).length;
  console.log('ATTACKING lines:', attackingCount);
  console.log('Expected at least 3 (player + princess + wookie):', attackingCount >= 3);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  process.exit((errors.length === 0 && attackingCount >= 3) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(2); });
