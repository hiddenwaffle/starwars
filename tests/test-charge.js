// Stage the charge scenario via window.__charge_test, then issue CHARGE
// SABRE and watch the message output. Expectation: each follower (princess,
// wookie) should be prompted "DO YOU WANT ... TO SHOOT, ATTACK OR DO
// NOTHING" after the player's attack lands.

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, messages, errors, wait, findInput, waitForInput, clickEl } = g;

  await g.boot('CADET');

  // Stage the scenario.
  // Reveal the dev header via the pi-toggle, then click the
  // CHARGE TEST button to stage the scenario (matches the user-facing
  // path; __charge_test is no longer exposed on window).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('charge-test-btn').click();

  console.log('=== STATUS AFTER STAGING ===');
  console.log(g.getStatus());

  // Issue CHARGE SABRE; the player attack should land, then we expect a
  // prompt asking what Princess Leia should do.
  const inp = await waitForInput(3000);
  if (!inp) { console.log('NO INPUT before CHARGE'); return finalize(); }
  const lengthBefore = messages.textContent.length;
  inp.value = 'CHARGE SABRE';
  inp.dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  // Wait for each follower sub-prompt to appear, then answer N.
  for (let i = 0; i < 5; i++) {
    const cur = await waitForInput(3000);
    if (!cur) break;
    // Look at the prompt text
    const promptText = messages.textContent.slice(lengthBefore);
    const lastLines = promptText.split('\n').slice(-6).join(' / ');
    console.log('[input present, last lines]: ' + lastLines);
    cur.value = 'N';
    cur.dispatchEvent(new g.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  const after = messages.textContent.slice(lengthBefore);
  console.log('=== FULL OUTPUT AFTER CHARGE SABRE ===');
  console.log(after);
  console.log('=== END FULL OUTPUT ===');

  console.log('=== PROMPT MARKERS ===');
  console.log('Has "DO YOU WANT": ' + after.includes('DO YOU WANT'));
  console.log('Has "PRINCESS LEIA": ' + after.includes('PRINCESS LEIA'));
  console.log('Has "WOOKIE": ' + after.includes('WOOKIE'));
  console.log('Has "ATTACKING": ' + after.includes('ATTACKING'));

  finalize();

  function finalize() {
    console.log('=== ERRORS ===');
    if (errors.length === 0) console.log('(none)');
    else for (const e of errors) console.log(e);
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
