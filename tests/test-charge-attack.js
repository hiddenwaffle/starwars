// Verify that selecting princess: ATTACK results in princess attacking,
// not "doing nothing". Picks: princess=A, player=H (hands), wookie=N.

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, messages, errors, wait, waitForInput } = g;

  await g.boot('CADET');

  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await waitForInput(3000);

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
  await waitForInput(5000);

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
