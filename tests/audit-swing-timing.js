// Targeted SWING audit. Stages a success-case rope-swing using the
// SWING TEST debug button, sends SWING, and measures:
//   - Wall-clock time from command dispatch to messages-pane clear
//   - Freshest-line visibility immediately before clear
//
// Runs several seeds where the rope-broke roll fails (so we get the
// success branch) and reports the distribution.

const { createGame } = require('./harness');

async function audit(seed) {
  const g = createGame(seed, { realTiming: true });

  await g.boot();

  // Stage the rope-swing scenario via debug button.
  g.document.querySelector('.pi-toggle').click();
  await g.wait(30);
  g.document.getElementById('swing-test-btn').click();
  await g.wait(60);

  // Begin polling for the clear event.
  let lastText = g.messages.textContent;
  let lastChangeAt = Date.now();
  const events = [];

  const pollIv = setInterval(() => {
    const now = Date.now();
    const current = g.messages.textContent;
    if (current !== lastText) {
      if (current === '' && lastText !== '') {
        events.push({
          textBeforeClear: lastText,
          freshestVisibleMs: now - lastChangeAt,
        });
      }
      lastText = current;
      lastChangeAt = now;
    }
  }, 5);

  const cmdSentAt = Date.now();
  try {
    await g.sendCommand('SWING');
  } catch (e) {
    clearInterval(pollIv);
    g.dom.window.close();
    return { seed, error: e.message };
  }

  // Wait long enough for the full sequence (typing + pauseBeat + clear).
  // 6 seconds is comfortably more than expected (~2.4s) so we don't cut off.
  await g.wait(6000);
  clearInterval(pollIv);

  // First clear is the SWING -> enterRoom clear we want.
  const ev = events[0];
  if (!ev) {
    g.dom.window.close();
    return { seed, totalMs: null, freshestVisibleMs: null,
      note: 'no clear observed (rope-broke or other path)' };
  }

  // The clear happened ev.freshestVisibleMs after the last text change.
  // Approximate total = (Date.now() at clear) - cmdSentAt. We can derive
  // by re-scanning the events to find the clear's absolute time, but for
  // simplicity we'll just record the freshest visibility and add up.
  // Better: track absolute clear time in poll. Let's do it properly.
  g.dom.window.close();
  return {
    seed,
    freshestVisibleMs: ev.freshestVisibleMs,
    textBeforeClear: ev.textBeforeClear,
  };
}

// Refined audit that captures absolute timestamps for total-time measurement.
async function auditPrecise(seed) {
  const g = createGame(seed, { realTiming: true });
  await g.boot();
  g.document.querySelector('.pi-toggle').click();
  await g.wait(30);
  g.document.getElementById('swing-test-btn').click();
  await g.wait(60);

  let lastText = g.messages.textContent;
  let lastChangeAt = Date.now();
  let cmdSentAt = null;
  let firstClearAt = null;
  let firstClearFreshness = null;
  let firstClearText = null;

  const pollIv = setInterval(() => {
    const now = Date.now();
    const current = g.messages.textContent;
    if (current !== lastText) {
      if (current === '' && lastText !== '' && firstClearAt === null) {
        firstClearAt = now;
        firstClearFreshness = now - lastChangeAt;
        firstClearText = lastText;
      }
      lastText = current;
      lastChangeAt = now;
    }
  }, 5);

  cmdSentAt = Date.now();
  try {
    await g.sendCommand('SWING');
  } catch (e) {
    clearInterval(pollIv);
    g.dom.window.close();
    return { seed, error: e.message };
  }

  await g.wait(6000);
  clearInterval(pollIv);
  g.dom.window.close();

  if (firstClearAt === null) {
    return { seed, totalMs: null, note: 'no clear (likely rope-broke)' };
  }
  return {
    seed,
    totalMs: firstClearAt - cmdSentAt,
    freshestVisibleMs: firstClearFreshness,
    lastLine: firstClearText.split('\n').map(l => l.trim()).filter(Boolean).pop(),
  };
}

(async () => {
  const seeds = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const successes = [];
  for (const s of seeds) {
    const r = await auditPrecise(s);
    if (r.totalMs !== null) {
      successes.push(r);
      console.log('seed=' + s +
        ' total=' + r.totalMs + 'ms' +
        ' freshest=' + r.freshestVisibleMs + 'ms' +
        ' last="' + r.lastLine + '"');
    } else {
      console.log('seed=' + s + ' ' + (r.note || r.error));
    }
  }

  console.log('\n=== SWING TIMING REPORT ===');
  console.log('Success-path runs: ' + successes.length + ' of ' + seeds.length);
  if (successes.length) {
    const totals = successes.map(r => r.totalMs);
    const fresh = successes.map(r => r.freshestVisibleMs);
    const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
    const min = a => Math.min(...a);
    const max = a => Math.max(...a);
    console.log('Total command-to-clear: avg=' + avg(totals) +
      'ms min=' + min(totals) + 'ms max=' + max(totals) + 'ms');
    console.log('Freshest-line visibility: avg=' + avg(fresh) +
      'ms min=' + min(fresh) + 'ms max=' + max(fresh) + 'ms');
    console.log('User target: 4500ms total');
    console.log('Delta vs target: avg=' + (avg(totals) - 4500) + 'ms');
  }
})();
