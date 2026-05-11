// Test that the new palette buttons inject the right commands.
const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, palette, messages, wait, waitForInput, clickEl } = g;

  await g.boot();

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
    if (g.errors.length) break;
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
      console.log('Clicked ATTACK \u25be HANDS ->', JSON.stringify(messages.textContent.slice(before, before + 200)));
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
      console.log('Clicked ORDER \u25be P:WAIT ->', JSON.stringify(messages.textContent.slice(before, before + 200)));
    }
  }

  console.log('\n=== ERRORS ===');
  if (g.errors.length === 0) console.log('(none)');
  else for (const e of g.errors) console.log(e);
  process.exit(g.errors.length > 0 ? 1 : 0);
}

run().catch(e => {
  console.error('Test harness error:', e);
  process.exit(2);
});
