// Stage charge scenario, then click princess column 'NOTHING', player column
// 'SABRE', wookie column 'NOTHING'. Verify: (a) menu auto-fires after the
// last selection, (b) the player attack lands and (c) NO interactive
// follower prompts appear (their actions came from the menu).

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

  // Title screen + name + briefings
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  await sendCommand('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(60);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(150);

  // Stage charge scenario.
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await wait(80);

  // Open the CHARGE menu by clicking the trigger.
  const trigger = document.querySelector('#wrap-charge .menu-trigger');
  if (!trigger) { console.log('FAIL: no charge trigger'); return finalize(); }
  trigger.click();
  await wait(40);

  // Verify menu is open and all 3 columns are visible.
  const chargeMenu = document.querySelector('#wrap-charge .menu');
  if (!chargeMenu.classList.contains('open')) { console.log('FAIL: menu did not open'); return finalize(); }
  const cols = document.querySelectorAll('#wrap-charge .charge-col');
  console.log('column count:', cols.length);
  cols.forEach(c => {
    console.log('  col', c.dataset.chargeCol, 'visible:', c.style.display !== 'none');
  });

  const lengthBefore = messages.textContent.length;

  // Click princess: NOTHING, then player: SABRE, then wookie: NOTHING.
  function clickPick(key) {
    const b = document.querySelector('button[data-charge-pick="' + key + '"]');
    if (!b) throw new Error('button not found: ' + key);
    b.click();
  }
  console.log('--- click princess:N');
  clickPick('princess:N');
  await wait(40);
  console.log('  menu still open?', chargeMenu.classList.contains('open'));
  console.log('--- click wookie:N');
  clickPick('wookie:N');
  await wait(40);
  console.log('  menu still open?', chargeMenu.classList.contains('open'));
  console.log('--- click player:S (this is the last; should auto-fire)');
  clickPick('player:S');
  await wait(200);
  console.log('  menu still open?', chargeMenu.classList.contains('open'));

  // Inspect output.
  const after = messages.textContent.slice(lengthBefore);
  console.log('=== OUTPUT AFTER MENU FIRE ===');
  console.log(after);

  console.log('=== CHECKS ===');
  console.log('Has "ATTACKING" (player attack):', after.includes('ATTACKING'));
  console.log('Has "DO YOU WANT" (interactive prompt — should be FALSE):', after.includes('DO YOU WANT'));
  console.log('Has "CHARGE SABRE" (the injected command echo):', after.includes('CHARGE SABRE'));

  finalize();

  function finalize() {
    console.log('=== ERRORS ===');
    if (errors.length === 0) console.log('(none)');
    else for (const e of errors) console.log(e);
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
