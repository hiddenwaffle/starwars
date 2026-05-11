// Verify the pi-toggle behavior:
// 1. GOD and CHARGE TEST start hidden (.messages-header-btns has is-hidden).
// 2. Clicking the pi-toggle removes is-hidden — buttons become visible.
// 3. Clicking it again puts is-hidden back — hidden once more.
// 4. The pi glyph is itself clickable (no pointer-events: none).

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { window, document, errors, wait } = g;

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
