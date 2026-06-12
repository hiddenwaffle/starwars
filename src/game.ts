export {};

interface Character {
  room: number;
  hp: number;
  atk: number;
  shield: number;
  blaster: number;
  sabre: number;
  name?: string;
  friendly?: number;
}

interface Room {
  n: number; e: number; w: number; s: number;
  type: number;
  damage: number;
  soldiers: number;
  shields: number;
  blasters: number;
  sabotageBar?: number;
}

interface Flags {
  selfDestruct: boolean;
  ropeUp: boolean;
  sabreOn: boolean;
  lastCmd: number;
}

interface SoldierStat {
  def: number;
  atk: number;
}

interface Coord {
  x: number;
  y: number;
}

interface ScoreBreakdown {
  soldierKills: number;
  escaped: boolean;
  rescuedPrincess: boolean;
  abandonedWookie: boolean;
  killedVader: boolean;
  selfDestruct: boolean;
  damageRepairable: number;
  damagePermanent: number;
  keyRoomsDamaged: string[];
  total: number;
  tier: string;
}

interface CommandEntry {
  p: string;
  f: (rest: string) => boolean | Promise<boolean>;
}

type RoomTuple = [number, number, number, number, number];

// ============================================================
// Star Wars 1979 — JS port of Donald Brown's Applesoft BASIC
// ============================================================
//
// This whole file is one IIFE. The BASIC source it's ported from lives
// alongside the project as star-wars-1979.bas; throughout this file,
// comments cite BASIC line numbers (e.g. "BASIC 750", "BASIC 2200-2270")
// to point at the original implementation of a given block.
//
// High-level flow:
//   main() → titleScreen() → name prompt → briefing() → gameLoop()
//   gameLoop() runs t8 turns (76-125 random) of: Vader move → time
//   warn → command input → soldiers shoot → follower escape → repair.
//
// Character indexing (chars array, 1-indexed to mirror BASIC's C(P,X)):
//   1 = player, 2 = princess, 3 = wookie, 4 = Vader, 5 = soldier slot.
// Each character has: room, hp, atk, shield, blaster, sabre, friendly,
// and (player only) name. Negative `room` means "lost" — princess in a
// detention cell, wookie at start, or follower separated by ORDER WAIT.
//
// I/O model: input() returns a promise that resolves when the player
// submits a value to the inline DOM input. Most command handlers are
// async because they may have sub-prompts (e.g. "WHICH WEAPON?").
// Command handlers return true if a turn was consumed, false if it was
// a free action (GET, DROP, LOOK, HELP) or rejected early.
//
// Subtleties worth knowing:
//   - 'STR'.indexOf('') === 0, so any input-loop `while ('XYZ'.indexOf(v) === -1)`
//     needs the explicit `v === '' || …` guard, or empty input skips the loop.
//   - The sabre's damage roll uses player.hp as A1, so the sabre degrades
//     as the player takes damage. Blaster A1 = player.atk (constant).
//   - Soldier kills give blaster + shield drops in the room (BASIC 860).
//   - The CHARGE multi-column menu populates a `chargePresets` global
//     before injecting the command; cmdCharge consumes it in place of
//     follower S/A/N prompts. Typed CHARGE leaves presets null and
//     hits the BASIC-faithful prompt-each-follower path.

const status = document.getElementById('status')!;
const messages = document.getElementById('messages')!;
const mapSvg = document.getElementById('map')!;
const mapEmpty = document.getElementById('map-empty')!;
const dpad = document.getElementById('dpad')!;
const palette = document.getElementById('palette')!;

messages.addEventListener('click', () => {
  const inp = messages.querySelector('input');
  if (inp) inp.focus();
});

let mode: string = 'normal';

let lineDelay = 0;
let soundLineDelay = 0;
let soundWaitPct = 200;
let lineWrap: HTMLElement | null = null;
let pendingLines: HTMLElement[] = [];
const lineSounds = new WeakMap<HTMLElement, {play: () => void, durationMs: number}[]>();

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

function out(text: string, modeOverride?: string): void {
  if (text === '' || text === undefined || text === null) return;
  const m = modeOverride !== undefined ? modeOverride : mode;
  const span = document.createElement('span');
  if (m === 'inverse') span.className = 'inv';
  else if (m === 'flash') span.className = 'fls';
  span.textContent = String(text);
  if (lineDelay > 0) {
    if (!lineWrap) {
      lineWrap = document.createElement('span');
      lineWrap.style.display = 'none';
      messages.appendChild(lineWrap);
    }
    lineWrap.appendChild(span);
  } else {
    messages.appendChild(span);
    scrollMessagesToBottom();
  }
}
function nl(): void {
  if (lineDelay > 0) {
    if (!lineWrap) {
      lineWrap = document.createElement('span');
      lineWrap.style.display = 'none';
      messages.appendChild(lineWrap);
    }
    lineWrap.appendChild(document.createTextNode('\n'));
    pendingLines.push(lineWrap);
    lineWrap = null;
  } else {
    messages.appendChild(document.createTextNode('\n'));
    scrollMessagesToBottom();
  }
}

async function drainLines(): Promise<void> {
  while (pendingLines.length > 0) {
    const w = pendingLines.shift()!;
    w.style.display = '';
    scrollMessagesToBottom();
    const sounds = lineSounds.get(w);
    if (sounds) {
      let soundMs = 0;
      for (const s of sounds) { s.play(); soundMs += s.durationMs; }
      const base = soundLineDelay;
      const extra = soundMs > base ? (soundMs - base) * soundWaitPct / 100 : 0;
      await sleep(base + extra);
    } else {
      await sleep(lineDelay);
    }
  }
  if (lineWrap) {
    lineWrap.style.display = '';
    lineWrap = null;
    scrollMessagesToBottom();
  }
}

function flushLines(): void {
  for (const w of pendingLines) {
    w.style.display = '';
    const sounds = lineSounds.get(w);
    if (sounds) for (const s of sounds) s.play();
  }
  pendingLines = [];
  if (lineWrap) { lineWrap.style.display = ''; lineWrap = null; }
  scrollMessagesToBottom();
}

function scrollMessagesToBottom(): void {
  messages.scrollTop = messages.scrollHeight;
}
function clearMessages(): void {
  pendingLines = [];
  lineWrap = null;
  messages.textContent = '';
}
function clearStatus(): void { status.textContent = ''; }
const mapTooltip = document.getElementById('map-tooltip');
const mapFrame   = document.querySelector('.map-frame');
function showMapTooltip(targetEl: Element, text: string): void {
  if (!mapTooltip || !mapFrame) return;
  mapTooltip.textContent = text;
  const tBox = targetEl.getBoundingClientRect();
  const fBox = mapFrame.getBoundingClientRect();
  const x = tBox.left - fBox.left + tBox.width / 2;
  const y = tBox.top  - fBox.top;
  mapTooltip.style.left = x + 'px';
  mapTooltip.style.top  = y + 'px';
  mapTooltip.classList.add('active');
}
function hideMapTooltip(): void {
  if (mapTooltip) mapTooltip.classList.remove('active');
}
function sceneBreak(): void {
  if (!messages.firstChild) return;
  // Leading newline mirrors the trailing empty line produced by the next
  // prompt's leading "\n" (BASIC's PRINT before INPUT). Without it the
  // break sits tight against the previous text but loose above the prompt.
  messages.appendChild(document.createTextNode('\n'));
  const br = document.createElement('div');
  br.className = 'scene-break';
  messages.appendChild(br);
  scrollMessagesToBottom();
}

let pendingInputResolver: ((value: string) => void) | null = null;
// True only while gameLoop is awaiting a top-level "WHAT IS YOUR COMMAND"
// input. The d-pad click handler and the arrow-key keydown handler check
// this before injecting a MOVE command, so neither can satisfy the
// pre-game name prompt or any in-game sub-prompt.
let acceptingMoveInput = false;
// When the CHARGE menu fires (after the player picks an option in every
// visible column), it stashes the follower selections here so cmdCharge
// can use them instead of awaiting interactive sub-prompts. Keyed by
// 'princess' / 'wookie', value is 'S' | 'A' | 'N'. Always cleared at the
// top of cmdCharge once consumed (or unread). The typed-CHARGE path
// leaves this null and falls through to the original prompt-each-follower
// flow.
let chargePresets: Record<string, string> | null = null;

async function input(prompt: string, autoFocus = false): Promise<string> {
  out(prompt + '? ');
  await drainLines();
  return new Promise(resolve => {
    const wrap = document.createElement('span');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'term-input';
    inp.autocomplete = 'off';
    inp.autocapitalize = 'characters';
    inp.spellcheck = false;
    wrap.appendChild(inp);
    messages.appendChild(wrap);
    scrollMessagesToBottom();
    if (autoFocus) requestAnimationFrame(() => inp.focus());

    const finish = (value: string) => {
      if (pendingInputResolver !== finish) return;
      pendingInputResolver = null;
      wrap.replaceWith(document.createTextNode(value));
      nl();
      resolve(value);
    };
    pendingInputResolver = finish;

    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish((inp.value || '').toUpperCase().trim());
      } else if (e.key === 'Escape') {
        inp.blur();
      }
    });
  });
}

function injectCommand(cmd: string): void {
  if (pendingInputResolver) {
    pendingInputResolver(String(cmd).toUpperCase().trim());
  }
}

function anyKey(promptText?: string): Promise<void> {
  return new Promise(resolve => {
    out(promptText || '');
    const cur = document.createElement('span');
    cur.className = 'term-cursor';
    messages.appendChild(cur);
    scrollMessagesToBottom();
    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      messages.removeEventListener('click', onClick);
      cur.remove();
      nl();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Shift','Control','Alt','Meta','CapsLock','Tab'].includes(e.key)) return;
      e.preventDefault();
      cleanup();
    };
    const onClick = () => cleanup();
    document.addEventListener('keydown', onKey);
    messages.addEventListener('click', onClick);
  });
}

// -------- Game data --------

const Rd = [null, 'MACHINERY', 'CONTROL'];
const Bd = [null, 'TRACTOR BEAM', 'POWER', 'WEAPONRY'];
const Ed = [null, 'COMMAND', 'HANGER', 'EAST DETENTION', 'WEST DETENTION'];
const Cd = [null, 'BROWN', 'GREEN', 'BLUE', 'YELLOW', 'RED', 'ORANGE', 'BLACK', 'WHITE'];
const Od = [null, 'WEST END', 'MIDDLE', 'EAST END', 'SOUTH END', 'NORTH END'];
const Pdir = [null, 'NORTH', 'EAST', 'WEST', 'SOUTH'];
const Dmg = [null, 'UNDAMAGED', 'DAMAGED BUT CAN BE REPAIRED', 'IRREPAIRABLY DAMAGED'];
// BASIC N$ (line 510): N$(2)..N$(5). Index 1 = player handled by name field.
const NAMES = [null, 'PLAYER', 'PRINCESS LEIA', 'THE WOOKIE', 'DARTH VADER', 'IMPERIAL SOLDIER'];
// BASIC W$: W$(1)=SHIELD, W$(2)=BLASTER, W$(3)=LIGHT SABRE
const WPN = [null, 'SHIELD', 'BLASTER', 'LIGHT SABRE'];

// ROOM_DATA[r] = [N, E, W, S, type] for room r (1-indexed; 0 entry is null).
// Each direction is the room number reached by going that way (0 = no exit).
// Negative direction values mark the chasm edge (room 29↔30): going across
// requires TOSS+SWING. The 5th element is a packed type code used by
// getRoomName() to compose the corridor/cell/named-room display name.
// Rooms 1-30 are the main floor; 31-42 are the twelve detention cells
// (Cell #1 through Cell #12), reachable only via single E/W exits.
// Three edges span more than one map cell (1↔2, 26↔19, chasm 29↔30);
// the FIXED_COORDS table in renderMap() handles the layout.
const ROOM_DATA: (RoomTuple | null)[] = [null,
  [30,2,0,0,4],     [3,4,1,0,102],   [0,0,0,2,221],   [0,5,2,0,202],   [10,6,4,8,103],
  [0,7,5,0,302],    [0,0,6,0,311],   [5,0,0,9,412],   [8,0,0,0,111],   [11,0,0,5,212],
  [14,12,0,10,123], [0,13,11,0,222], [0,0,12,0,121],  [15,0,0,11,512], [0,0,16,14,133],
  [0,15,17,0,232],  [18,16,0,0,433], [19,0,0,17,242], [20,0,26,18,321],[21,42,37,19,462],
  [22,41,38,20,262],[0,40,39,21,562],[0,34,33,24,572],[23,35,32,25,272],[24,36,31,26,472],
  [25,19,0,27,421], [26,0,28,29,552],[0,27,0,0,211],  [27,0,0,-30,252],[-29,0,0,1,452],
  [0,25,0,0,14],    [0,24,0,0,24],   [0,23,0,0,34],   [0,0,23,0,44],   [0,0,24,0,54],
  [0,0,25,0,64],    [0,20,0,0,74],   [0,21,0,0,84],   [0,22,0,0,94],   [0,0,22,0,104],
  [0,0,21,0,114],   [0,0,20,0,124]
];

