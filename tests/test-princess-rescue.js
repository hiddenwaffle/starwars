// Princess-rescue path test. Uses the RESCUE TEST debug button (revealed
// via the pi-toggle) to stage princess as "lost" in room 2, then drives
// the player through the rescue -> escape -> take-off sequence and
// verifies the WITH THE PRINCESS! bonus appears in the endgame score.

const { createGame } = require('./harness');

async function run() {
  const g = createGame(314);
  const { document, errors, messages, wait, sendCommand, waitForText } = g;

  await g.boot('CADET');

  // Stage rescue scenario via the dev button (revealed by pi-toggle).
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('rescue-test-btn').click();

  // Move east to find princess. enterRoom clears the messages pane on
  // transition, so check current text directly rather than slicing.
  await sendCommand('MOVE EAST');
  const afterMove = messages.textContent;
  const sawPrincessFound = afterMove.includes('YOU FOUND THE PRINCESS');
  console.log('Found princess on east move:', sawPrincessFound);

  if (!sawPrincessFound) {
    console.log('=== MESSAGE TAIL ===');
    console.log(messages.textContent.slice(-600));
    process.exit(1);
  }

  // Walk back to the Hangar.
  await sendCommand('MOVE WEST');

  // Take off. enterRoom on MOVE WEST cleared the pane, so capture after
  // that; the takeoff sequence itself doesn't clear.
  const lenBeforeTakeoff = messages.textContent.length;
  await sendCommand('TAKE-OFF');
  await waitForText('FINAL SCORE', 5000);
  const afterTakeoff = messages.textContent.slice(lenBeforeTakeoff);
  const sawEscape   = afterTakeoff.includes('TRACTOR BEAM IS INOPERABLE') ||
                      afterTakeoff.includes('LET\'S SEE HOW YOU DID');
  const sawPrincess = afterTakeoff.includes('WITH THE PRINCESS!');
  const sawFinal    = afterTakeoff.includes('FINAL SCORE');

  console.log('Reached endgame:', sawFinal);
  console.log('WITH THE PRINCESS! bonus:', sawPrincess);
  console.log('=== TAKEOFF OUTPUT (full) ===');
  console.log(afterTakeoff);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  const ok = errors.length === 0 && sawPrincessFound && sawFinal && sawPrincess;
  process.exit(ok ? 0 : 1);
}
run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
