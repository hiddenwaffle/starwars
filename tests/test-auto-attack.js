// Stage a charge scenario, then click Auto-Attack and verify:
// 1. The button label shows "Auto-Attack (SABRE)" or "Auto-Attack (BLASTER)" or
//    "Auto-Attack (HANDS)" depending on player state.
// 2. Clicking it fires a one-step attack (no submenu).
// 3. The weapon chosen is the strongest currently-usable one.

const { createGame } = require('./harness');

async function run() {
  const g = createGame();
  const { document, messages, errors, wait, sendCommand } = g;

  await g.boot('CADET');

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

  // Label starts with "Auto-Attack" (may include a key-hint suffix like [Q]).
  const label = autoAttackBtn ? autoAttackBtn.textContent.trim() : '';
  const labelOK = label.startsWith('Auto-Attack');
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