// -------- State --------

const irand = (n: number): number => Math.floor(Math.random() * n);
// chars[1]=player, chars[2]=princess, chars[3]=wookie, chars[4]=vader
// hp doubles as sabre power; atk doubles as blaster power (faithful to BASIC P(p,2)/P(p,3))
// shield/blaster/sabre are counts; for NPCs they stay 0 or 1, player can stack >1 from kills
let player!: Character;
let princess!: Character;
let wookie!: Character;
let vader!: Character;
let chars!: (Character | null)[];
let rooms!: (Room | null)[];
const visited = new Set<number>();
const roomCoords = new Map<number, Coord>();

// Static, hand-laid-out grid coordinates for every room. The graph has a
// cycle that doesn't close on a 4-direction grid, so three edges are
// longer than 1 cell (chasm 30↔29 is 3 vertical cells; 26↔19 and 1↔2 are
// each 4 horizontal cells). Every other edge is exactly one cell in a
// cardinal direction, with no two rooms sharing a coord.
const FIXED_COORDS: Record<number, Coord> = {
  1:  { x: 0,  y:  0 }, 2:  { x: 4,  y:  0 }, 3:  { x: 4,  y: -1 },
  4:  { x: 5,  y:  0 }, 5:  { x: 6,  y:  0 }, 6:  { x: 7,  y:  0 },
  7:  { x: 8,  y:  0 }, 8:  { x: 6,  y:  1 }, 9:  { x: 6,  y:  2 },
  10: { x: 6,  y: -1 }, 11: { x: 6,  y: -2 }, 12: { x: 7,  y: -2 },
  13: { x: 8,  y: -2 }, 14: { x: 6,  y: -3 }, 15: { x: 6,  y: -4 },
  16: { x: 5,  y: -4 }, 17: { x: 4,  y: -4 }, 18: { x: 4,  y: -5 },
  19: { x: 4,  y: -6 }, 20: { x: 4,  y: -7 }, 21: { x: 4,  y: -8 },
  22: { x: 4,  y: -9 }, 23: { x: 0,  y: -9 }, 24: { x: 0,  y: -8 },
  25: { x: 0,  y: -7 }, 26: { x: 0,  y: -6 }, 27: { x: 0,  y: -5 },
  28: { x: -1, y: -5 }, 29: { x: 0,  y: -4 }, 30: { x: 0,  y: -1 },
  // Detention cells 1-12
  31: { x: -1, y: -7 }, 32: { x: -1, y: -8 }, 33: { x: -1, y: -9 },
  34: { x: 1,  y: -9 }, 35: { x: 1,  y: -8 }, 36: { x: 1,  y: -7 },
  37: { x: 3,  y: -7 }, 38: { x: 3,  y: -8 }, 39: { x: 3,  y: -9 },
  40: { x: 5,  y: -9 }, 41: { x: 5,  y: -8 }, 42: { x: 5,  y: -7 }
};
// Global game state mirroring BASIC's D() and S8/S9/T8
let flags!: Flags;
let kills!: number;
let s9!: number;
let curSoldiers!: SoldierStat[];
let t8!: number;
let gameOver!: boolean;

function initGame() {
  rooms = [null];
  for (let i = 1; i <= 42; i++) {
    const [n, e, w, s, type] = ROOM_DATA[i]!;
    rooms.push({ n, e, w, s, type, damage: 0, soldiers: 0, shields: 0, blasters: 0 });
  }
  player = {
    room: 1,
    hp: 11 + irand(10),
    atk: 11 + irand(10),
    shield: 1, blaster: 0, sabre: 1,
    name: 'CADET'
  };
  // Princess and wookie placed in distinct random detention cells (rooms 31-42), negative = unfound
  do {
    princess = {
      room: -(31 + irand(12)),
      hp: 11 + irand(10), atk: 11 + irand(10),
      shield: 0, blaster: 0, sabre: 0
    };
    wookie = {
      room: -(31 + irand(12)),
      hp: 11 + irand(10), atk: 11 + irand(10),
      shield: 0, blaster: 0, sabre: 0,
      friendly: 0
    };
  } while (princess.room === wookie.room);
  // BASIC line 320 doubles wookie's hp/sabre stat
  wookie.hp *= 2;
  // Vader: random room 2-30 (BASIC line 310: 29*RND(1)+2)
  vader = {
    room: 2 + irand(29),
    hp: 11 + irand(10), atk: 11 + irand(10),
    shield: 1, blaster: 0, sabre: 1
  };
  chars = [null, player, princess, wookie, vader];

  // Fixed soldiers in detention guards
  rooms[19]!.soldiers = 3;
  rooms[26]!.soldiers = 3;
  const numSoldiers = 5 + irand(20);
  for (let s = 0; s < numSoldiers; s++) {
    let r;
    do { r = 1 + irand(30); } while (rooms[r]!.soldiers >= 10);
    rooms[r]!.soldiers++;
  }

  flags = { selfDestruct: false, ropeUp: false, sabreOn: false, lastCmd: 0 };
  kills = 0;
  s9 = 0;
  curSoldiers = [];
  t8 = 76 + irand(50);   // BASIC: INT(50*RND(1)+76)
  gameOver = false;

  visited.clear();
  roomCoords.clear();
  visited.add(1);
  for (const r in FIXED_COORDS) {
    roomCoords.set(+r, FIXED_COORDS[r]);
  }
}

function getRoomName(rNum: number): string {
  const t = rooms[rNum]!.type;
  const r2 = Math.floor(t / 100);
  const r3 = Math.floor((t - r2 * 100) / 10);
  const r4 = t - r2 * 100 - r3 * 10;
  switch (r4) {
    case 1: { const s = (r3 === 2) ? Ed[r2] : Bd[r2]; return s + ' ' + Rd[r3] + ' ROOM'; }
    case 2: return Od[r2] + ' OF THE ' + Cd[r3 + 1] + ' CORRIDOR';
    case 3: return 'JUNCTION OF ' + Cd[r2 + 1] + ' AND ' + Cd[r3 + 1] + ' CORRIDORS';
    case 4: return rNum === 1 ? 'HANGER DECK' : ('DETENTION CELL #' + Math.floor(t / 10));
  }
  return '???';
}

// -------- Status panel render --------

let statusSlow = false;

async function renderStatus(): Promise<void> {
  // Build all lines into offscreen wrappers first.
  const lines: HTMLElement[] = [];
  let curLine = document.createElement('span');

  function add(text: string, m?: string): void {
    if (text === '') return;
    const span = document.createElement('span');
    if (m === 'inverse') span.className = 'inv';
    else if (m === 'flash') span.className = 'fls';
    span.textContent = String(text);
    curLine.appendChild(span);
  }
  function lf(): void {
    curLine.appendChild(document.createTextNode('\n'));
    lines.push(curLine);
    curLine = document.createElement('span');
  }

  const name = getRoomName(player.room);
  const X = Math.max(1, Math.floor((40 - name.length) / 2));
  add(' '.repeat(X - 1));
  add(name, 'inverse');
  lf();

  add('DOORS OPEN TO');
  const room = rooms[player.room]!;
  const exits = [room.n, room.e, room.w, room.s];
  for (let x = 0; x < 4; x++) if (exits[x] > 0) add(' ' + Pdir[x + 1]);
  lf();

  add('CARRYING--');
  if (player.sabre) {
    add('SABRE ');
    add(flags.sabreOn ? 'ON' : 'OFF', 'inverse');
    add(' ');
  }
  add(player.shield + ' SLD. ' + player.blaster + ' BLST.');
  lf();

  // BASIC line 2580: "P:" line listing princess/wookie/vader at ABS(c.room)==here
  const here = player.room;
  const present = [];
  for (let p = 2; p <= 4; p++) {
    const c = chars[p]!;
    if (c.room !== 0 && Math.abs(c.room) === here) present.push(p);
  }
  if (present.length) {
    add('P:');
    for (const p of present) {
      add(' ');
      add(NAMES[p]!, 'inverse');
    }
    lf();
  }

  add('IN ROOM--');
  let any = false;
  if (room.soldiers) { add(room.soldiers + ' SOLDIERS '); any = true; }
  if (room.shields || room.blasters) {
    add(room.shields + ' SLD. ' + room.blasters + ' BLST.');
    any = true;
  }
  if (!any) add('NOTHING');
  lf();

  if (room.type % 10 === 1) {
    add('EQUIPMENT--' + Dmg[room.damage + 1]);
    lf();
  }
  if (player.room === 29) add('CHASM TO SOUTH--');
  else if (player.room === 30) add('CHASM TO NORTH--');
  if (player.room === 29 || player.room === 30) {
    add(flags.ropeUp ? 'ROPE IS UP' : 'ROPE IS NOT UP'); lf();
  }
  add('-'.repeat(40));
  if (curLine.childNodes.length > 0) lines.push(curLine);

  // Reveal: line-by-line on room entry, instant otherwise.
  const slow = statusSlow && lineDelay > 0;
  statusSlow = false;
  status.textContent = '';
  if (slow) {
    // Append all lines hidden so the element takes its full height,
    // then reveal one at a time.
    for (const ln of lines) {
      ln.style.visibility = 'hidden';
      status.appendChild(ln);
    }
    for (let i = 0; i < lines.length; i++) {
      lines[i].style.visibility = '';
      if (i < lines.length - 1) await sleep(lineDelay);
    }
  } else {
    for (const ln of lines) status.appendChild(ln);
  }
}

// -------- Map --------

