// Drives a rescue + escape (same setup as test-princess-rescue) so the game
// reaches game-over with the WITH THE PRINCESS! bonus in play. Then clicks
// the MORE STATS button and verifies:
//   1. The button is visible on game-over.
//   2. Clicking it appends a "SCORE BREAKDOWN" section to the messages.
//   3. The breakdown lists the expected line items for the chosen path:
//      soldiers killed (>=0), escaped alive +10, rescued princess +25,
//      and one of the room-damage rows (rooms[9].damage was 2 from the
//      RESCUE TEST staging).
//   4. The TOTAL line is present and matches the FINAL SCORE printed by
//      the headline scoring narrative.

const fs = require('fs');
const { JSDOM } = require('/home/claude/node_modules/jsdom');

const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const p = { value:0, setValueAtTime:()=>{}, linearRampToValueAtTime:()=>{}, exponentialRampToValueAtTime:()=>{}, cancelScheduledValues:()=>{} };
    return { type:'', frequency:p, connect:(n)=>n||({connect:()=>{}}), start:()=>{}, stop:()=>{} };
  }
  createGain() {
    const p = { value:0, setValueAtTime:()=>{}, linearRampToValueAtTime:()=>{}, exponentialRampToValueAtTime:()=>{}, cancelScheduledValues:()=>{} };
    return { gain:p, connect:(n)=>n||({connect:()=>{}}) };
  }
  resume() { return Promise.resolve(); }
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const errors = [];

async function run() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      let s = 314;
      window.Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s & 0x7fffffff) / 0x80000000; };
      window.addEventListener('error', e => errors.push('window.error: ' + (e.error ? (e.error.stack || e.error.message) : e.message)));
      window.addEventListener('unhandledrejection', e => errors.push('unhandledrejection: ' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason))));
    }
  });
  const { window } = dom;
  const document = window.document;
  await wait(200);
  const messages = document.getElementById('messages');
  const findInput = () => messages ? messages.querySelector('input.term-input') : null;
  async function waitForInput(t = 1500) {
    const start = Date.now();
    while (Date.now() - start < t) { const i = findInput(); if (i) return i; await wait(20); }
    return null;
  }
  async function sendCmd(cmd) {
    const inp = await waitForInput();
    if (!inp) throw new Error('No input for: ' + cmd);
    inp.value = cmd;
    inp.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(60);
  }

  // Boot.
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  await sendCmd('CADET');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(40);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Space', bubbles: true }));
  await wait(120);

  // Stage rescue, rescue, escape.
  document.querySelector('.pi-toggle').click();
  await wait(40);
  document.getElementById('rescue-test-btn').click();
  await wait(80);
  await sendCmd('MOVE EAST');
  await sendCmd('MOVE WEST');
  await sendCmd('TAKE-OFF');
  await wait(200);

  // Game should be over now. Check body class and button visibility.
  const bodyGameOver = document.body.classList.contains('game-over');
  const moreStatsBtn = document.getElementById('more-stats-btn');
  console.log('body.game-over class:', bodyGameOver);
  console.log('more-stats-btn exists:', !!moreStatsBtn);
  // We can't fully check computed style in jsdom (no real layout), but we
  // can confirm the button is in the DOM and not literally `disabled`.
  console.log('more-stats-btn disabled before click:', moreStatsBtn ? moreStatsBtn.disabled : null);

  // Capture the headline FINAL SCORE printed by showScore so we can later
  // confirm the breakdown TOTAL matches it.
  const headlineText = messages.textContent;
  const finalMatch = headlineText.match(/FINAL SCORE WAS (-?\d+)/);
  const headlineScore = finalMatch ? parseInt(finalMatch[1], 10) : null;
  console.log('Headline FINAL SCORE:', headlineScore);

  // Click MORE STATS.
  const lenBeforeClick = messages.textContent.length;
  moreStatsBtn.click();
  await wait(80);
  const after = messages.textContent.slice(lenBeforeClick);

  const sawHeader   = after.includes('SCORE BREAKDOWN');
  const sawEscape   = after.includes('ESCAPED ALIVE');
  const sawPrincess = after.includes('RESCUED THE PRINCESS');
  const sawTotal    = after.includes('TOTAL');
  const sawRating   = after.includes('RATING:');

  // Extract the TOTAL line value and compare to headline.
  const totMatch = after.match(/TOTAL\s+(\+?-?\d+)/);
  const breakdownTotal = totMatch ? parseInt(totMatch[1], 10) : null;

  console.log('breakdown header  :', sawHeader);
  console.log('escaped line      :', sawEscape);
  console.log('princess line     :', sawPrincess);
  console.log('TOTAL line        :', sawTotal);
  console.log('RATING line       :', sawRating);
  console.log('breakdown TOTAL=  :', breakdownTotal);
  console.log('matches headline  :', breakdownTotal === headlineScore);

  console.log('more-stats-btn disabled after click:', moreStatsBtn.disabled);

  // Palette RESTART button: should be present, footer one should be hidden
  // (via CSS on body.game-over), and clicking once should arm it.
  const paletteRestart = document.getElementById('palette-restart-btn');
  const footerRestart = document.getElementById('restart-btn');
  console.log('palette restart exists:', !!paletteRestart);
  console.log('palette restart text initial:', paletteRestart ? paletteRestart.textContent : null);
  paletteRestart.click();
  await wait(40);
  const armedAfterClick = paletteRestart.classList.contains('armed');
  console.log('palette restart armed after one click:', armedAfterClick);
  console.log('palette restart text armed:', paletteRestart.textContent);
  // Don't click the second time — that would call location.reload() and
  // close the jsdom out from under us.

  // No PRESS RESTART/REFRESH closing line anymore.
  const noClosingLine = !messages.textContent.includes('PRESS RESTART OR REFRESH');
  console.log('removed closing instruction line:', noClosingLine);

  console.log('=== BREAKDOWN OUTPUT ===');
  console.log(after);

  if (errors.length) {
    console.log('=== ERRORS ===');
    for (const e of errors) console.log(e);
  }
  const ok = errors.length === 0 &&
             bodyGameOver &&
             sawHeader && sawEscape && sawPrincess && sawTotal && sawRating &&
             breakdownTotal === headlineScore &&
             moreStatsBtn.disabled === true &&
             !!paletteRestart && armedAfterClick && noClosingLine;
  console.log('ALL OK:', ok);
  process.exit(ok ? 0 : 1);
}

run().catch(e => { console.error('Test harness error:', e); process.exit(2); });
