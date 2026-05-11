// Headless simulation: load the HTML, find the button, click it, see if confirm is called
const fs = require('fs');
const html = fs.readFileSync('/mnt/user-data/outputs/star-wars-1979.html', 'utf8');

// Extract the script content
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
const scriptText = scriptMatch[1];

// Build a minimal DOM mock
const elements = {};
function makeEl(id, tag) {
  const el = {
    id, tagName: (tag || 'DIV').toUpperCase(),
    children: [], listeners: {}, attributes: {}, classList: { add(){}, remove(){}, contains(){return false;} },
    style: {}, dataset: {}, textContent: '',
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    removeEventListener(ev, fn) { /* no-op for test */ },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attributes[k] = v; },
    getAttribute(k) { return this.attributes[k]; },
    replaceWith() {},
    focus() {},
    click() {
      const handlers = this.listeners.click || [];
      handlers.forEach(h => h({ preventDefault(){}, stopPropagation(){} }));
    }
  };
  elements[id] = el;
  return el;
}
['status','messages','map','map-empty','dpad','palette','get-trigger','get-menu','drop-trigger','drop-menu','restart-btn'].forEach(id => makeEl(id, 'button'));

global.document = {
  getElementById(id) { return elements[id] || null; },
  querySelectorAll() { return []; },
  createElement(t) { return makeEl('_'+Math.random(), t); },
  createElementNS() { return makeEl('_'+Math.random(), 'svg'); },
  createTextNode() { return { textContent: '' }; },
  addEventListener() {},
  removeEventListener() {},
  activeElement: null,
};
global.window = {};
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.confirm = (msg) => { console.log('confirm() called with:', msg); return false; };
global.alert = () => {};
global.setInterval = () => 0;
global.clearInterval = () => {};

let reloadCalled = false;
global.location = { reload() { reloadCalled = true; console.log('location.reload() called'); } };

try {
  // Run the IIFE script
  eval(scriptText);
  console.log('Script ran without error');
  // Now simulate a click on the restart button
  setTimeout(() => {
    const btn = elements['restart-btn'];
    console.log('Restart button listeners:', (btn.listeners.click || []).length);
    if ((btn.listeners.click || []).length > 0) {
      btn.click();
      console.log('After click, reloadCalled:', reloadCalled);
    } else {
      console.log('NO CLICK LISTENER ATTACHED');
    }
  }, 100);
} catch(e) {
  console.log('Error during eval:', e.message);
}
setTimeout(() => process.exit(0), 500);
