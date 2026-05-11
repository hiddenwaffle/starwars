// Test that the new palette buttons inject the right commands.
const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');
const errors = [];

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    return {
      type: '', frequency: { value: 0 },
      connect: (n) => n || ({ connect: () => {} }),
      start: () => {}, stop: () => {}
    };
  }
  createGain() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {}
    };
    return { gain: param, connect: (n) => n || ({ connect: () => {} }) };
  }
  resume() { return Promise.resolve(); }
}

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.addEventListener('error', e => errors.push('error: ' + (e.error ? e.error.stack || e.error.message : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(150);

  const messages = document.getElementById('messages');
  const status = document.getElementById('status');
  const palette = document.getElementById('palette');
  const findInput = () => messages.querySelector('input.term-input');

  function pressKey(key) {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  }
  function clickEl(el) {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  async function pressAnyKey() { await wait(40); pressKey('Space'); await wait(40); }
  async function waitForInput(t = 1000) {
    const start = Date.now();
    while (Date.now() - start < t) {
      const inp = findInput();
      if (inp) return inp;
      await wait(15);
    }
    return null;
  }

  await pressAnyKey();
  const inp1 = await waitForInput();
  if (inp1) {
    inp1.value = 'TESTER';
    inp1.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(40);
  }
  await pressAnyKey();
  await pressAnyKey();
  await wait(150);

  // Now in main loop. Inventory the palette buttons we expect.
  const allCmdButtons = Array.from(palette.querySelectorAll('button[data-cmd]'));
  console.log('Total data-cmd buttons:', allCmdButtons.length);
  console.log('Their data-cmd values:');
  for (const b of allCmdButtons) {
    console.log('  "' + b.dataset.cmd + '" -> "' + b.textContent.trim() + '"');
  }

  // Inventory dropdowns (menu-wrap)
  const wraps = Array.from(document.querySelectorAll('.menu-wrap'));
  console.log('\nDropdowns:', wraps.length);
  for (const w of wraps) {
    const trigger = w.querySelector('button');
    console.log('  Trigger: "' + trigger.textContent.trim() + '"');
  }

  // Now click each non-dropdown command button (those that send a real command)
  // and verify it gets dispatched. We'll only click ones that are safe in
  // the starting room (LOOK, ?, SABRE, FLEE, TOSS, SWING, SAB, TA).
  const safeCmds = ['L', 'SABRE', 'F', 'TOSS', 'SWING', 'SAB', 'TA'];
  const tail = () => messages.textContent.slice(-300);
  for (const cmd of safeCmds) {
    if (errors.length) break;
    const btn = allCmdButtons.find(b => b.dataset.cmd === cmd);
    if (!btn) { console.log('No button for cmd:', cmd); continue; }
    await waitForInput();
    const before = messages.textContent.length;
    clickEl(btn);
    await wait(80);
    const after = messages.textContent.slice(before);
    console.log('Clicked', cmd, '->', JSON.stringify(after.slice(0, 100)));
  }

  // Now test a dropdown: open ATTACK menu, click HANDS
  const attackWrap = wraps.find(w => /ATTACK/.test(w.querySelector('button').textContent));
  if (attackWrap) {
    await waitForInput();
    clickEl(attackWrap.querySelector('button'));      // open menu
    await wait(40);
    const hBtn = attackWrap.querySelector('button[data-cmd="A H"]');
    if (hBtn) {
      const before = messages.textContent.length;
      clickEl(hBtn);
      await wait(80);
      console.log('Clicked ATTACK ▾ HANDS ->', JSON.stringify(messages.textContent.slice(before, before + 200)));
    } else {
      console.log('No A H button found');
    }
  } else {
    console.log('No ATTACK dropdown found');
  }

  // Test ORDER menu (princess won't be there, expect "ISN'T HERE" or similar)
  const orderWrap = wraps.find(w => /ORDER/.test(w.querySelector('button').textContent));
  if (orderWrap) {
    await waitForInput();
    clickEl(orderWrap.querySelector('button'));
    await wait(40);
    const opwBtn = orderWrap.querySelector('button[data-cmd="O P W"]');
    if (opwBtn) {
      const before = messages.textContent.length;
      clickEl(opwBtn);
      await wait(80);
      console.log('Clicked ORDER ▾ P:WAIT ->', JSON.stringify(messages.textContent.slice(before, before + 200)));
    }
  }

  console.log('\n=== ERRORS ===');
  if (errors.length === 0) console.log('(none)');
  else for (const e of errors) console.log(e);
  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test harness error:', e);
  for (const er of errors) console.log(er);
  process.exit(2);
});
