// Targeted: try to find equipment rooms, sabotage them, then escape.
const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {}
    };
    return { type: '', frequency: param, connect: (n) => n || ({ connect: () => {} }), start: () => {}, stop: () => {} };
  }
  createGain() {
    const param = {
      value: 0,
      setValueAtTime: () => {},
      linearRampToValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
      cancelScheduledValues: () => {}
    };
    return { gain: param, connect: (n) => n || ({ connect: () => {} }) };
  }
  resume() { return Promise.resolve(); }
}

async function run(seed) {
  const errors = [];
  let s = seed;
  const seededRand = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.Math.random = seededRand;
      window.addEventListener('error', e => errors.push('error: ' + (e.error ? e.error.stack || e.error.message : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await wait(150);

  const messages = document.getElementById('messages');
  const status = document.getElementById('status');
  const pressKey = (key) => document.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  const findInput = () => messages.querySelector('input.term-input');

  async function waitForInput(timeoutMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return null;
      const inp = findInput();
      if (inp) return inp;
      await wait(15);
    }
    return null;
  }
  async function sendCommand(cmd) {
    const inp = await waitForInput(1500);
    if (!inp) return false;
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(40);
    return true;
  }
  async function pressAnyKey() { await wait(40); pressKey('Space'); await wait(40); }

  await pressAnyKey();
  await sendCommand('TESTER');
  await pressAnyKey();
  await pressAnyKey();
  await wait(150);

  // Heavy wander + sabotage when possible
  const dirs = ['N', 'E', 'W', 'S'];
  let turns = 0, sabotaged = 0, attacked = 0;
  let lastRoom = '';
  while (turns++ < 200) {
    if (errors.length > 0) break;
    const stat = status.textContent;
    if (!stat.includes('DOORS OPEN')) break;
    const tail = messages.textContent.slice(-200);
    if (tail.includes('FINAL SCORE') || tail.includes('PRESS RESTART')) break;

    const isEquipRoom = stat.includes('EQUIPMENT--');
    const isHangar = stat.includes('HANGER DECK');
    const hasEnemies = (stat.match(/(\d+) SOLDIERS/) && parseInt(stat.match(/(\d+) SOLDIERS/)[1]) > 0) || stat.includes('P: DARTH VADER');
    const sabreOn = stat.includes('SABRE ON');

    let cmd;
    if (hasEnemies) {
      if (!sabreOn && seededRand() < 0.3) cmd = 'SABRE';
      else if (seededRand() < 0.7) cmd = 'A S';
      else cmd = 'A H';
      attacked++;
    } else if (isEquipRoom && stat.includes('UNDAMAGED')) {
      cmd = 'SAB';
      sabotaged++;
    } else if (isHangar && (stat.match(/EQUIPMENT--DAMAGED/) || sabotaged > 0)) {
      cmd = 'TA'; // try escape (will only work if rooms[9] or [28] damaged)
    } else {
      // wander, prefer toward unvisited
      cmd = 'M ' + dirs[Math.floor(seededRand() * 4)];
    }

    const ok = await sendCommand(cmd);
    if (!ok) {
      await pressAnyKey();
      if (!findInput()) break;
    }
    await wait(40);
  }

  const tail = messages.textContent.slice(-1000);
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

  return { seed, turns, attacked, sabotagedAttempts: sabotaged, errors: errors.length, story };
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
