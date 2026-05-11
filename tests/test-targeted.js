// Targeted: try to find equipment rooms, sabotage them, then escape.
const { createGame } = require('./harness');

async function run(seed) {
  const g = createGame(seed);
  await g.boot();

  // Heavy wander + sabotage when possible
  const dirs = ['N', 'E', 'W', 'S'];
  let turns = 0, sabotaged = 0, attacked = 0;
  let lastRoom = '';
  while (turns++ < 200) {
    if (g.errors.length > 0) break;
    const stat = g.getStatus();
    if (!stat.includes('DOORS OPEN')) break;
    const tail = g.getMessages().slice(-200);
    if (tail.includes('FINAL SCORE') || tail.includes('PRESS RESTART')) break;

    const isEquipRoom = stat.includes('EQUIPMENT--');
    const isHangar = stat.includes('HANGER DECK');
    const hasEnemies = (stat.match(/(\d+) SOLDIERS/) && parseInt(stat.match(/(\d+) SOLDIERS/)[1]) > 0) || stat.includes('P: DARTH VADER');
    const sabreOn = stat.includes('SABRE ON');

    let cmd;
    if (hasEnemies) {
      if (!sabreOn && g.seededRand() < 0.3) cmd = 'SABRE';
      else if (g.seededRand() < 0.7) cmd = 'A S';
      else cmd = 'A H';
      attacked++;
    } else if (isEquipRoom && stat.includes('UNDAMAGED')) {
      cmd = 'SAB';
      sabotaged++;
    } else if (isHangar && (stat.match(/EQUIPMENT--DAMAGED/) || sabotaged > 0)) {
      cmd = 'TA'; // try escape (will only work if rooms[9] or [28] damaged)
    } else {
      // wander, prefer toward unvisited
      cmd = 'M ' + dirs[Math.floor(g.seededRand() * 4)];
    }

    const ok = await g.sendCommand(cmd).then(() => true).catch(() => false);
    if (!ok) {
      await g.pressAnyKey();
      if (!g.findInput()) break;
    }
    await g.wait(40);
  }

  const tail = g.getMessages().slice(-1000);
  const story = {
    sabotaged: tail.includes('SABOTAGE'),
    selfDestruct: tail.includes('SELF-DESTRUCT'),
    escaped: tail.includes('REMARKABLE ESCAPE'),
    tractorBeam: tail.includes('TRACTOR BEAM LATCHES'),
    timeRanOut: tail.includes('FORCE FINALLY GAVE'),
    deathStarExplodes: tail.includes('DEATH STAR JUST EXPLODED'),
    foundPrincess: tail.includes('FOUND THE PRINCESS'),
    foundWookie: tail.includes('JOIN UP WITH YOU') || tail.includes('RIPS YOUR ARMS'),
    finalScore: (tail.match(/YOUR FINAL SCORE WAS (-?\d+)/) || [])[1],
    label: (tail.match(/YOU WERE ([\w ]+)/) || [])[1]
  };

  return { seed, turns, attacked, sabotagedAttempts: sabotaged, errors: g.errors.length, story };
}

(async () => {
  const seeds = [1, 2, 3, 4, 5, 17, 23, 99, 100, 101];
  const results = [];
  for (const s of seeds) {
    const r = await run(s);
    results.push(r);
    console.log('seed=' + s, 'turns=' + r.turns, 'errors=' + r.errors,
      'finalScore=' + (r.story.finalScore || '?'), r.story.label || '?');
    Object.entries(r.story).forEach(([k, v]) => { if (v && k !== 'finalScore' && k !== 'label') console.log('  ' + k + ':', v); });
  }
  const totalErrors = results.reduce((a, r) => a + r.errors, 0);
  console.log('\n=== SUMMARY ===');
  console.log('Total seeds:', seeds.length, 'Total errors:', totalErrors);
  process.exit(totalErrors > 0 ? 1 : 0);
})();
