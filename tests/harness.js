// Shared test harness for Star Wars 1979 headless tests.
// Usage:
//   const { createGame } = require('./harness');
//   const g = createGame(42);   // seed for deterministic RNG
//   await g.boot();             // dismiss title, enter name, dismiss briefing
//   await g.sendCommand('LOOK');
//   console.log(g.getMessages());

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(
  path.join(__dirname, '..', 'dist', 'star-wars-1979.html'), 'utf8'
);

class FakeAudioContext {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() {
    const p = {
      value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}, cancelScheduledValues() {}
    };
    return {
      type: '', frequency: p,
      connect: n => n || ({ connect() {} }), start() {}, stop() {}
    };
  }
  createGain() {
    const p = {
      value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {}, cancelScheduledValues() {}
    };
    return { gain: p, connect: n => n || ({ connect() {} }) };
  }
  resume() { return Promise.resolve(); }
}

function createGame(seed) {
  const errors = [];
  const envSeed = process.env.TEST_SEED ? parseInt(process.env.TEST_SEED, 10) : null;
  const effectiveSeed = (seed != null) ? seed : (envSeed != null) ? envSeed : 42;
  let s = effectiveSeed;
  console.log('seed=' + effectiveSeed);
  const seededRand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s & 0x7fffffff) / 0x80000000;
  };

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
      window.Math.random = seededRand;
      window.addEventListener('error', e => {
        errors.push('window.error: ' + (e.error
          ? (e.error.stack || e.error.message) : e.message));
      });
      window.addEventListener('unhandledrejection', e => {
        errors.push('unhandledrejection: ' + (e.reason && e.reason.stack
          ? e.reason.stack : String(e.reason)));
      });
    }
  });

  const { window } = dom;
  const document = window.document;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const messages = document.getElementById('messages');
  const status = document.getElementById('status');
  const palette = document.getElementById('palette');

  const findInput = () =>
    messages ? messages.querySelector('input.term-input') : null;
  const getMessages = () => messages ? messages.textContent : '';
  const getStatus = () => status ? status.textContent : '';

  function pressKey(key) {
    document.dispatchEvent(
      new window.KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function clickEl(el) {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }

  async function waitForInput(timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return null;
      const inp = findInput();
      if (inp) return inp;
      await wait(20);
    }
    return null;
  }

  // Poll until messages.textContent includes the given substring.
  async function waitForText(text, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return false;
      if (getMessages().includes(text)) return true;
      await wait(20);
    }
    return false;
  }

  // Poll for the .term-cursor element that anyKey() creates.
  async function waitForCursor(timeoutMs = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (errors.length > 0) return false;
      if (messages && messages.querySelector('.term-cursor')) return true;
      await wait(20);
    }
    return false;
  }

  async function sendCommand(cmd) {
    const inp = await waitForInput(2000);
    if (!inp) {
      throw new Error(
        'No input prompt for "' + cmd + '". Tail: ' + getMessages().slice(-200));
    }
    inp.value = cmd;
    inp.dispatchEvent(
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await wait(50);
  }

  async function pressAnyKey() {
    await waitForCursor(5000);
    pressKey('Space');
    await wait(40);
  }

  async function boot(name) {
    // Wait for the game script to execute and reach titleScreen().
    // The title screen doesn't create a .term-cursor, so we poll for
    // its visible text instead.
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (getMessages().includes('STAR WARS')) break;
      await wait(20);
    }
    pressKey('Space');
    await wait(40);
    await sendCommand(name || 'TESTER');
    await pressAnyKey();
    await pressAnyKey();
    await wait(100);
  }

  return {
    dom, window, document, errors,
    messages, status, palette,
    wait, findInput, getMessages, getStatus,
    pressKey, clickEl, waitForInput, waitForText, waitForCursor,
    sendCommand, pressAnyKey, boot, seededRand,
  };
}

module.exports = { createGame };
