// Verifies the fix for: clicking SABRE in CHARGE while sabre is off
// dropped the user into a retry loop the buttons couldn't satisfy.
// New behavior: SABRE buttons in both ATTACK and CHARGE are hidden
// while sabre is off, so the user can't enter that path via clicks.
// The typed-command path is unchanged (CHARGE SABRE typed while off
// still triggers BASIC's retry prompt — that fidelity is intentional).

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, messages, errors, wait, sendCommand, waitForInput } = g;

  await g.boot('CADET');

  // Stage charge scenario (sabre starts ON).
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();
  await waitForInput(3000);

  const attackSabre = document.querySelector('button[data-cmd="ATTACK SABRE"]');
  const chargeSabre = document.querySelector('button[data-charge-pick="player:S"]');
  const visible = el => el && el.style.display !== 'none';

  console.log('--- with sabre ON ---');
  console.log('ATTACK SABRE visible:', visible(attackSabre));
  console.log('CHARGE YOU SABRE visible:', visible(chargeSabre));
  const onOK = visible(attackSabre) && visible(chargeSabre);

  // Turn the sabre off. SABRE is a free action — wait for the game to
  // loop back to the command prompt with updated palette state.
  await sendCommand('SABRE');
  await waitForInput(3000);

  console.log('--- with sabre OFF ---');
  console.log('ATTACK SABRE visible:', visible(attackSabre));
  console.log('CHARGE YOU SABRE visible:', visible(chargeSabre));
  const offOK = !visible(attackSabre) && !visible(chargeSabre);

  // Typed CHARGE SABRE while sabre off should still trigger the BASIC
  // retry prompt — that path is the manual-input flow and shouldn't
  // change. We verify the retry prompt text appears in messages.
  const lenBefore = messages.textContent.length;
  await sendCommand('CHARGE SABRE');
  // CHARGE SABRE with sabre off enters a retry prompt — wait for it.
  await waitForInput(3000);
  const after = messages.textContent.slice(lenBefore);
  const sawRetry = after.includes('WANT TO ATTACK WITH');
  const sawSabreOffMsg = after.includes('TURN ON');
  console.log('typed CHARGE SABRE saw sabre-off msg:', sawSabreOffMsg);
  console.log('typed CHARGE SABRE saw retry prompt:', sawRetry);

  // Get out of the retry loop by typing H (resolves CHARGE, turn consumed).
  await sendCommand('H');
  await waitForInput(5000);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  process.exit((errors.length === 0 && onOK && offOK && sawRetry && sawSabreOffMsg) ? 0 : 1);
}
run().catch(e => { console.error(e); process.exit(2); });
