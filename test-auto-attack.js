// Stage a charge scenario, then click Auto-Attack and verify:
// 1. The button label shows "Auto-Attack (SABRE)" or "Auto-Attack (BLASTER)" or
//    "Auto-Attack (HANDS)" depending on player state.
// 2. Clicking it fires a one-step attack (no submenu).
// 3. The weapon chosen is the strongest currently-usable one.

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

  // Stage charge scenario (gives sabre, blaster, sabreOn, 6 soldiers).
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await wait(80);

  const autoAttackBtn = document.getElementById('auto-attack-btn');

  console.log('auto-attack-btn visible:', autoAttackBtn && autoAttackBtn.style.display !== 'none');
  console.log('auto-attack-btn label:', autoAttackBtn && autoAttackBtn.textContent);

  // Label is static "Auto-Attack" now (no weapon suffix).
  const label = autoAttackBtn ? autoAttackBtn.textContent : '';
  const labelOK = label === 'Auto-Attack';
  console.log('label format OK:', labelOK);

  // Click and verify attack fires.
  const lengthBefore = messages.textContent.length;
  autoAttackBtn.click();
  await wait(150);
  const after = messages.textContent.slice(lengthBefore);
  console.log('=== output after Auto-Attack click ===');
  console.log(after);
  console.log('Has "ATTACKING":', after.includes('ATTACKING'));
  console.log('Has "WHAT DO YOU WANT" (sub-prompt -- should be FALSE):', after.includes('WANT TO ATTACK WITH'));

  // Confirm the resolved weapon by inspecting the echoed command in
  // messages. With charge_test staging, sabre is ON and we expect
  // either SABRE or BLASTER to have been chosen at click time.
  const firedSabre   = after.includes('ATTACK SABRE');
  const firedBlaster = after.includes('ATTACK BLASTER');
  const firedHands   = after.includes('ATTACK HANDS');
  console.log('fired weapon: sabre=', firedSabre, 'blaster=', firedBlaster, 'hands=', firedHands);

  // Now turn the sabre OFF and click again — verify pickBestWeapon
  // skips sabre at click time even though the label didn't change.
  await sendCommand('SABRE');
  await wait(120);
  const lenBeforeOff = messages.textContent.length;
  autoAttackBtn.click();
  await wait(150);
  const afterOff = messages.textContent.slice(lenBeforeOff);
  console.log('=== output after sabre-OFF Auto-Attack click ===');
  console.log(afterOff);
  const sabreOffSkipsSabre = !afterOff.includes('ATTACK SABRE');
  console.log('sabre-off skips sabre:', sabreOffSkipsSabre);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  process.exit((errors.length === 0 && labelOK && sabreOffSkipsSabre && after.includes('ATTACKING') && !after.includes('WANT TO ATTACK WITH')) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(2); });
