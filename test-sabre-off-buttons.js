// Verifies the fix for: clicking SABRE in CHARGE while sabre is off
// dropped the user into a retry loop the buttons couldn't satisfy.
// New behavior: SABRE buttons in both ATTACK and CHARGE are hidden
// while sabre is off, so the user can't enter that path via clicks.
// The typed-command path is unchanged (CHARGE SABRE typed while off
// still triggers BASIC's retry prompt — that fidelity is intentional).

const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');

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

  // Title + name + briefings.
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  await sendCommand('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(150);

  // Stage charge scenario (sabre starts ON).
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await wait(80);

  const attackSabre = document.querySelector('button[data-cmd="ATTACK SABRE"]');
  const chargeSabre = document.querySelector('button[data-charge-pick="player:S"]');
  const visible = el => el && el.style.display !== 'none';

  console.log('--- with sabre ON ---');
  console.log('ATTACK SABRE visible:', visible(attackSabre));
  console.log('CHARGE YOU SABRE visible:', visible(chargeSabre));
  const onOK = visible(attackSabre) && visible(chargeSabre);

  // Turn the sabre off.
  await sendCommand('SABRE');
  await wait(120);

  console.log('--- with sabre OFF ---');
  console.log('ATTACK SABRE visible:', visible(attackSabre));
  console.log('CHARGE YOU SABRE visible:', visible(chargeSabre));
  const offOK = !visible(attackSabre) && !visible(chargeSabre);

  // Typed CHARGE SABRE while sabre off should still trigger the BASIC
  // retry prompt — that path is the manual-input flow and shouldn't
  // change. We verify the retry prompt text appears in messages.
  const lenBefore = messages.textContent.length;
  await sendCommand('CHARGE SABRE');
  await wait(150);
  const after = messages.textContent.slice(lenBefore);
  const sawRetry = after.includes('WANT TO ATTACK WITH');
  const sawSabreOffMsg = after.includes('TURN ON');
  console.log('typed CHARGE SABRE saw sabre-off msg:', sawSabreOffMsg);
  console.log('typed CHARGE SABRE saw retry prompt:', sawRetry);

  // Get out of the retry loop by typing H.
  await sendCommand('H');
  await wait(100);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  process.exit((errors.length === 0 && onOK && offOK && sawRetry && sawSabreOffMsg) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(2); });