function renderMap(): void {
  while (mapSvg.firstChild) mapSvg.removeChild(mapSvg.firstChild);

  const roomNums = [...visited];
  if (roomNums.length === 0) {
    mapEmpty.style.display = 'flex';
    return;
  }
  mapEmpty.style.display = 'none';

  // Peeked rooms (one step beyond visited) for "fog of war" hints.
  // Each peek target's position is just its static coord; the dotted
  // line from the visited origin to the peek points exactly where the
  // room will appear when visited.
  const peek = new Map<number, Coord>();
  for (const r of roomNums) {
    const room = rooms[r]!;
    const exits = [room.n, room.e, room.w, room.s];
    for (let i = 0; i < 4; i++) {
      const e = exits[i];
      const target = e < 0 ? -e : e;
      if (target > 0 && !visited.has(target) && !peek.has(target)) {
        const targetCoord = roomCoords.get(target);
        if (targetCoord) {
          peek.set(target, targetCoord);
        }
      }
    }
  }

  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  function expand(c: Coord): void {
    if (c.x < xMin) xMin = c.x;
    if (c.x > xMax) xMax = c.x;
    if (c.y < yMin) yMin = c.y;
    if (c.y > yMax) yMax = c.y;
  }
  for (const r of roomNums) expand(roomCoords.get(r)!);
  for (const [, c] of peek) expand(c);

  const cell = 28;
  const pad = 14;
  const width = (xMax - xMin) * cell + cell + pad * 2;
  const height = (yMax - yMin) * cell + cell + pad * 2;
  mapSvg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

  function gridToPx(c: Coord): Coord {
    return {
      x: (c.x - xMin) * cell + pad,
      y: (c.y - yMin) * cell + pad
    };
  }

  const NS = 'http://www.w3.org/2000/svg';

  // Edges from visited rooms. Solid edge if the target is also visited;
  // faded "peek" edge if the target is only peeked (one step beyond).
  const drawnEdges = new Set<string>();
  for (const r of roomNums) {
    const room = rooms[r]!;
    const exits = [room.n, room.e, room.w, room.s];
    for (let i = 0; i < 4; i++) {
      const e = exits[i];
      if (e === 0) continue;
      const target = e < 0 ? -e : e;
      const targetVisited = visited.has(target);
      const targetPeeked = peek.has(target);
      if (!targetVisited && !targetPeeked) continue;
      const key = r < target ? r + ':' + target : target + ':' + r;
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      const c1 = roomCoords.get(r);
      const c2 = targetVisited ? roomCoords.get(target) : peek.get(target);
      if (!c1 || !c2) continue;
      const p1 = gridToPx(c1);
      const p2 = gridToPx(c2);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', p1.x + cell * 0.4 + '');
      line.setAttribute('y1', p1.y + cell * 0.4 + '');
      line.setAttribute('x2', p2.x + cell * 0.4 + '');
      line.setAttribute('y2', p2.y + cell * 0.4 + '');
      let cls = 'room-edge';
      if (e < 0) cls += ' chasm';
      if (!targetVisited) cls += ' peek';
      line.setAttribute('class', cls);
      mapSvg.appendChild(line);
    }
  }

  // Peeked rooms (faded outlines)
  for (const [, c] of peek) {
    const p = gridToPx(c);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', p.x + cell * 0.15 + '');
    rect.setAttribute('y', p.y + cell * 0.15 + '');
    rect.setAttribute('width', cell * 0.5 + '');
    rect.setAttribute('height', cell * 0.5 + '');
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', 'room-rect peek');
    mapSvg.appendChild(rect);
    const label = document.createElementNS(NS, 'text');
    label.setAttribute('x', p.x + cell * 0.4 + '');
    label.setAttribute('y', p.y + cell * 0.5 + '');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('class', 'room-text peek');
    label.textContent = '?';
    mapSvg.appendChild(label);
  }

  // Visited rooms (current room highlighted)
  const equipNames = { T: 'Tractor beam', P: 'Power', W: 'Weaponry', C: 'Command' };
  for (const r of roomNums) {
    const c = roomCoords.get(r)!;
    const p = gridToPx(c);
    const isHere = (r === player.room);
    const room = rooms[r]!;
    const isSpecial = (room.type % 10) === 1; // machinery / control rooms
    const isHangar = (r === 1);
    const isDetention = (r >= 31);

    // Decode equipment-room kind from type, give each a distinct letter:
    // T = Tractor beam machinery (objective), P = Power machinery (objective),
    // W = Weaponry machinery (bonus), C = Command control (bonus).
    // Other type%10===1 rooms (Hanger Control, E/W Detention Control) are
    // also sabotagable per BASIC but only give baseline d1/d2 score; they
    // get a smaller dot indicator instead of a labeled letter.
    let letter: string | null = null;
    let damageClass: string | null = null;
    let dotKind: string | null = null;
    if (isHangar) {
      letter = 'H';
    } else if (isSpecial) {
      const t = room.type;
      const r2 = Math.floor(t / 100);
      const r3 = Math.floor((t - r2 * 100) / 10);
      if (r3 === 1) {
        if (r2 === 1) letter = 'T';
        else if (r2 === 2) letter = 'P';
        else if (r2 === 3) letter = 'W';
      } else if (r3 === 2) {
        if (r2 === 1) letter = 'C';
      }
      if (letter) {
        damageClass = 'equip-' + room.damage;
      } else {
        // Sabotagable but not strategically important.
        dotKind = 'equip-' + room.damage;
      }
    }

    // Tooltip text: room name for everything; any sabotagable room (with
    // letter or dot) also appends the % sabotaged.
    let titleText = getRoomName(r);
    if (damageClass || dotKind) {
      titleText += ' — ' + (room.damage * 50) + '% SABOTAGED';
    }

    // Wrap every room in a <g> so hovering anywhere over it shows the
    // tooltip — keeps behavior consistent across all rooms.
    const grp = document.createElementNS(NS, 'g');
    grp.addEventListener('mouseenter', () => showMapTooltip(grp, titleText));
    grp.addEventListener('mouseleave', hideMapTooltip);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', p.x + cell * 0.15 + '');
    rect.setAttribute('y', p.y + cell * 0.15 + '');
    rect.setAttribute('width', cell * 0.5 + '');
    rect.setAttribute('height', cell * 0.5 + '');
    rect.setAttribute('rx', '2');
    let cls = 'room-rect' + (isHere ? ' here' : '');
    if (damageClass) cls += ' ' + damageClass;
    rect.setAttribute('class', cls);
    grp.appendChild(rect);

    if (letter) {
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', p.x + cell * 0.4 + '');
      label.setAttribute('y', p.y + cell * 0.5 + '');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      let textCls = 'room-text' + (isHere ? ' here' : '');
      if (damageClass) textCls += ' ' + damageClass;
      label.setAttribute('class', textCls);
      label.textContent = letter;
      grp.appendChild(label);
    } else if (dotKind) {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', p.x + cell * 0.4 + '');
      dot.setAttribute('cy', p.y + cell * 0.4 + '');
      dot.setAttribute('r', '1.8');
      dot.setAttribute('class', 'room-dot ' + dotKind);
      grp.appendChild(dot);
    }

    mapSvg.appendChild(grp);
  }
}

function updateDpad(): void {
  if (!rooms) return;
  const room = rooms[player.room]!;
  const exits = [room.n, room.e, room.w, room.s];
  const dirs = ['N', 'E', 'W', 'S'];
  const noEnemies = !blockedByEnemies();
  for (let i = 0; i < 4; i++) {
    const btn = dpad.querySelector('[data-dir="' + dirs[i] + '"]') as HTMLButtonElement | null;
    if (!btn) continue;
    const noExit = !(exits[i] > 0);
    btn.disabled = noExit;
    btn.classList.toggle('blocked', !noExit && !noEnemies);
  }
}

// Show/hide each palette command based on whether it's actually possible
// right now. Mirrors the early-return checks in each cmdX function so the
// user only sees actions that wouldn't immediately fail.
function updatePalette(): void {
  if (!rooms || !player || player.room === 0) return;
  const room = rooms[player.room]!;
  const noEnemies = !blockedByEnemies();
  const at29or30 = (player.room === 29 || player.room === 30);
  const equipRoom = (room.type % 10 === 1);
  const sabotageOK = noEnemies && equipRoom && !(room.damage === 2 && player.room !== 28);
  const princessHere = (princess.room === player.room && princess.room !== 0);
  const wookieHere   = (wookie.room   === player.room && wookie.room   !== 0);
  const followerHere = princessHere || wookieHere;
  const vaderHere    = (vader.room   === player.room && vader.room   !== 0);
  const hasEnemies   = (s9 > 0) || vaderHere;

  // Renumber visible buttons in a menu so keys are always 1, 2, 3…
  // Hidden buttons get data-key cleared so they don't shadow the
  // renumbered keys in querySelector lookups.
  const renumberMenu = (wrapId: string): void => {
    let n = 1;
    for (const btn of document.querySelectorAll('#' + wrapId + ' .menu button')) {
      const b = btn as HTMLElement;
      if (b.style.display === 'none') {
        b.dataset.key = '';
        continue;
      }
      const key = String(n++);
      b.dataset.key = key;
      const hint = b.querySelector('.key-hint');
      if (hint) hint.textContent = key;
    }
  };
  const setBtn = (cmd: string, vis: boolean): void => {
    const b = palette.querySelector('button[data-cmd="' + cmd.replace(/"/g, '\\"') + '"]') as HTMLButtonElement | null;
    if (b) b.style.display = vis ? '' : 'none';
  };
  const setWrap = (id: string, vis: boolean): void => {
    const w = document.getElementById(id);
    if (w) w.style.display = vis ? '' : 'none';
  };

  // Always: LOOK, HELP, FLEE
  setBtn('LOOK', true);
  setBtn('HELP', true);
  setBtn('FLEE', true);

  // Player-state-gated singletons
  setBtn('SABRE',    player.sabre > 0);
  setBtn('TOSS',     noEnemies && at29or30 && !flags.ropeUp);
  setBtn('SWING',    noEnemies && at29or30 &&  flags.ropeUp);
  setBtn('SABOTAGE', sabotageOK);
  setBtn('TAKE-OFF', player.room === 1);

  // Reflect the sabre on/off state on the SABRE button itself.
  const sabreBtn = palette.querySelector('button[data-cmd="SABRE"]');
  if (sabreBtn) sabreBtn.classList.toggle('is-on', !!flags.sabreOn);

  // Reflect the current room's equipment damage on the SABOTAGE button as
  // a lifebar: undamaged = full, damage 1 = half, damage 2 = empty.
  // (At damage 2 outside room 28, the button itself is hidden anyway.)
  const sabotageBtn = palette.querySelector('button[data-cmd="SABOTAGE"]') as HTMLElement | null;
  if (sabotageBtn) {
    if (sabotageOK) {
      sabotageBtn.classList.add('lifebar');
      const bar = (room.sabotageBar !== undefined) ? room.sabotageBar : 1.0;
      sabotageBtn.style.setProperty('--life', bar + '');
    } else {
      sabotageBtn.classList.remove('lifebar');
      sabotageBtn.style.removeProperty('--life');
    }
  }

  // GET dropdown
  const canGet = noEnemies && (room.shields > 0 || room.blasters > 0);
  setWrap('wrap-get', canGet);
  setBtn('GET SHIELD',  room.shields > 0);
  setBtn('GET BLASTER', room.blasters > 0);
  setBtn('GET ALL',     room.shields > 0 || room.blasters > 0);

  // DROP dropdown
  const canDrop = noEnemies && (player.shield > 0 || player.blaster > 0);
  setWrap('wrap-drop', canDrop);
  setBtn('DROP SHIELD',  player.shield > 0);
  setBtn('DROP BLASTER', player.blaster > 0);

  // ATTACK dropdown (player has weapons or hands; HANDS always available
  // when an enemy is here)
  setWrap('wrap-attack', hasEnemies);
  setBtn('ATTACK SABRE',   player.sabre   > 0 && flags.sabreOn);
  setBtn('ATTACK BLASTER', player.blaster > 0);
  setBtn('ATTACK HANDS',   true);

  // CHARGE dropdown (only meaningful with a follower AND an enemy).
  // Three columns: princess (left), player (middle), wookie (right). Each
  // column shows only the options that are actually possible — e.g.
  // SHOOT hidden if the follower has no blaster, SABRE hidden if the
  // player has no sabre. Player column is always visible when CHARGE
  // is. Follower columns appear only when that follower is in the room.
  setWrap('wrap-charge', hasEnemies && followerHere);
  const setColEl = (sel: string, vis: boolean): void => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) el.style.display = vis ? '' : 'none';
  };
  const setColBtn = (key: string, vis: boolean): void => {
    const b = document.querySelector('button[data-charge-pick="' + key + '"]') as HTMLElement | null;
    if (b) b.style.display = vis ? '' : 'none';
  };
  setColEl('.charge-col[data-charge-col="princess"]', princessHere);
  setColEl('.charge-col[data-charge-col="wookie"]',   wookieHere);
  // Princess column buttons
  setColBtn('princess:S', princessHere && princess.blaster > 0);
  setColBtn('princess:A', princessHere);
  setColBtn('princess:N', princessHere);
  // Player column: label = player's name
  const playerLabel = document.querySelector('.charge-col[data-charge-col="player"] .charge-col-label') as HTMLElement | null;
  if (playerLabel) playerLabel.textContent = player.name || 'YOU';
  setColBtn('player:S', player.sabre   > 0 && flags.sabreOn);
  setColBtn('player:B', player.blaster > 0);
  setColBtn('player:H', true);
  // Wookie column buttons
  setColBtn('wookie:S', wookieHere && wookie.blaster > 0);
  setColBtn('wookie:A', wookieHere);
  setColBtn('wookie:N', wookieHere);
  // Renumber each charge column so keys are sequential 1, 2, 3…
  for (const col of document.querySelectorAll('#wrap-charge .charge-col')) {
    let n = 1;
    for (const btn of col.querySelectorAll('button')) {
      const b = btn as HTMLElement;
      if (b.style.display === 'none') { b.dataset.key = ''; continue; }
      const key = String(n++);
      b.dataset.key = key;
      const hint = b.querySelector('.key-hint');
      if (hint) hint.textContent = key;
    }
  }

  // ORDER dropdown
  setWrap('wrap-order', followerHere);
  setBtn('ORDER PRINCESS SHOOT',  princessHere && princess.blaster > 0);
  setBtn('ORDER PRINCESS ATTACK', princessHere);
  setBtn('ORDER PRINCESS WAIT',   princessHere);
  setBtn('ORDER WOOKIE SHOOT',    wookieHere   && wookie.blaster   > 0);
  setBtn('ORDER WOOKIE ATTACK',   wookieHere);
  setBtn('ORDER WOOKIE WAIT',     wookieHere);
  renumberMenu('wrap-order');

  // GIVE dropdown
  const canGive = followerHere && (player.shield > 0 || player.blaster > 0);
  setWrap('wrap-give', canGive);
  setBtn('GIVE PRINCESS SHIELD',  princessHere && player.shield  > 0 && princess.shield  === 0);
  setBtn('GIVE PRINCESS BLASTER', princessHere && player.blaster > 0 && princess.blaster === 0);
  setBtn('GIVE WOOKIE SHIELD',    wookieHere   && player.shield  > 0 && wookie.shield    === 0);
  setBtn('GIVE WOOKIE BLASTER',   wookieHere   && player.blaster > 0 && wookie.blaster   === 0);
  renumberMenu('wrap-give');

  // Auto-Attack: one-click "best usable weapon" attack, sitting next to
  // ATTACK in the palette. Shown only when there's an enemy here. The
  // weapon choice still happens at click time via pickBestWeapon — the
  // label just stays "Auto-Attack" so the button doesn't grow/shrink
  // as the chosen weapon changes.
  const autoAttackBtn = document.getElementById('auto-attack-btn');
  if (autoAttackBtn) {
    autoAttackBtn.style.display = hasEnemies ? '' : 'none';
  }
}

