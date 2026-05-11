// Stage charge scenario, then click princess column 'NOTHING', player column
// 'SABRE', wookie column 'NOTHING'. Verify: (a) menu auto-fires after the
// last selection, (b) the player attack lands and (c) NO interactive
// follower prompts appear (their actions came from the menu).

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, messages, errors, wait } = g;

  await g.boot('CADET');

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
