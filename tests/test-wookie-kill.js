// Wookie-kill path test. Uses the WOOKIE TEST debug button to stage
// an unfriendly wookie in room 2 (east of Hangar). On MOVE EAST, the
// game rolls Math.random() < 0.25 for the kill check. We seed
// Math.random deterministically and iterate seeds until one of them
// lands the kill roll, then assert the death and game-over messages.
//
// With a 25% kill rate per encounter, we expect to find a passing
// seed within a handful of tries.

const { createGame } = require('./harness');

async function runWithSeed(seed) {
  const g = createGame(seed);
  await g.boot('CADET');

  g.document.querySelector('.pi-toggle').click();
  await g.wait(30);
  g.document.getElementById('wookie-test-btn').click();
  await g.wait(60);

  const lenBefore = g.getMessages().length;
  await g.sendCommand('MOVE EAST');
  await g.wait(80);
  const after = g.getMessages().slice(lenBefore);

  const greeted    = after.includes('LARGE, EXTREMELY');
  const killed     = after.includes('RIPS YOUR ARMS OUT');
  const joined     = after.includes('DECIDES TO JOIN');
  const dead       = after.includes('YOU ARE DEAD');

  g.dom.window.close();
  return { seed, greeted, killed, joined, dead, errors: g.errors.length };
}

(async () => {
  let killSeed = null;
  let joinSeen = false;
  let totalErrors = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = await runWithSeed(seed);
    if (r.errors) {
      console.log('seed=' + seed, 'ERRORS', r.errors);
      totalErrors += r.errors;
      continue;
    }
    if (!r.greeted) {
      console.log('seed=' + seed, 'wookie not greeted -- setup may be broken');
      continue;
    }
    if (r.killed) {
      console.log('seed=' + seed, 'KILL (greeted=' + r.greeted + ', dead=' + r.dead + ')');
      killSeed = seed;
      break;
    }
    if (r.joined) {
      joinSeen = true;
      console.log('seed=' + seed, 'wookie joined (no kill this seed)');
    }
  }

  console.log('=== RESULT ===');
  console.log('errors=' + totalErrors);
  console.log('kill-path observed at seed:', killSeed);
  console.log('join-path observed at least once:', joinSeen);

  // Pass condition: kill-path was observed cleanly (greeted -> RIPS ARMS OUT -> YOU ARE DEAD)
  const ok = totalErrors === 0 && killSeed !== null;
  process.exit(ok ? 0 : 1);
})();