// Returns the weapon name the Auto-Attack button should fire. Compares
// the damage potential of each currently-usable weapon and picks the
// strongest. Sabre damage = current HP (but only usable if sabre count
// > 0 AND sabre is toggled ON). Blaster damage = atk (usable if blaster
// count > 0). Hands damage = HP/2 (always usable). When equipped sabre
// is OFF, it's treated as unusable per the spec — we skip it instead
// of auto-toggling.
function pickBestWeapon(): string {
  let best = 'HANDS';
  let power = player.hp / 2;
  if (player.sabre > 0 && flags.sabreOn && player.hp > power) {
    best  = 'SABRE';
    power = player.hp;
  }
  if (player.blaster > 0 && player.atk > power) {
    best  = 'BLASTER';
    power = player.atk;
  }
  return best;
}

// -------- Sound (Web Audio) --------
// Faithful-ish approximations of the BASIC speaker-toggle sounds.
// The 6502 routine at 770 toggles $C030 in a TA*DN cycle. We map TA range
// to a pitch sweep and DN to step duration. Calls must be user-gesture
// gated, but our title screen requires a click to dismiss so we're fine.
let audioCtx: AudioContext | null = null;
let nextSoundTime = 0;
function ensureAudio(): AudioContext | null {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)(); }
    catch (e) { audioCtx = null; return null; }
  }
  // Browsers that gate audio behind a user gesture park new contexts in
  // 'suspended' state. We dismiss the title screen and briefing with key
  // presses, so the first SND call lands after a gesture; resume() unlocks.
  if (audioCtx.state === 'suspended') {
    try { audioCtx.resume(); } catch (e) { /* ignore */ }
  }
  return audioCtx;
}
function playTone(ab: number, ae: number, dn: number, cf: number): void {
  const ctx = ensureAudio();
  if (!ctx) return;
  const peakGain = 0.15;
  let t = Math.max(ctx.currentTime + 0.001, nextSoundTime);
  for (let c = 0; c < cf; c++) {
    const step = (ab <= ae) ? 1 : -1;
    for (let ta = ab; (step > 0 ? ta <= ae : ta >= ae); ta += step) {
      // 6502 routine at address 770 (loaded from DATA at BASIC line 540):
      //   LDA $C030   ; toggle speaker
      //   DEY / BNE / DEX / BNE  inner loop (10 cyc/iter)
      //   when X=0: LDX $00 (reload TA), JMP back to toggle
      //   when Y=0: DEC DN, BEQ → RTS if done
      // Half-period = TA*10+9 machine cycles. DN controls duration:
      // ~256*DN/TA speaker toggles per CALL 770 invocation.
      const halfCyc = Math.max(1, ta) * 10 + 9;
      const freq = Math.max(20, Math.min(15000, 1023000 / (2 * halfCyc)));
      const toggles = Math.max(2, 256 * Math.max(1, dn) / Math.max(1, ta));
      const stepDur = toggles * halfCyc / 1023000;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      // Quick attack, hold, then linear release in the last 25% of step.
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(peakGain, t + stepDur * 0.05);
      gain.gain.setValueAtTime(peakGain, t + stepDur * 0.75);
      gain.gain.linearRampToValueAtTime(0, t + stepDur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + stepDur + 0.005);
      t += stepDur + 0.011;
    }
  }
  nextSoundTime = t;
}
function toneDuration(ab: number, ae: number, dn: number, cf: number): number {
  let total = 0;
  const step = (ab <= ae) ? 1 : -1;
  for (let c = 0; c < cf; c++) {
    for (let ta = ab; (step > 0 ? ta <= ae : ta >= ae); ta += step) {
      const halfCyc = Math.max(1, ta) * 10 + 9;
      const toggles = Math.max(2, 256 * Math.max(1, dn) / Math.max(1, ta));
      total += toggles * halfCyc / 1023000 + 0.011;
    }
  }
  return total * 1000;
}
function queueSound(play: () => void, durationMs: number): void {
  if (lineDelay === 0) { play(); return; }
  let target = pendingLines.length > 0 ? pendingLines[pendingLines.length - 1] : lineWrap;
  if (!target) {
    target = document.createElement('span');
    target.style.display = 'none';
    messages.appendChild(target);
    pendingLines.push(target);
  }
  let arr = lineSounds.get(target);
  if (!arr) { arr = []; lineSounds.set(target, arr); }
  arr.push({play, durationMs});
}
function snd(ab: number, ae: number, dn: number, cf: number): void {
  queueSound(() => playTone(ab, ae, dn, cf), toneDuration(ab, ae, dn, cf));
}
const SND = {
  takeoff:    () => snd(1,   10,  5,  4),  // BASIC 2740
  blaster:    () => snd(5,   20,  3,  1),  // BASIC 2750
  sabotage:   () => snd(25,  30,  5,  1),  // BASIC 2760
  explosion:  () => snd(20,  20, 50,  6),  // BASIC 2770
  kill:       () => { snd(75, 75, 30, 1); snd(11, 15, 2, 4); },  // BASIC 2780 falls through to 2790
  weaponBust: () => snd(11,  15,  2,  4),  // BASIC 2790
  sabre:      () => snd(100, 115, 3,  1),  // BASIC 2800
  click:      () => snd(50,  50,  1,  1),  // BASIC 2820 short click
};

// -------- Combat resolution (BASIC line 840) --------
// Returns true if the attack at least registered (hit OR miss counts as a turn).
// P1 = target index. For P1=5 (soldier), the "defender" is S(S9,1) [the last
// soldier's defense in the room], reflecting BASIC's quirk; we mimic that.
function combatResolve(A1: number, D1: number, P1: number): void {
  const roll = irand(7) - 3;        // -3..+3
  const hit = A1 - D1 + roll;
  if (hit < 0) {
    out(' A MISS!'); nl();
    return;
  }
  if (P1 === 5) {
    // Soldier dies in one hit
    out(' SOLDIER--HIT AND KILLED!'); nl();
    kills++; s9--;
    const room = rooms[player.room]!;
    room.blasters++; room.shields++; room.soldiers--;
    if (room.soldiers < 0) { s9 = 0; room.soldiers = 0; }
    // Drop the last soldier from current room's stat array
    curSoldiers.pop();
    SND.kill();
    return;
  }
  // NPC: roll 0..3 damage
  const dmg = irand(4);
  const target = chars[P1]!;
  target.hp -= dmg;
  out(' A HIT!'); nl();
  if (target.hp <= 0) {
    out(' A KILLING BLOW!'); nl();
    target.room = 0;       // BASIC: P(P1,1) = 0 = dead
    SND.kill();
    return;
  }
  SND.weaponBust();
  // Equipment destroy: dmg in {1,2,3} indexes shield/blaster/sabre
  if (dmg === 0) return;
  const wpnField = (['shield', 'blaster', 'sabre'] as const)[dmg - 1];
  if (target[wpnField] > 0) {
    out(' A ' + WPN[dmg] + ' WAS DESTROYED'); nl();
    target[wpnField]--;
  }
}

// -------- Enter-room logic (BASIC 1750-1820) --------

function enterRoom(): void {
  // Reveal any buffered lines before restructuring the DOM.
  flushLines();
  // Next renderStatus() call will reveal lines with delay.
  statusSlow = true;
  // Wrap all existing messages into a "dim-past" container so the
  // current room's content stands out at full brightness, and
  // everything before is one shade dimmer. Multi-room sessions chain
  // these wrappers, but CSS uses absolute colors so all old text is
  // the same dim level regardless of nesting depth.
  if (messages.firstChild) {
    const wrap = document.createElement('div');
    wrap.className = 'dim-past';
    while (messages.firstChild) {
      wrap.appendChild(messages.firstChild);
    }
    messages.appendChild(wrap);
  }
  sceneBreak();
  // Princess auto-join (line 1750)
  if (player.room === -princess.room) {
    out('YOU FOUND THE PRINCESS.'); nl();
    out('SHE THANKS YOU AND FOLLOWS YOU.'); nl();
    princess.room = player.room;
  }
  // Wookie: 1760-1790
  if (player.room === -wookie.room) {
    if (wookie.friendly) {
      wookie.room = player.room;
    } else {
      out('YOU ARE GREETED BY A LARGE, EXTREMELY'); nl();
      out('DANGEROUS-LOOKING WOOKIE.'); nl();
      if (Math.random() < 0.25) {
        out('HE CHARGES AND RIPS YOUR ARMS OUT.', 'inverse'); nl();
        die();
        return;
      }
      out('FORTUNATLEY, HE DECIDES TO JOIN UP'); nl();
      out('WITH YOU.'); nl();
      wookie.room = player.room;
      wookie.friendly = 1;
    }
  }
  // Re-roll soldier stats for the new room (BASIC 1810)
  s9 = rooms[player.room]!.soldiers;
  curSoldiers = [];
  for (let s = 0; s < s9; s++) {
    curSoldiers.push({ def: irand(16), atk: irand(16) });
  }
}

// -------- Per-turn machinery (BASIC 570-770) --------

function vaderMove(): void {
  if (vader.room === 0) return;                 // dead
  if (vader.room === player.room) return;       // already with player
  // Pick random direction with valid exit (line 590)
  let tries = 50, target = 0;
  while (tries-- > 0) {
    const x = irand(4);
    const room = rooms[vader.room]!;
    const exits = [room.n, room.e, room.w, room.s];
    if (exits[x] >= 1) { target = exits[x]; break; }
  }
  if (target === 0) return;                     // stuck (very unlikely)
  vader.room = target;
  if (vader.room === player.room) {
    out('***DARTH VADER HAS ARRIVED***', 'flash'); nl();
    SND.sabre();
  }
}

function vaderAttack(): void {
  if (vader.room !== player.room) return;
  if (vader.room === 0) return;
  let A1;
  if (vader.sabre > 0) {
    out('DARTH VADER SWINGS AT YOU WITH HIS LIGHT SABRE!'); nl();
    SND.sabre();
    A1 = vader.hp;        // BASIC: A1 = P(4,2) (sabre power = hp stat)
  } else {
    out('DARTH VADER SWINGS AT YOU WITH HIS FIST!'); nl();
    A1 = vader.hp / 2;
  }
  combatResolve(A1, player.hp, 1);
  if (player.room === 0) die();
}

function soldiersShoot(): void {
  if (s9 === 0) return;
  for (let s = 0; s < s9; s++) {
    if (Math.random() < 0.1) continue;          // 10% skip
    // Pick valid target P1 in 1..5 (line 700)
    let P1 = 0, retries = 100;
    while (retries-- > 0) {
      P1 = 1 + irand(5);
      if (P1 === 5) break;
      const c = chars[P1]!;
      if (player.room === Math.abs(c.room)) break;
    }
    if (retries < 0) continue;
    const stat = curSoldiers[s];
    if (!stat) break;                           // soldier killed mid-loop
    out('A SOLDIER FIRES AT ' + (P1 === 1 ? player.name : NAMES[P1])); nl();
    let A1 = stat.atk;
    // BASIC line 710 quirk: D1 defaults to S(S9,1) (last soldier's def)
    let D1 = (s9 > 0 && curSoldiers[s9 - 1]) ? curSoldiers[s9 - 1].def : 0;
    let J = 5 / 4;
    if (P1 !== 5) {
      D1 = chars[P1]!.hp;
      if (chars[P1]!.shield === 0) J = 1;
    }
    D1 = D1 * J;
    SND.blaster();
    combatResolve(A1, D1, P1);
    if (player.room === 0) { die(); return; }
  }
}

