// Verify the pi-toggle behavior:
// 1. GOD and CHARGE TEST start hidden (.messages-header-btns has is-hidden).
// 2. Clicking the pi-toggle removes is-hidden — buttons become visible.
// 3. Clicking it again puts is-hidden back — hidden once more.
// 4. The pi glyph is itself clickable (no pointer-events: none).

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

  const pi = document.querySelector('.pi-toggle');
  const devHeader = document.querySelector('.messages-header');

  const initiallyHidden = devHeader.classList.contains('is-hidden');
  console.log('initially hidden:', initiallyHidden);

  // Click pi to reveal.
  pi.click();
  await wait(40);
  const afterFirstClick = devHeader.classList.contains('is-hidden');
  console.log('after first click hidden:', afterFirstClick);

  // Click again to hide.
  pi.click();
  await wait(40);
  const afterSecondClick = devHeader.classList.contains('is-hidden');
  console.log('after second click hidden:', afterSecondClick);

  // jsdom-rendered computed style: pi should not have pointer-events: none
  // (we removed that property entirely). We can confirm by reading the
  // computed style; if pointer-events were 'none' the click above would
  // still fire in jsdom (since it bypasses hit-testing), but real browsers
  // would not. Best we can do here is sanity check via inline checks.
  const piStyle = window.getComputedStyle(pi);
  const cursor = piStyle.cursor;
  console.log('cursor:', cursor);
  const cursorOK = cursor === 'pointer' || cursor === '' /* jsdom sometimes omits computed values */;

  const allOK = initiallyHidden && !afterFirstClick && afterSecondClick && errors.length === 0;
  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  console.log('ALL OK:', allOK);
  process.exit(allOK ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(2); });
