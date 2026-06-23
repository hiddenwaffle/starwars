// Audit: auto-play the game with REAL timings and detect whether any
// text gets cleared from the messages pane before it's been visible
// long enough to read.
//
// Approach:
//   - Run createGame with realTiming so the in-game timing constants
//     (emulatorScale + soundWaitMult) use production defaults.
//   - Watch messages with MutationObserver. When textContent goes to
//     '' (the enterRoom HOME clear), record a "clear event." The
//     unified model clears + re-prompts within microtasks, so a poll
//     would miss the brief empty window -- MutationObserver fires
//     synchronously on DOM ops.
//   - Metric: time between the last text change and the clear. That's
//     how long the freshest line was on screen. Earlier lines were
//     visible longer, so this lower-bounds every line's visibility.
//
// Output: distribution buckets, variety of last-line content, and a
// list of any "suspicious" clears where freshest-line visibility was
// below a configurable threshold.

const { createGame } = require('./harness');

const DIRS = ['N', 'E', 'W', 'S'];
const SUSPICIOUS_THRESHOLD_MS = 400;

async function audit(seed, turns) {
  const g = createGame(seed, { realTiming: true });

  const events = [];
  let lastText = '';
  let lastChangeAt = Date.now();
  let lastCmd = null;

  // Boot transitions (title/briefing) use clearMessages() outside the
  // gameLoop, not the enterRoom HOME we want to audit. Skip them.
  await g.boot();
  lastText = g.messages.textContent;
  lastChangeAt = Date.now();

  const observer = new g.dom.window.MutationObserver(() => {
    const now = Date.now();
    const current = g.messages.textContent;
    if (current !== lastText) {
      if (current === '' && lastText !== '') {
        events.push({
          afterCmd: lastCmd,
          textBeforeClear: lastText,
          freshestVisibleMs: now - lastChangeAt,
        });
      }
      lastText = current;
      lastChangeAt = now;
    }
  });
  observer.observe(g.messages, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  for (let turn = 0; turn < turns; turn++) {
    if (g.errors.length > 0) break;
    const stat = g.getStatus();
    if (!stat.includes('DOORS OPEN')) break;
    const tail = g.getMessages().slice(-300);
    if (tail.includes('FINAL SCORE') || tail.includes('PRESS RESTART')) break;

    const hasEnemies = (stat.match(/(\d+) SOLDIERS/) &&
      parseInt(stat.match(/(\d+) SOLDIERS/)[1]) > 0) ||
      stat.includes('P: DARTH VADER');

    const r = g.seededRand();
    let cmd;
    if (hasEnemies && r < 0.6) cmd = 'A H';
    else if (r < 0.55) cmd = 'M ' + DIRS[Math.floor(g.seededRand() * 4)];
    else if (r < 0.70) cmd = 'L';
    else if (r < 0.80) cmd = 'F';
    else if (r < 0.88) cmd = 'SABRE';
    else if (r < 0.94) cmd = 'GET ALL';
    else if (r < 0.98) cmd = 'SAB';
    else cmd = 'TA';

    lastCmd = cmd;
    try {
      await g.sendCommand(cmd);
    } catch (e) {
      break;
    }
    // Give the game time to drain text + run pauseBeat/enterPause.
    await g.wait(2500);
  }

  observer.disconnect();
  g.dom.window.close();
  return events;
}

(async () => {
  const seeds = [1, 2, 3, 7, 19];
  const turnsPerSeed = 12;
  const all = [];

  for (const s of seeds) {
    const events = await audit(s, turnsPerSeed);
    console.log('seed=' + s + ' clear-events=' + events.length);
    all.push(...events);
  }

  console.log('\n=== AUDIT REPORT ===');
  console.log('Total clear events: ' + all.length);
  console.log('Threshold for "suspicious": <' + SUSPICIOUS_THRESHOLD_MS + 'ms freshest visibility\n');

  // Distribution.
  const buckets = [
    [0,    100,  '<100ms (FLASHED)'],
    [100,  300,  '100-300ms (BARELY READABLE)'],
    [300,  600,  '300-600ms (OK)'],
    [600,  900,  '600-900ms (COMFORTABLE)'],
    [900,  1500, '900-1500ms (LEISURELY)'],
    [1500, Infinity, '1500ms+ (LONG)'],
  ];
  const counts = buckets.map(() => 0);
  for (const e of all) {
    for (let i = 0; i < buckets.length; i++) {
      const [lo, hi] = buckets[i];
      if (e.freshestVisibleMs >= lo && e.freshestVisibleMs < hi) {
        counts[i]++;
        break;
      }
    }
  }
  console.log('Freshest-line visibility distribution:');
  for (let i = 0; i < buckets.length; i++) {
    console.log('  ' + counts[i].toString().padStart(3) + '  ' + buckets[i][2]);
  }

  // Variety of last-line content.
  console.log('\nLast line on screen at clear time (top 20):');
  const lastLines = new Map();
  for (const e of all) {
    const lines = e.textBeforeClear.split('\n').map(l => l.trim()).filter(Boolean);
    const last = lines[lines.length - 1] || '(empty)';
    lastLines.set(last, (lastLines.get(last) || 0) + 1);
  }
  [...lastLines.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([line, n]) => console.log('  ' + n.toString().padStart(3) + 'x  ' + line));

  // Suspicious clears.
  const suspicious = all.filter(e => e.freshestVisibleMs < SUSPICIOUS_THRESHOLD_MS);
  console.log('\nSuspicious clears: ' + suspicious.length);
  if (suspicious.length > 0) {
    console.log('(after-command | freshest-ms | last-line):');
    suspicious.forEach(e => {
      const lines = e.textBeforeClear.split('\n').map(l => l.trim()).filter(Boolean);
      const last = lines[lines.length - 1] || '(empty)';
      console.log(
        '  ' + (e.afterCmd || '?').padEnd(8) +
        ' | ' + e.freshestVisibleMs.toString().padStart(5) + 'ms' +
        ' | ' + last);
    });
  }
})();