function followerEscape(): void {
  // BASIC 750: if Vader not with player, and an unrescued follower's room
  // is the negation of Vader's room, follower flees to random detention cell.
  if (vader.room === 0) return;
  if (vader.room === player.room) return;
  for (const c of [princess, wookie]) {
    if (c.room === -vader.room) {
      c.room = -(31 + irand(12));
    }
  }
}

function selfRepair(): void {
  // BASIC 770: random room 1-30, if damage=1 reset to 0
  const r = 1 + irand(30);
  if (rooms[r]!.damage === 1) {
    rooms[r]!.damage = 0;
    rooms[r]!.sabotageBar = 1.0;
  }
}

function timeWarn(): void {
  // BASIC 620: IF T8 = INT(10*RND(1)) - true ~1/10 of the time when t8 < 10
  if (t8 === irand(10)) {
    out('TIME IS ALMOST OUT', 'inverse'); nl();
  }
}

// -------- Death and end-of-time --------

function die(): void {
  out('YOU ARE DEAD.'); nl();
  player.room = 0;
  gameOver = true;
}

function timeExpired(): void {
  if (flags.selfDestruct) {
    out('THE DEATH STAR JUST EXPLODED.', 'inverse'); nl();
    out('UNFORTUNATELY, YOU WERE STILL ABOARD', 'inverse'); nl();
  } else {
    out('THE FORCE FINALLY GAVE UP ON YOU.', 'inverse'); nl();
  }
  die();
}

// -------- Endgame scoring (BASIC 2280-2500) --------

let lastBreakdown: ScoreBreakdown | null = null;

function computeScoreBreakdown(): ScoreBreakdown {
  // `kills` is still the soldier kill count at this point; showScore is
  // about to fold all the bonuses into it. Snapshot first.
  const soldierKills = kills;
  const b: ScoreBreakdown = {
    soldierKills,
    escaped: player.room === 1,
    rescuedPrincess: player.room === 1 && princess.room === 1,
    abandonedWookie: player.room === 1 && wookie.room < 0 && !!wookie.friendly,
    killedVader: vader.room === 0,
    selfDestruct: !!flags.selfDestruct,
    damageRepairable: 0,
    damagePermanent: 0,
    keyRoomsDamaged: [],
    total: 0,
    tier: '',
  };
  for (let x = 1; x <= 30; x++) {
    if (rooms[x]!.damage === 1) b.damageRepairable++;
    else if (rooms[x]!.damage === 2) b.damagePermanent++;
  }
  const NAMED = [
    [7,  'WEAPONRY MACHINERY ROOM'],
    [13, 'COMMAND CONTROL ROOM'],
    [28, 'POWER MACHINERY ROOM'],
  ] as const;
  for (const [r, name] of NAMED) {
    if (rooms[r]!.damage > 0) b.keyRoomsDamaged.push(name);
  }
  let total = soldierKills;
  total += b.escaped ? 10 : -10;
  if (b.rescuedPrincess) total += 25;
  if (b.abandonedWookie) total -= 25;
  if (b.killedVader) total += 25;
  if (b.selfDestruct) {
    total += 100;
  } else {
    total += 3 * b.damageRepairable + 5 * b.damagePermanent;
    total += 10 * b.keyRoomsDamaged.length;
  }
  b.total = total;
  const tier = Math.floor(Math.abs(total) / 25) + 1;
  const tiers = ['TERRIBLE', 'BAD', 'FAIR', 'GOOD', 'VERY GOOD',
                 'INCREDIBLY GOOD', 'ABSOLUTELY UNBELIEVABLE'];
  b.tier = tiers[Math.min(tier - 1, 6)];
  return b;
}

function showScore(): void {
  const b = computeScoreBreakdown();
  lastBreakdown = b;

  nl();
  out("LET'S SEE HOW YOU DID."); nl();
  out('YOU KILLED ' + b.soldierKills + ' IMPERIAL SOLDIERS.'); nl();
  if (!b.escaped) {
    out("YOU DIDN'T MAKE IT OUT ALIVE."); nl();
  } else {
    out('YOU ESCAPED ');
    if (b.rescuedPrincess) out('WITH THE PRINCESS!');
    nl();
    if (b.abandonedWookie) {
      out('YOU ABANDONED THE WOOKIE, YOU CAD!'); nl();
    }
  }
  nl();
  if (b.killedVader) {
    out('YOU KILLED DARTH VADER.'); nl();
  }
  if (b.selfDestruct) {
    out('YOU DESTROYED THE DEATH STAR!'); nl();
  } else {
    const dTotal = b.damageRepairable + b.damagePermanent;
    out(dTotal + ' ROOMS WERE DAMAGED, HOWEVER,'); nl();
    out(b.damageRepairable + ' OF THEM COULD BE REPAIRED.'); nl();
    for (const name of b.keyRoomsDamaged) {
      out('THE ' + name + ' WAS DAMAGED'); nl();
    }
  }
  nl();
  kills = b.total;
  out('YOUR FINAL SCORE WAS ' + b.total); nl();
  out('ALL IN ALL,'); nl();
  out('YOU WERE ' + b.tier); nl();
}

function showScoreBreakdown(): void {
  if (!lastBreakdown) { out('(NO SCORE TO BREAK DOWN)'); nl(); return; }
  const b = lastBreakdown;
  const row = (label: string, points: number): void => {
    const p = (points >= 0 ? '+' : '') + points;
    // Pad label to fixed width; messages column is narrow so keep tight.
    const padded = label.length >= 26 ? label + ' ' : label.padEnd(26, ' ');
    out(padded + p); nl();
  };
  nl();
  out('=== SCORE BREAKDOWN ==='); nl();
  if (b.soldierKills > 0) row('SOLDIERS KILLED (' + b.soldierKills + ')', b.soldierKills);
  row(b.escaped ? 'ESCAPED ALIVE' : 'DIED IN THE DEATH STAR', b.escaped ? 10 : -10);
  if (b.rescuedPrincess) row('RESCUED THE PRINCESS', 25);
  if (b.abandonedWookie)  row('ABANDONED THE WOOKIE', -25);
  if (b.killedVader)      row('KILLED DARTH VADER', 25);
  if (b.selfDestruct) {
    row('SELF-DESTRUCT BONUS', 100);
  } else {
    if (b.damageRepairable > 0)
      row('REPAIRABLE DAMAGE (' + b.damageRepairable + ')', 3 * b.damageRepairable);
    if (b.damagePermanent > 0)
      row('PERMANENT DAMAGE (' + b.damagePermanent + ')', 5 * b.damagePermanent);
    if (b.keyRoomsDamaged.length > 0)
      row('KEY ROOMS DAMAGED (' + b.keyRoomsDamaged.length + ')', 10 * b.keyRoomsDamaged.length);
  }
  out('---------------------------------'); nl();
  row('TOTAL', b.total);
  out('RATING: ' + b.tier); nl();
}

// -------- Command handlers (each returns true if turn was consumed) --------

function blockedByEnemies(): boolean {
  return rooms[player.room]!.soldiers > 0 || player.room === vader.room;
}
function emitBlocked(): void {
  out("YOU CAN'T DO THAT WHILE ENEMIES ARE IN THE ROOM!"); nl();
}

function cmdLook(): boolean {
  const room = rooms[player.room]!;
  const exits = [room.n, room.e, room.w, room.s];
  let any = false;
  for (let x = 0; x < 4; x++) {
    if (exits[x] === 0) continue;
    let target;
    if (exits[x] < 0) {
      out('ACROSS A WIDE CHASM'); nl();
      target = -exits[x];
    } else {
      target = exits[x];
    }
    out('TO THE ' + Pdir[x + 1] + ' IS THE'); nl();
    out(getRoomName(target)); nl();
    any = true;
  }
  if (!any) { out('NOWHERE TO GO FROM HERE.'); nl(); }
  return true; // BASIC LOOK ends with RETURN -> turn consumed
}

async function cmdMove(rest: string): Promise<boolean> {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  let d = (rest && rest.length) ? rest[0] : '';
  while (d === '' || 'NEWS'.indexOf(d) === -1) {
    const ans = await input('DO YOU WANT TO MOVE NORTH, EAST, WEST,\n OR SOUTH (N,E,W,S)');
    d = ans[0] || '';
  }
  const room = rooms[player.room]!;
  const exits = [room.n, room.e, room.w, room.s];
  const dirIdx = 'NEWS'.indexOf(d);
  const t = exits[dirIdx];
  if (t <= 0) { out("YOU CAN'T GO THAT WAY."); nl(); return false; }
  out('OK'); nl();
  const fromRoom = player.room;
  // Followers in player's pre-move room come along (BASIC 1730)
  if (princess.room === fromRoom) princess.room = t;
  if (wookie.room === fromRoom) wookie.room = t;
  player.room = t;
  visited.add(t);
  enterRoom();
  return true;
}

async function cmdGet(rest: string): Promise<boolean> {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  let what = (rest && rest.length) ? rest[0] : '';
  while (what === '' || 'SBA'.indexOf(what) === -1) {
    const ans = await input('WHAT DO YOU WANT TO GET, A SHIELD, A\n BLASTER, OR ALL (S,B,OR A)');
    what = ans[0] || '';
  }
  const room = rooms[player.room]!;
  if (what === 'A') {
    let n = 0;
    while (room.shields > 0)  { room.shields--;  player.shield++;  n++; SND.click(); }
    while (room.blasters > 0) { room.blasters--; player.blaster++; n++; SND.click(); }
    out(n ? 'OK.' : "THERE'S NOTHING TO PICK UP"); nl();
  } else if (what === 'S') {
    if (room.shields === 0) { out("THERE AREN'T ANY SHIELDS"); nl(); out(' TO PICK UP'); nl(); return false; }
    else { room.shields--; player.shield++; out('OK.'); nl(); SND.click(); }
  } else {
    if (room.blasters === 0) { out("THERE AREN'T ANY BLASTERS"); nl(); out(' TO PICK UP'); nl(); return false; }
    else { room.blasters--; player.blaster++; out('OK.'); nl(); SND.click(); }
  }
  return false; // BASIC GET ends with GOTO 820 -> no turn
}

async function cmdDrop(rest: string): Promise<boolean> {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  let what = (rest && rest.length) ? rest[0] : '';
  while (what === '' || 'SB'.indexOf(what) === -1) {
    const ans = await input('WHAT DO YOU WANT TO DROP, A SHIELD OR\n BLASTER (S OR B)');
    what = ans[0] || '';
  }
  const room = rooms[player.room]!;
  if (what === 'S') {
    if (player.shield === 0) { out("YOU AREN'T CARRYING A SHIELD"); nl(); return false; }
    player.shield--; room.shields++; out('OK.'); nl(); SND.click();
  } else {
    if (player.blaster === 0) { out("YOU AREN'T CARRYING A BLASTER"); nl(); return false; }
    player.blaster--; room.blasters++; out('OK.'); nl(); SND.click();
  }
  return false; // BASIC DROP ends with GOTO 820 -> no turn
}

function cmdSabre(): boolean {
  flags.sabreOn = !flags.sabreOn;
  SND.sabre();
  return true;
}

function cmdSabotage(): boolean {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  const room = rooms[player.room]!;
  if (room.type % 10 !== 1) {
    out("THERE'S NOTHING TO SABOTAGE HERE"); nl();
    return false;
  }
  if (room.damage === 2 && player.room !== 28) {
    out("WHY? THE ROOM'S ALREADY IRREPAIRABLY"); nl();
    out('DESTROYED.'); nl();
    return false;
  }
  SND.sabotage();
  const before = room.damage;
  const roll = irand(3);
  room.damage = Math.min(2, before + roll);
  // Visual lifebar: three "stops" at 1, 2/3, 1/3, 0. A damage roll snaps the
  // bar to the next stop below; a no-damage roll slides it halfway toward
  // the next stop. State of 2 forces the bar to 0 so bar and game-state
  // agree at the endpoints (in case a single roll jumps state 0 -> 2).
  if (room.sabotageBar === undefined) room.sabotageBar = 1.0;
  const oldBar = room.sabotageBar;
  let next;
  if (oldBar > 2/3 + 0.001) next = 2/3;
  else if (oldBar > 1/3 + 0.001) next = 1/3;
  else next = 0;
  if (room.damage > before) {
    room.sabotageBar = next;
  } else {
    room.sabotageBar = (oldBar + next) / 2;
  }
  if (room.damage === 2) room.sabotageBar = 0;
  if (room.damage === 2 && player.room === 28 && Math.random() < 0.25) {
    SND.explosion();
    out("CONGRATULATIONS. YOU JUST STARTED THE"); nl();
    out("DEATH STAR'S SELF-DESTRUCT DEVICE."); nl();
    t8 = 3 + irand(10);
    out("UH--YOU'D BETTER GET OUT OF HERE."); nl();
    flags.selfDestruct = true;
  }
  return true;
}

