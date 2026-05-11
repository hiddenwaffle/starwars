// Aggressive playthrough. Wanders rooms, fights, tries to get into combat.
const { createGame } = require('./harness');

async function run(seed) {
  const g = createGame(seed);
  await g.boot();

  // Random wander + attack loop. Try to maximize coverage.
  const dirs = ['N', 'E', 'W', 'S'];
  const wpns = ['S', 'B', 'H'];
  let turns = 0;
  let lastStatus = '';
  while (turns++ < 80) {
    if (g.errors.length > 0) break;

    const stat = g.getStatus();
    const inGame = stat && stat.includes('DOORS OPEN');
    if (!inGame) break;

    // Detect end of game
    const mtail = g.getMessages().slice(-200);
    if (mtail.includes('FINAL SCORE') || mtail.includes('PRESS RESTART')) break;

    // Pick command based on what's in the room
    let cmd;
    const r = g.seededRand();
    if (stat.includes('IMPERIAL SOLDIER') || stat.includes('DARTH VADER') || (stat.match(/(\d+) SOLDIERS/) && parseInt(stat.match(/(\d+) SOLDIERS/)[1]) > 0)) {
      // Enemy in room — attack
      if (!stat.includes('SABRE ON') && r < 0.3) cmd = 'SABRE';
      else if (r < 0.6) cmd = 'A S';     // attack with sabre
      else if (r < 0.85) cmd = 'A H';    // hands
      else cmd = 'F';                     // flee
    } else {
      // No enemies — wander, pick up, sabotage, etc.
      if (r < 0.05) cmd = 'L';
      else if (r < 0.10) cmd = '?';
      else if (r < 0.15) cmd = 'GET A';
      else if (r < 0.20) cmd = 'SAB';
      else if (r < 0.25) cmd = 'TOSS';
      else if (r < 0.30) cmd = 'SWING';
      else if (r < 0.35) cmd = 'TA';
      else cmd = 'M ' + dirs[Math.floor(g.seededRand() * 4)];
    }

    const ok = await g.sendCommand(cmd).then(() => true).catch(() => false);
    if (!ok) {
      // No input prompt - probably mid-output or briefing or anyKey
      // Try pressing space in case we're at an anyKey
      await g.pressAnyKey();
      await g.wait(100);
      // If still not back, break
      const inp = g.findInput();
      if (!inp) {
        const tail = g.getMessages().slice(-150);
        if (tail.includes('FINAL SCORE') || tail.includes('PRESS RESTART')) break;
        // Stuck somewhere — print state and bail
        console.log('STUCK at turn', turns, '- tail:', tail);
        break;
      }
    }
    await g.wait(50);
    lastStatus = stat;
  }

  console.log('=== Seed:', seed, ' Turns played:', turns, '===');
  console.log('=== FINAL STATUS ===');
  console.log(g.getStatus());
  console.log('=== FINAL MESSAGES (tail 800) ===');
  console.log(g.getMessages().slice(-800));
  console.log('=== ERRORS ===');
  if (g.errors.length === 0) console.log('(none)');
  else for (const e of g.errors) console.log(e);

  return g.errors.length;
}

(async () => {
  // Run with multiple seeds to exercise different random states
  const seeds = [42, 1234, 7, 999, 333];
  let totalErrors = 0;
  for (const s of seeds) {
    console.log('\n############ SEED', s, '############');
    const errCount = await run(s);
    totalErrors += errCount;
    if (errCount > 0) {
      console.log('Stopping due to errors with seed', s);
      break;
    }
  }
  console.log('\nTotal seeds run:', seeds.length, 'Total errors:', totalErrors);
  process.exit(totalErrors > 0 ? 1 : 0);
})();