function cmdToss(): boolean {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  if (flags.ropeUp) { out("THE ROPE'S ALREADY UP!"); nl(); return false; }
  if (player.room !== 29 && player.room !== 30) {
    out('HOW DO YOU EXPECT TO CONNECT THE ROPE'); nl();
    out('FROM THE ' + getRoomName(player.room) + '?'); nl();
    return false;
  }
  out('THE ROPE SWINGS--FLIES--AND ');
  if (Math.random() < 0.5) {
    out('MISSES.'); nl();
    out('BETTER LUCK NEXT TIME.'); nl();
  } else {
    out('CATCHES.'); nl();
    out('GOOD SHOT!'); nl();
    flags.ropeUp = true;
  }
  return true;
}

function cmdSwing(): boolean {
  if (blockedByEnemies()) { emitBlocked(); return false; }
  if (!flags.ropeUp) { out("THE ROPE ISN'T UP!"); nl(); return false; }
  if (player.room !== 29 && player.room !== 30) {
    out('HOW DO YOU EXPECT TO SWING ON THE ROPE'); nl();
    out('FROM THE ' + getRoomName(player.room) + '?'); nl();
    return false;
  }
  let J = 1;
  out('THE PEOPLE SWINGING ARE--'); nl();
  out('  YOU'); nl();
  if (princess.room === player.room) { out('    ' + NAMES[2]); nl(); J += 1; }
  if (wookie.room   === player.room) { out('    ' + NAMES[3]); nl(); J += 2; }
  out('OKAY, NOW'); nl();
  out('. . . UP, UP, AND AWAY--'); nl();
  if (J > 1 + irand(4)) {
    out('EGAD, THE ROPE BROKE', 'inverse'); nl();
    die();
    return true;
  }
  out('THE ROPE HELD, LUCKY YOU'); nl();
  const dest = (player.room === 30) ? 29 : 30;
  if (princess.room === player.room) princess.room = dest;
  if (wookie.room   === player.room) wookie.room   = dest;
  player.room = dest;
  visited.add(dest);
  enterRoom();
  return true;
}

function cmdTakeOff(): boolean {
  if (player.room !== 1) {
    out('HOW CAN YOU TAKE OFF FROM THE'); nl();
    out('    ' + getRoomName(player.room) + '?'); nl();
    return false;
  }
  SND.takeoff();
  out('THE MILLENIUM FALCON IS TAKING OFF.'); nl();
  out('LEAVING HANGER NOW.'); nl();
  out('APPROACHING TRACTOR BEAM.'); nl();
  if (rooms[9]!.damage === 0 && rooms[28]!.damage === 0) {
    out('THE TRACTOR BEAM LATCHES ON.', 'inverse'); nl();
    out('STRESSES TEAR THE MILLENIUM FALCON', 'inverse'); nl();
    out('INTO ITSY-BITSY PIECES.', 'inverse'); nl();
    die();
    return true;
  }
  out('TRACTOR BEAM IS INOPERABLE.'); nl();
  out('CONGRATULATIONS ON A REMARKABLE ESCAPE.'); nl();
  gameOver = true;
  // Stays in room 1 -> escape path in scoring
  return true;
}

async function cmdGive(rest: string): Promise<boolean> {
  let r = (rest || '').trim();
  let who = r ? r[0] : '';
  while (who === '' || 'PW'.indexOf(who) === -1) {
    const ans = await input('DO YOU WANT TO GIVE TO THE PRINCESS OR\n THE WOOKIE (P OR W)');
    who = ans[0] || '';
  }
  const C = (who === 'W') ? 2 : 1;       // C=1 princess, C=2 wookie (BASIC offset)
  const target = chars[C + 1]!;
  if (player.room !== target.room) {
    out(NAMES[C + 1] + " ISN'T HERE!"); nl();
    return false;
  }
  // Optional second token
  let rest2 = r.indexOf(' ') === -1 ? '' : r.slice(r.indexOf(' ') + 1).trim();
  let what = rest2 ? rest2[0] : '';
  while (what === '' || 'SB'.indexOf(what) === -1) {
    const ans = await input('DO YOU WANT TO GIVE A SHIELD OR A\n BLASTER (S OR B)');
    what = ans[0] || '';
  }
  const C1 = (what === 'B') ? 2 : 1;     // C1=1 shield, C1=2 blaster
  const playerField = (['shield', 'blaster'] as const)[C1 - 1];
  const targetField = playerField;
  if (player[playerField] === 0) {
    out("YOU DON'T HAVE ONE TO GIVE"); nl();
    return false;
  }
  if (target[targetField] > 0) {
    out('SORRY, BUT A FOLLOWER CAN ONLY CARRY'); nl();
    out('ONE OF EACH WEAPON.'); nl();
    return false;
  }
  out('OK.'); nl();
  player[playerField]--;
  target[targetField] = 1;
  return true;
}

function cmdFlee(): boolean {
  out('OK, SCATTER'); nl();
  const here = player.room;
  const room = rooms[here]!;
  const exits = [room.n, room.e, room.w, room.s];
  // For each follower (and player), random direction (BASIC 1550 iterates X=3..1)
  for (const c of [wookie, princess]) {
    if (c.room !== here) continue;
    const y = irand(4);
    if (exits[y] > 0) c.room = exits[y];
  }
  // Player also picks random direction
  const py = irand(4);
  if (exits[py] > 0) {
    const dest = exits[py];
    player.room = dest;
    visited.add(dest);
  }
  // Followers not with player become "lost" (negative)
  if (princess.room !== player.room && princess.room > 0) princess.room = -princess.room;
  if (wookie.room   !== player.room && wookie.room   > 0) wookie.room   = -wookie.room;
  enterRoom();
  return true;
}

// ATTACK helper: player or follower performs one attack with weapon C
// (1=blaster, 2=sabre, 3=hands). attacker = 1 (player) or 2/3 (follower).
// Returns true if attack actually resolved (turn-consuming for top-level
// ATTACK; CHARGE wraps regardless).
function performAttack(P: number, C: number, F1: boolean): boolean | 'retry' {
  const attacker = chars[P]!;
  // Check player weapon (BASIC 1860): for blaster (C=1) check P(P,5);
  // for sabre (C=2) check P(P,6); for hands (C=3) skip.
  if (C === 1 || C === 2) {
    const wpn = (C === 1) ? attacker.blaster : attacker.sabre;
    if (wpn <= 0) {
      out("YOU DON'T HAVE A " + WPN[C + 1]); nl();
      return F1 ? 'retry' : false;
    }
  }
  // Find target: Vader > soldier > none
  let P1, D1;
  if (player.room === vader.room && vader.room !== 0) {
    out('ATTACKING DARTH VADER'); nl();
    P1 = 4; D1 = vader.hp;
  } else if (s9 > 0) {
    out('ATTACKING AN IMPERIAL SOLDIER'); nl();
    P1 = 5;
    const last = curSoldiers[s9 - 1];
    D1 = last ? last.def : 0;
  } else {
    out('NOBODY TO ATTACK'); nl();
    return false;
  }
  if (C === 1) {
    // Blaster
    if (attacker.blaster <= 0) {
      out("YOU DON'T HAVE A BLASTER!"); nl();
      return F1 ? 'retry' : false;
    }
    SND.blaster();
    // Shield bonus only if defender is Vader and has shield (BASIC 2000-2020)
    if (P1 === 4 && vader.shield > 0) D1 = D1 * 5 / 4;
    const A1 = attacker.atk;
    combatResolve(A1, D1, P1);
    return true;
  } else if (C === 2) {
    // Sabre
    if (attacker.sabre <= 0) {
      out("YOU DON'T HAVE A LIGHT-SABRE!"); nl();
      return F1 ? 'retry' : false;
    }
    if (P === 1 && !flags.sabreOn) {
      out('YOU KNOW, IT HELPS IF YOU TURN ON'); nl();
      out('YOUR LIGHT-SABRE'); nl();
      return F1 ? 'retry' : false;
    }
    SND.sabre();
    combatResolve(attacker.hp, D1, P1);
    return true;
  } else {
    // Hands
    combatResolve(attacker.hp / 2, D1, P1);
    return true;
  }
}

async function promptWeapon(promptText: string): Promise<number> {
  let what = '';
  while (what === '' || 'BSH'.indexOf(what) === -1) {
    const ans = await input(promptText);
    what = ans[0] || '';
  }
  return 'BSH'.indexOf(what) + 1;
}

async function cmdAttack(rest: string): Promise<boolean> {
  let r = (rest || '').trim();
  // Skip "WITH" if present
  if (r.startsWith('W')) {
    const sp = r.indexOf(' ');
    r = sp === -1 ? '' : r.slice(sp + 1).trim();
  }
  let what = r ? r[0] : '';
  let C;
  if ('BSH'.indexOf(what) !== -1) {
    C = 'BSH'.indexOf(what) + 1;
  } else {
    C = await promptWeapon('WANT TO ATTACK WITH BLASTER, SABRE, OR\n HAND-TO-HAND (B,S, OR H)');
  }
  const result = performAttack(1, C, false);
  if (player.room === 0) die();
  return result === true; // false (no weapon, no target) -> no turn
}

async function cmdOrder(rest: string): Promise<boolean> {
  let r = (rest || '').trim();
  let who = r ? r[0] : '';
  while (who === '' || 'PW'.indexOf(who) === -1) {
    const ans = await input('WHO ARE YOU ORDERING, PRINCESS LEIA\n OR THE WOOKIE (P OR W)');
    who = ans[0] || '';
  }
  const C = (who === 'W') ? 2 : 1;
  const target = chars[C + 1]!;
  if (player.room !== target.room) {
    out("YOU CAN'T GIVE ORDERS TO"); nl();
    out(NAMES[C + 1] + ' RIGHT NOW.'); nl();
    return false;
  }
  let rest2 = r.indexOf(' ') === -1 ? '' : r.slice(r.indexOf(' ') + 1).trim();
  let what = rest2 ? rest2[0] : '';
  // SAVE/RESTORE Easter egg (BASIC 2152-2153)
  while (what === '' || 'SAW'.indexOf(what) === -1) {
    const ans = await input('IS THE ORDER TO SHOOT, ATTACK, OR WAIT\n (S,A, OR W)');
    const up = (ans || '').toUpperCase().trim();
    if (up === 'SAVE')    { out('BSAVE GAME,A28672,L8192,D2'); nl(); continue; }
    if (up === 'RESTORE') { out('BLOAD GAME,D2'); nl(); continue; }
    what = up[0] || '';
  }
  if (what === 'S') {
    if (target.blaster === 0) {
      out(NAMES[C + 1] + ' HAS NO BLASTER'); nl();
      return false;
    }
    const result = performAttack(C + 1, 1, false);
    if (player.room === 0) die();
    return result === true;
  } else if (what === 'A') {
    const result = performAttack(C + 1, 3, false);
    if (player.room === 0) die();
    return result === true;
  } else {
    out('OK.'); nl();
    target.room = -target.room;
    return true;
  }
}

async function cmdCharge(rest: string): Promise<boolean> {
  // Player attacks first (with weapon prompt), then each follower in room.
  // If the multi-column CHARGE menu populated chargePresets before
  // injecting the command, the per-follower S/A/N prompts are skipped
  // and the preset value is used instead. The typed-CHARGE path runs
  // with chargePresets === null and falls through to the original
  // prompt-each-follower flow, mirroring BASIC 2200-2270.
  const presets = chargePresets;
  chargePresets = null;
  let r = (rest || '').trim();
  // Strip "WITH" if present (BASIC line 1846)
  if (r.startsWith('W')) {
    const sp = r.indexOf(' ');
    r = sp === -1 ? '' : r.slice(sp + 1).trim();
  }
  let what = r ? r[0] : '';
  while (what === '' || 'BSH'.indexOf(what) === -1) {
    const ans = await input('WANT TO ATTACK WITH BLASTER, SABRE, OR\n HAND-TO-HAND (B,S, OR H)');
    what = ans[0] || '';
  }
  const C = 'BSH'.indexOf(what) + 1;
  let result: boolean | 'retry' = performAttack(1, C, true);
  while (result === 'retry') {
    const ans = await input('WANT TO ATTACK WITH BLASTER, SABRE, OR\n HAND-TO-HAND (B,S, OR H)');
    const c2 = ans[0] || '';
    if (c2 === '' || 'BSH'.indexOf(c2) === -1) continue;
    result = performAttack(1, 'BSH'.indexOf(c2) + 1, true);
  }
  if (player.room === 0) { die(); return true; }
  // Follower turns (BASIC 2200-2270)
  for (const P of [2, 3]) {
    const c = chars[P]!;
    if (player.room !== Math.abs(c.room) || c.room < 0) continue;
    if (s9 === 0 && player.room !== vader.room) {
      out('NO ENEMIES'); nl();
      continue;
    }
    const presetKey = (P === 2) ? 'princess' : 'wookie';
    let action = (presets && presets[presetKey]) || '';
    while (action === '' || 'SAN'.indexOf(action) === -1) {
      const ans = await input('DO YOU WANT ' + NAMES[P] + '\n TO SHOOT, ATTACK OR DO NOTHING\n (S,A, OR N)');
      action = ans[0] || '';
    }
    if (action === 'S') {
      if (c.blaster === 0) {
        out(NAMES[P] + ' HAS NO BLASTER'); nl();
        continue;
      }
      performAttack(P, 1, false);
    } else if (action === 'A') {
      performAttack(P, 3, false);
    }
    if (player.room === 0) { die(); return true; }
  }
  return true;
}

function cmdHelp(): boolean {
  out('I AM THE FORCE. I WILL DO THESE THINGS--'); nl();
  out('  GET AN OBJECT'); nl();
  out('  DROP AN OBJECT'); nl();
  out('  MOVE NORTH, EAST, WEST, OR SOUTH'); nl();
  out('  SABRE ON OR OFF'); nl();
  out('  ATTACK WITH SABRE, BLASTER, OR HANDS'); nl();
  out('  ORDER PRINCESS OR WOOKIE'); nl();
  out('  GIVE TO PRINCESS OR WOOKIE'); nl();
  out('  LOOK AROUND'); nl();
  out('  FLEE (EVERYBODY RUNS AWAY)'); nl();
  out('  TOSS ROPE TO CROSS THE CHASM'); nl();
  out('  SWING ON THE ROPE ACROSS THE CHASM'); nl();
  out('  TAKE-OFF IN THE MILLENIUM FALCON'); nl();
  out('  SABOTAGE THE EQUIPMENT IN THE ROOM'); nl();
  out('  CHARGE! ALL GOOD GUYS ATTACK'); nl();
  return false; // help is free
}

// BASIC dispatch order (CM$(1..14)). Order matters for prefix matching.
const COMMANDS: CommandEntry[] = [
  { p: 'GE',   f: cmdGet     },
  { p: 'D',    f: cmdDrop    },
  { p: 'M',    f: cmdMove    },
  { p: 'SABR', f: cmdSabre   },
  { p: 'A',    f: cmdAttack  },
  { p: 'O',    f: cmdOrder   },
  { p: 'GI',   f: cmdGive    },
  { p: 'L',    f: cmdLook    },
  { p: 'F',    f: cmdFlee    },
  { p: 'TO',   f: cmdToss    },
  { p: 'SW',   f: cmdSwing   },
  { p: 'TA',   f: cmdTakeOff },
  { p: 'SAB',  f: cmdSabotage},
  { p: 'C',    f: cmdCharge  },
];

// Returns true if turn was consumed
async function dispatch(cmd: string): Promise<boolean> {
  cmd = cmd.toUpperCase().trim();
  if (cmd === '') { cmdHelp(); return false; }
  for (let i = 0; i < COMMANDS.length; i++) {
    const c = COMMANDS[i];
    if (cmd.startsWith(c.p)) {
      // Strip the verb, keep the rest (mirroring BASIC GOSUB 3000 -> MID$)
      const sp = cmd.indexOf(' ');
      const rest = sp === -1 ? '' : cmd.slice(sp + 1).trim();
      flags.lastCmd = i + 1;
      const r = await c.f(rest);
      return !!r;
    }
  }
  cmdHelp();
  return false;
}

// -------- Title and intro --------

async function titleScreen(): Promise<void> {
  clearStatus();
  clearMessages();
  nl();
  out('              WELCOME TO'); nl(); nl();
  out('               ');
  out('STAR WARS', 'inverse');
  nl(); nl(); nl();
  const marquee = document.createElement('span');
  messages.appendChild(marquee);
  nl(); nl(); nl();
  out('  (C) COPYRIGHT 1979 BY DONALD BROWN'); nl();
  out('    (Apple ][ BASIC, ported to JS)'); nl();
  nl();
  out('       press any key to begin');
  const banner = ' <==A SCIENCE FICTION ROLE-PLAYING GAME BY DONALD BROWN==> ';
  let pos = 0;
  const tick = () => {
    let s = banner.substr(pos, 40);
    while (s.length < 40) s += ' ';
    marquee.textContent = s;
    pos = (pos + 1) % banner.length;
  };
  tick();
  const iv = setInterval(tick, 130);
  await new Promise<void>(resolve => {
    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      messages.removeEventListener('click', onClick);
      clearInterval(iv);
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      if (['Shift','Control','Alt','Meta','CapsLock','Tab'].includes(e.key)) return;
      e.preventDefault();
      cleanup();
    };
    const onClick = () => cleanup();
    document.addEventListener('keydown', onKey);
    messages.addEventListener('click', onClick);
  });
}

async function briefing(): Promise<void> {
  clearMessages();
  nl();
  out('REBEL '); out(player.name!); out('--');
  nl(); nl();
  out('YOU ARE ABOARD THE MILLENIUM FALCON'); nl();
  out('WHICH HAS JUST BEEN DRAGGED ABOARD THE'); nl();
  out('INFAMOUS ');
  out('DEATH STAR', 'flash');
  nl(); nl();
  out('THIS OF COURSE MEANS YOU ARE IN TROUBLE.'); nl();
  out('BUT YOU ARE ALSO IN A POSITION TO DO'); nl();
  out('GOOD THINGS FOR THE REBELLION, SUCH AS'); nl();
  out('DAMAGING THE DEATH STAR, ELIMINATING'); nl();
  out('IMPERIAL SOLDIERS, KILLING DARTH VADER,'); nl();
  out('OR RESCUING PRINCESS LEIA'); nl();
  nl();
  out('YOU MIGHT EVEN BE ABLE TO SABOTAGE THE'); nl();
  out('POWER MACHINERY ROOM IN SUCH A WAY AS'); nl();
  out('TO MAKE THE DEATH STAR SELF-DESTRUCT!'); nl();
  nl();
  await anyKey('(HIT ANY KEY FOR FURTHER ORDERS)');
  clearMessages();
  nl();
  out('YOU ARE EQUIPPED WITH A LIGHT SABRE AND'); nl();
  out('A BLASTER SHIELD. YOU MAY USE ANY'); nl();
  out('BLASTERS YOU STRIP FROM DEAD SOLDIERS'); nl();
  out('OR YOU MAY GIVE THEM TO PRISONERS YOU'); nl();
  out('RELEASE.'); nl();
  nl();
  out('TO ESCAPE, YOU MUST RENDER THE TRACTOR'); nl();
  out('BEAM INOPERABLE BY EITHER SABOTAGING'); nl();
  out('THE POWER MACHINERY ROOM OR THE TRACTOR'); nl();
  out('BEAM ROOM. YOU MUST THEN RETURN TO THE'); nl();
  out('HANGER DECK AND TAKE OFF IN THE'); nl();
  out('MILLENIUM FALCON.'); nl();
  nl();
  out('AS WITH ANY JEDI HOPEFUL, YOU WILL ACT'); nl();
  out('THROUGH THE FORCE. YOU WILL DO SO BY'); nl();
  out("GIVING COMMANDS FOR YOUR ACTIONS."); nl();
  out("SIMPLY HITTING 'RETURN' LISTS ALL OF"); nl();
  out('THE LEGAL COMMANDS.'); nl();
  nl();
  out('YOU HAVE A LIMITED AMOUNT OF TIME.'); nl();
  out('MAY THE FORCE BE WITH YOU!'); nl();
  nl();
  await anyKey('(HIT ANY KEY TO BEGIN YOUR MISSION)');
}

// -------- Wiring: palette, d-pad, keyboard --------

function wireUi(): void {
  // Some browsers (notably Firefox) preserve form-element state — including
  // the `disabled` property on buttons — across location.reload(). After a
  // RESTART, that means whatever d-pad arrows were enabled at game-over
  // time stay enabled through the title/name screens. The HTML attribute
  // says `disabled` but the live property has been restored. Force a reset
  // here so the script-side state matches the HTML defaults.
  document.querySelectorAll('.dpad button').forEach(b => { (b as HTMLButtonElement).disabled = true; });

  palette.querySelectorAll('button[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      injectCommand((btn as HTMLElement).dataset.cmd!);
      document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    });
  });

  // Auto-Attack one-click: fire ATTACK with the weapon pickBestWeapon
  // returns at click time. The label was already kept fresh by
  // updatePalette, but we re-resolve here to be safe if the player
  // state changes between renders.
  const autoAttackBtn = document.getElementById('auto-attack-btn');
  if (autoAttackBtn) {
    autoAttackBtn.addEventListener('click', () => {
      injectCommand('ATTACK ' + pickBestWeapon());
    });
  }

  // CHARGE multi-column menu wiring. The menu shows up to three columns
  // (princess, you, wookie); the player picks one option from each visible
  // column, and the moment the last visible column gets a selection, the
  // CHARGE command fires with the chosen weapon and the per-follower
  // actions stashed in chargePresets. Clicking a column button does NOT
  // close the menu (we stop propagation so the document-level handler
  // doesn't fire), and selections always reset on menu open so reopening
  // starts clean.
  let chargeDraft: Record<string, string | null> = { princess: null, player: null, wookie: null };
  function resetChargeDraft(): void {
    chargeDraft = { princess: null, player: null, wookie: null };
    document.querySelectorAll('#wrap-charge .charge-col button.is-picked')
      .forEach(b => b.classList.remove('is-picked'));
    document.querySelectorAll('#wrap-charge .charge-col')
      .forEach(c => c.classList.remove('dim'));
  }
  function updateChargeFocus(): void {
    let foundActive = false;
    for (const col of document.querySelectorAll('#wrap-charge .charge-col')) {
      const colEl = col as HTMLElement;
      if (colEl.style.display === 'none') continue;
      if (!foundActive && !colEl.querySelector('button.is-picked')) {
        colEl.classList.remove('dim');
        foundActive = true;
      } else {
        colEl.classList.add('dim');
      }
    }
  }
  function fireChargeIfComplete(): void {
    // Required columns: those visible right now.
    const cols = document.querySelectorAll('#wrap-charge .charge-col');
    for (const col of cols) {
      if ((col as HTMLElement).style.display === 'none') continue;
      if (!chargeDraft[(col as HTMLElement).dataset.chargeCol!]) return;
    }
    // All visible columns picked. Stash follower presets, inject command.
    const weaponMap: Record<string, string> = { S: 'SABRE', B: 'BLASTER', H: 'HANDS' };
    chargePresets = {};
    if (chargeDraft.princess) chargePresets.princess = chargeDraft.princess;
    if (chargeDraft.wookie)   chargePresets.wookie   = chargeDraft.wookie;
    const weaponWord = weaponMap[chargeDraft.player!];
    // Close menu and reset visual state before injecting.
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    resetChargeDraft();
    injectCommand('CHARGE ' + weaponWord);
  }
  document.querySelectorAll('#wrap-charge button[data-charge-pick]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const [col, val] = (btn as HTMLElement).dataset.chargePick!.split(':');
      chargeDraft[col] = val;
      // Mark this button picked, unmark siblings in same column.
      const colEl = btn.closest('.charge-col')!;
      colEl.querySelectorAll('button').forEach(b => b.classList.toggle('is-picked', b === btn));
      updateChargeFocus();
      fireChargeIfComplete();
    });
  });
  // Reset draft whenever the CHARGE trigger is clicked (open or close).
  const chargeTrigger = document.querySelector('#wrap-charge .menu-trigger');
  if (chargeTrigger) {
    chargeTrigger.addEventListener('click', () => { resetChargeDraft(); updateChargeFocus(); });
  }

  function toggleMenu(menu: Element, evt: Event): void {
    evt.stopPropagation();
    const wasOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
    if (!wasOpen) menu.classList.add('open');
  }
  // Wire every menu-wrap: the first button inside is the trigger, the .menu
  // div next to it pops up. This avoids hardcoding IDs for each menu.
  document.querySelectorAll('.menu-wrap').forEach(wrap => {
    const trigger = wrap.querySelector('button');
    const menu = wrap.querySelector('.menu');
    if (trigger && menu) {
      trigger.addEventListener('click', e => toggleMenu(menu, e));
    }
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  });

  const DIR_NAMES: Record<string, string> = { N: 'NORTH', E: 'EAST', W: 'WEST', S: 'SOUTH' };
  dpad.querySelectorAll('button[data-dir]').forEach(btn => {
    btn.addEventListener('click', () => {
      if ((btn as HTMLButtonElement).disabled) return;
      if (!acceptingMoveInput) return;
      injectCommand('MOVE ' + DIR_NAMES[(btn as HTMLElement).dataset.dir!]);
    });
  });

  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT') return;
    const map: Record<string, string> = { ArrowUp: 'N', ArrowRight: 'E', ArrowLeft: 'W', ArrowDown: 'S' };
    if (map[e.key]) {
      e.preventDefault();
      if (!acceptingMoveInput) return;
      injectCommand('MOVE ' + DIR_NAMES[map[e.key]]);
    }
  });

  // Keyboard shortcuts for palette buttons. Each button with a data-key
  // attribute can be triggered by pressing that key. Open menus take
  // priority so e.g. pressing S with the ATTACK menu open fires
  // ATTACK SABRE rather than toggling the sabre.
  document.addEventListener('keydown', e => {
    if ((document.activeElement?.tagName ?? '') === 'INPUT') return;
    if (messages.querySelector('.term-cursor')) return;
    if (e.key === 'Escape') {
      document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
      return;
    }
    if (e.key === 'Enter') {
      const armed = palette.querySelector('.palette-restart-btn.armed') as HTMLElement | null;
      if (armed) { e.preventDefault(); armed.click(); }
      return;
    }
    const key = e.key.length === 1 ? e.key.toUpperCase() : '';
    if (!key) return;

    // Priority 1: button inside an open menu
    const openMenu = palette.querySelector('.menu.open');
    if (openMenu) {
      // Charge menu: keys apply to the first un-selected visible column
      // (left-to-right), matching the multi-step click flow.
      if (openMenu.classList.contains('charge-menu')) {
        for (const col of openMenu.querySelectorAll('.charge-col')) {
          const colEl = col as HTMLElement;
          if (colEl.style.display === 'none') continue;
          if (colEl.querySelector('button.is-picked')) continue;
          const btn = colEl.querySelector(
            'button[data-key="' + key + '"]'
          ) as HTMLElement | null;
          if (btn && btn.style.display !== 'none') {
            e.preventDefault();
            btn.click();
          }
          return; // Only act on the first un-selected column
        }
        return;
      }
      // Other menus (ATTACK, GET, DROP, ORDER, GIVE): direct key match
      const btn = openMenu.querySelector(
        'button[data-key="' + key + '"]'
      ) as HTMLElement | null;
      if (btn && btn.style.display !== 'none') {
        e.preventDefault();
        btn.click();
        return;
      }
    }

    // Priority 2: top-level palette buttons (not inside a .menu)
    for (const el of palette.querySelectorAll('button[data-key="' + key + '"]')) {
      const btn = el as HTMLElement;
      if (btn.style.display === 'none') continue;
      if (btn.closest('.menu')) continue;
      const wrap = btn.closest('.menu-wrap') as HTMLElement | null;
      if (wrap && wrap.style.display === 'none') continue;
      e.preventDefault();
      btn.click();
      return;
    }
  });

  const restartBtn = document.getElementById('restart-btn')!;
  const godBtn = document.getElementById('god-btn');
  if (godBtn) godBtn.addEventListener('click', godMode);
  const chargeTestBtn = document.getElementById('charge-test-btn');
  if (chargeTestBtn) chargeTestBtn.addEventListener('click', chargeTestSetup);
  const rescueTestBtn = document.getElementById('rescue-test-btn');
  if (rescueTestBtn) rescueTestBtn.addEventListener('click', rescueTestSetup);
  const wookieTestBtn = document.getElementById('wookie-test-btn');
  if (wookieTestBtn) wookieTestBtn.addEventListener('click', wookieTestSetup);

  // MORE STATS button: only visible on game-over (CSS handles visibility).
  // Click once to dump the score breakdown into the messages area, then
  // disable so the player doesn't print it twice.
  const moreStatsBtn = document.getElementById('more-stats-btn') as HTMLButtonElement | null;
  if (moreStatsBtn) {
    moreStatsBtn.addEventListener('click', async () => {
      moreStatsBtn.disabled = true;
      showScoreBreakdown();
      await drainLines();
    });
  }

  // Pi-toggle: subtle dark glyph in the bottom-right corner. Clicking it
  // toggles the entire "CONSOLE MESSAGES" header — both the label and
  // the dev buttons (GOD / CHARGE TEST) it contains. Hidden by default
  // so casual players don't see them.
  const piToggle = document.querySelector('.pi-toggle');
  const devHeader = document.querySelector('.messages-header');
  if (piToggle && devHeader) {
    piToggle.addEventListener('click', () => {
      devHeader.classList.toggle('is-hidden');
    });
  }
  function wireRestart(btn: HTMLElement): void {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const hasKeyHint = !!btn.querySelector('.key-hint');
    const labelArmed = hasKeyHint
      ? 'CONFIRM <span class="key-hint">R</span>ESTART?'
      : 'CONFIRM RESTART?';
    const labelIdle = hasKeyHint
      ? '<span class="key-hint">R</span>ESTART'
      : 'RESTART';
    function arm(): void {
      armed = true;
      btn.innerHTML = labelArmed;
      btn.classList.add('armed');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        armed = false;
        btn.innerHTML = labelIdle;
        btn.classList.remove('armed');
        timer = null;
      }, 3500);
    }
    function confirm(): void {
      location.reload();
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!armed) arm();
      else confirm();
    });
  }
  wireRestart(restartBtn);
  const paletteRestartBtn = document.getElementById('palette-restart-btn');
  if (paletteRestartBtn) wireRestart(paletteRestartBtn);
}

// -------- Main --------

async function gameLoop(): Promise<void> {
  lineDelay = (window as any).__lineDelay ?? 50;
  soundLineDelay = (window as any).__soundLineDelay ?? 350;
  soundWaitPct = (window as any).__soundWaitPct ?? 200;
  palette.classList.remove('pre-game');
  // BASIC line 560: GOSUB 1750 before the T8 loop -> initial enterRoom
  enterRoom();
  while (!gameOver && t8 > 0) {
    // Vader moves first (BASIC 570-600). After his move, we redraw status
    // so the player sees if he just arrived.
    vaderMove();
    // Time warning chance (BASIC 620)
    timeWarn();

    // Command loop: keep prompting until one of them consumes the turn,
    // or the game ends. GET/DROP/help are free actions (return false).
    let consumed = false;
    while (!consumed && !gameOver) {
      await renderStatus();
      renderMap();
      updateDpad();
      updatePalette();
      acceptingMoveInput = true;
      const cmd = await input('\nWHAT IS YOUR COMMAND');
      acceptingMoveInput = false;
      consumed = await dispatch(cmd);
      if (consumed) {
        // FLASH text in BASIC kept flashing on the Apple ][ until it
        // scrolled off the 24-row screen (typically within 2-3 turns).
        // Our scrollable log keeps everything in the DOM so the
        // flashing would persist forever. Bound it to "this just
        // happened": once the player acts on a turn, freeze the flash
        // in its bright (inverse) state so it stays visually marked as
        // a notable past event without the distracting animation.
        messages.querySelectorAll('.fls').forEach(el => {
          el.classList.remove('fls');
          el.classList.add('inv');
        });
      }
    }
    if (gameOver) break;

    // Vader attack if collocated (BASIC 640-670)
    vaderAttack();
    if (gameOver) break;

    // Soldiers shoot (BASIC 680-740)
    soldiersShoot();
    if (gameOver) break;

    // Follower escape (BASIC 750)
    followerEscape();

    // Self-repair (BASIC 770)
    selfRepair();

    t8--;
  }
  if (!gameOver && t8 <= 0) timeExpired();

  // Game-over UI: hide action buttons (palette + d-pad), only restart remains.
  document.body.classList.add('game-over');

  // Endgame scoring + restart
  if (player.room !== 0) {
    renderStatus();
    renderMap();
  }
  nl();
  showScore();
  await drainLines();
}

async function main(): Promise<void> {
  initGame();
  wireUi();
  await titleScreen();
  clearMessages();
  nl(); nl(); nl();
  const name = await input('WHAT IS YOUR NAME', true);
  player.name = name || 'CADET';
  await briefing();
  clearMessages();
  await gameLoop();
}

// Debug: stage a princess-rescue scenario. Princess goes "lost" at
// room 2 (east of Hangar), all soldiers in rooms 1 and 2 are cleared,
// Vader and the wookie are moved out of the way, and the tractor beam
// is pre-sabotaged so a subsequent TAKE-OFF will succeed. The test
// (or human) just has to MOVE EAST and the auto-join fires.
function rescueTestSetup(): void {
  if (!player || !rooms || !princess || !wookie) return;
  player.room = 1;
  princess.room = -2;
  wookie.room = -42;
  wookie.friendly = 0;
  vader.room = 22;
  rooms[1]!.soldiers = 0;
  rooms[2]!.soldiers = 0;
  rooms[9]!.damage = 2;   // tractor beam disabled → TAKE-OFF will work
  s9 = 0;
  curSoldiers = [];
  renderStatus();
  updatePalette();
}

// Debug: stage a wookie-encounter scenario. Wookie goes "lost" at
// room 2 (unfriendly), princess far away, no soldiers in the path,
// Vader far away. MOVE EAST triggers the 25% kill roll. The actual
// outcome depends on Math.random at the moment of the encounter;
// tests cycle through seeds until they see both outcomes.
function wookieTestSetup(): void {
  if (!player || !rooms || !princess || !wookie) return;
  player.room = 1;
  wookie.room = -2;
  wookie.friendly = 0;
  princess.room = -42;
  vader.room = 22;
  rooms[1]!.soldiers = 0;
  rooms[2]!.soldiers = 0;
  s9 = 0;
  curSoldiers = [];
  renderStatus();
  updatePalette();
}

// Debug: jack up player HP. Internal-only — wired to the GOD button
// when the dev header is revealed via the pi-toggle. Not exposed on
// window so casual console snooping won't find it.
function godMode(): void {
  if (!player) return;
  player.hp = 9999999999999;
}

// Debug: stage a CHARGE-test scenario in the player's current room.
// Princess and friendly wookie become followers (each equipped with a
// shield + blaster); 6 soldiers spawn here; player gets stocked up on
// shields, blasters, and a sabre. Wired to the CHARGE TEST button.
// Same internal-only treatment as godMode.
function chargeTestSetup(): void {
  if (!player || !rooms || !princess || !wookie) return;
  princess.room = player.room;
  wookie.room = player.room;
  wookie.friendly = 1;
  princess.shield = 1; princess.blaster = 1;
  wookie.shield   = 1; wookie.blaster   = 1;
  player.shield  = 9;
  player.blaster = 9;
  player.sabre   = 1;
  flags.sabreOn  = true;
  rooms[player.room]!.soldiers = 6;
  s9 = 6;
  curSoldiers = [];
  for (let s = 0; s < 6; s++) {
    curSoldiers.push({ def: irand(16), atk: irand(16) });
  }
  renderStatus();
  updatePalette();
}

// --- Viewport scaling ---
// The #game wrapper has a fixed natural size (layout is 860px wide, palette
// reserves space via visibility:hidden). We measure it once on first call
// and cache those dimensions so content changes never shift the scale.
let designW = 0;
let designH = 0;
function fitToViewport(): void {
  const el = document.getElementById('game');
  if (!el) return;
  if (designW === 0) {
    el.style.transform = 'none';
    const rect = el.getBoundingClientRect();
    designW = rect.width;
    designH = rect.height;
    // Lock the wrapper and palette layout sizes so content changes
    // (palette buttons hiding/showing, game-over state) never shift
    // the flex centering or push the footer around.
    el.style.width = designW + 'px';
    el.style.height = designH + 'px';
    const pal = document.getElementById('palette');
    if (pal) {
      pal.style.height = pal.getBoundingClientRect().height + 'px';
    }
  }
  const scale = Math.min(window.innerWidth / designW, window.innerHeight / designH);
  el.style.transform = `scale(${scale})`;
}
window.addEventListener('resize', fitToViewport);
fitToViewport();

main().catch(e => {
  console.error(e);
  out('ERROR: ' + e.message); nl();
});
