# Star Wars 1979 JS Port — Handoff to Claude Code

This document is a one-shot context dump for a new Claude session that's
taking over a project previously developed across many claude.ai sessions.
The new session has **no memory** of prior conversations, so anything not
captured here is lost. Read this carefully before making changes.

---

## 1. What this project is

A single-file JavaScript / HTML port of Donald Brown's 1979 Applesoft BASIC
text adventure **Star Wars** for the Apple ][. The original was a 313-line
BASIC program; the port is a polished single-page web app with:

- Faithful turn-based command loop
- Map display (SVG, fog-of-war by visited/peeked rooms)
- Status panel, palette of clickable commands, d-pad arrows
- Sound effects (Web Audio, square-wave tones matching BASIC SND values)
- Two-click confirm RESTART pattern
- Endgame score breakdown
- Hidden dev panel (pi-toggle in bottom-right corner) with debug helpers

The port is **BASIC-faithful** — comments throughout cite BASIC line numbers,
and mechanics that look like bugs in the BASIC are preserved on purpose
(e.g., sabre damage A1 = player.hp; the soldier-defense pulls from S(S9,1)
even after a kill).

**Original game provenance:**
- [Facebook post with screenshots](https://www.facebook.com/groups/5251478676/posts/10156900565763677/) — how the game was identified.
- [Archive.org disk image](https://archive.org/details/a2_cple_Apple_oids_Outpost_Star_Blaster_Star_Wars_Taxman) — the disk containing the BASIC source.
- [Apple II emulator](https://www.scullinsteel.com/apple2/#dos33master) — Scullinsteel's browser-based Apple II used to play the original for reference.

---

## 2. Files in the project

| Path | Purpose |
|------|---------|
| `src/game.ts` | Game logic — TypeScript, \~2,180 lines. |
| `src/index.html` | HTML/CSS shell with `<!-- GAME_SCRIPT -->` placeholder. |
| `build.js` | Build script: compiles TS via esbuild, inlines into HTML. |
| `dist/star-wars-1979.html` | Built output — self-contained playable game (gitignored). |
| `star-wars-1979.bas` | The original Applesoft BASIC source. 313 lines. Reference only — never modified. |
| `tests/test-*.js` | Headless test suite using jsdom. |
| `tests/run-all.js` | Test runner — executes all active tests sequentially. |
| `HANDOFF.md` | This document. |

Commands: `npm run build` compiles and produces `dist/star-wars-1979.html`.
`npm run typecheck` runs `tsc --noEmit`. `npm test` builds then runs all
tests. Most tests run in 1–3 seconds; the fuzzers (`test-aggressive`,
`test-rescue-and-kill`) can take 30–120 seconds.

---

## 3. Architecture

The HTML file is one big self-contained app. The script section is wrapped
in an IIFE. There's a top-of-script overview comment that explains the
flow; the short version:

- `main()` runs once on load: `initGame()` → `wireUi()` → `titleScreen()`
  → name prompt → `briefing()` → `gameLoop()`.
- `gameLoop()` runs `t8` turns (76–125 random) of: Vader move → time-warn
  check → command input → soldiers shoot → follower escape → self-repair.
- `dispatch(cmd)` parses the command, calls the matching `cmdX()` handler,
  returns true if a turn was consumed.
- Each `cmdX()` handler is async because it may have sub-prompts ("WHICH
  WEAPON?"). It returns true if the turn was consumed.
- `input(promptText)` returns a promise that resolves when the player
  submits text to the inline DOM input.

Character indexing follows BASIC's `C(P, X)` array, 1-indexed:

| Index | Char |
|-------|------|
| 1 | player |
| 2 | princess |
| 3 | wookie |
| 4 | Vader |
| 5 | soldier slot |

`room` is positive while the character is on the floor; negative when
"lost" (princess in detention cell, wookie at start, follower separated by
ORDER WAIT). Vader at room 0 means he's dead.

---

## 4. Confirmed mechanics from the BASIC source

These were established by reading the BASIC carefully. The user has tested
many of them and they reliably hold:

**Stats randomization (initGame).** Player hp and atk each randomized in
`[11..20]` independently at game start. Wookie hp doubled. Princess hp/atk
also randomized.

**Weapons.**
- Sabre damage roll uses A1 = `player.hp`, so the sabre **degrades as the
  player takes damage**. (Sabre A1 = attacker hp, intentional in BASIC.)
- Blaster A1 = `player.atk` (constant for the player's lifetime).
- Hand-to-hand A1 = `player.hp / 2`.
- Sabre count never increases — no drops, no GET option. A damage roll of
  3 destroys the sabre permanently.
- Vader has a shield bonus 5/4 against blaster but **not** against sabre.

**Item drops and pickup.** Soldier kills add a blaster and shield to the
room (BASIC 860). `GET ALL` is strictly ≥ single-item GETs (verified by
tracing R(R,8/9) writes). No NPC pickup logic; followers don't auto-grab.

**Movement and rooms.** Movement is per-turn. T8 = 76–125 turns total.
Soldiers don't migrate — they only ever decrement when killed. Only Vader
moves between rooms. The chasm (rooms 29↔30) needs `TOSS` then `SWING`.

**ORDER WAIT vs FLEE.** Both separate followers from the player but
differently:
- `ORDER X WAIT`: deterministic, sets the target's `room = -target.room`.
- `FLEE`: random scatter; everyone runs.

**Follower teleport (BASIC line 750).** Each turn, for each "lost" follower
(c.room < 0), if `c.room === -vader.room`, the follower is moved to a
random detention cell `-(31 + irand(12))`. This is a real BASIC quirk; if
the wookie or princess is "lost" and Vader wanders to that room's negation,
they're teleported away. **This is why a last-known-location marker for a
"lost" follower can go stale during Vader roams.**

**Sabotagable rooms.** `type % 10 === 1` rooms can be sabotaged. The list:
3, 7, 9, 13, 19, 26, 28. The self-destruct trigger is only at room 28 with
damage 2, with a 25% chance per attempt.

**Princess can die.** `combatResolve` sets `target.room = 0` when HP <= 0.
Princess and wookie are valid combat targets; in a CHARGE they can die.

---

## 5. Scoring (BASIC lines 2280-2480)

The `computeScoreBreakdown()` and `showScore()` functions both reflect this:

| Component | Points | Conditions |
|-----------|--------|------------|
| Soldiers killed | +1 each | always |
| Escaped alive | +10 | player.room === 1 (Hangar) at end |
| Died in Death Star | -10 | player.room !== 1 |
| Rescued princess | +25 | princess.room === 1 |
| Abandoned wookie | -25 | wookie was friendly and got left behind (room < 0) |
| Killed Vader | +25 | vader.room === 0 |
| **Self-destruct bonus** | **+100** | flags.selfDestruct — **skips all room-damage scoring** |
| Repairable damage | +3 per | rooms 1-30 with damage === 1 |
| Permanent damage | +5 per | rooms 1-30 with damage === 2 |
| Key rooms damaged | +10 each | rooms 7 (Weaponry), 13 (Command), 28 (Power) |

Final rating: `tiers[min(floor(|score|/25), 6)]` where tiers are
`['TERRIBLE', 'BAD', 'FAIR', 'GOOD', 'VERY GOOD', 'INCREDIBLY GOOD',
'ABSOLUTELY UNBELIEVABLE']`.

The dominant strategy is the self-destruct path: rush room 28, sabotage
twice to get damage 2, then re-attempt for the 25% trigger. +100 guarantees
at least VERY GOOD. This is intentional — don't "fix" it.

The `TAKE-OFF` command requires either room 9 (Tractor Beam) or room 28
(Power) to be at damage > 0. Otherwise: "TRACTOR BEAM LATCHES ON. STRESSES
TEAR THE MILLENIUM FALCON INTO ITSY-BITSY PIECES."

---

## 6. Room data and map

`ROOM_DATA[r] = [N, E, W, S, type]`, 1-indexed. Type is a packed code
decoded by `getRoomName()`. Rooms 1–30 are the main floor; rooms 31–42 are
the twelve detention cells (one-way E/W exits, no other connections).

Detention cell layout (the cells map to single connections):
- White corridor 23–26 (x=0, north-to-south): cells 31 (E→25), 32 (E→24),
  33 (E→23), 34 (W→23), 35 (W→24), 36 (W→25).
- Black corridor 19–22 (x=4): cells 37 (E→20), 38 (E→21), 39 (E→22),
  40 (W→22), 41 (W→21), 42 (W→20).

The map uses a static `FIXED_COORDS` table in `renderMap()`. Three edges
span more than one map cell (1↔2 four cells, 26↔19 four cells, chasm
29↔30 three cells). Don't try to lay out via BFS — the user already had
that and it was replaced with the static table because cycles don't close
on a 4-direction grid.

The Hangar is room 1 at (0, 0). The path 1 → N → 30 → (TOSS, SWING) →
29 → N → 27 → ... reaches the rest of the floor via the chasm. The east
path 1 → E → 2 goes around without needing the rope.

---

## 7. Known quirks and traps

**`'STR'.indexOf('') === 0`.** Many input loops in the BASIC port use
`while ('XYZ'.indexOf(v) === -1)` where v starts as `''`. Without the
explicit `v === '' ||` guard, empty input skips the loop entirely. This
bug class was fixed at all 11 known sites in an earlier session. If you
add a new prompt loop with this pattern, **add the guard**.

**Firefox preserves `disabled` across `location.reload()`.** The browser
restores live DOM properties on form elements (buttons included), so the
HTML `disabled` attribute on the d-pad gets overridden post-reload by
whatever the live state was at unload time. `wireUi()` explicitly resets
all `.dpad button` to `disabled = true` at the start to fix this. If you
add more buttons that should always start disabled across reloads, do the
same.

**Sabre-off + CHARGE retry loop.** Typed `CHARGE SABRE` while the sabre is
off triggers a BASIC retry prompt that buttons can't satisfy (it expects
B / S / H characters; ATTACK menu injects "ATTACK BLASTER"). The fix:
ATTACK SABRE and CHARGE-column SABRE buttons are gated on
`flags.sabreOn && player.sabre > 0`, so the click path can't enter the
retry loop. The typed path stays BASIC-faithful.

**The CHARGE multi-column menu.** Sets a `chargePresets` global before
injecting `CHARGE [WEAPON]`. `cmdCharge` consumes the presets in place of
follower S/A/N prompts. The typed path leaves presets null and runs the
prompt-each-follower flow.

**Audio context unlock.** Browsers gate audio on user gesture. The title
screen / briefing key-presses count; `ensureAudio()` calls
`audioCtx.resume()` if suspended. In jsdom tests, a `FakeAudioContext`
shim is needed (all the tests have one) or the script throws on the first
SND call.

**BASIC DROP typo (line 1115).** The BASIC source has `MID$ ($,A +1)` on
line 1115 — every other instance of this pattern reads `MID$ (A$,A +1)`.
The missing `A` means `DROP SHIELD` or `DROP BLASTER` (typed with a second
word) would crash the Applesoft interpreter with a SYNTAX ERROR. `DROP`
alone works fine because GOSUB 3000 returns A=0 and the `IF A >0` guard
skips the broken MID$. The JS port's `cmdDrop` was written from first
principles and handles the two-word form correctly, so the bug was
accidentally fixed by the rewrite. No action needed; noted here for
anyone comparing the port against the original source.

---

## 8. BASIC source internals

Technical notes on the Applesoft BASIC source (`star-wars-1979.bas`). This is
reference material for understanding the original program's structure when
comparing it to the JS port.

### 8a. Memory layout (lines 5–6) tied to save/load (6000, 7000)

```
5 LOMEM: 28672
6 HIMEM: 36864
```

`LOMEM:` and `HIMEM:` are Applesoft directives that set where BASIC's
variables can live. Normally `LOMEM` sits right above the program text and
`HIMEM` sits at the top of free memory. Setting them explicitly carves out a
fixed 8192-byte region: `$7000` through `$8FFF`. Variables grow up from
`$7000`; the string heap grows down from `$9000`.

That's not arbitrary — line 6000 says `BSAVE GAME,A28672,L8192,D2`.
`28672 = $7000`, `8192 = $2000`. So the entire variable space gets dumped to
disk as a single binary blob, and `BLOAD` (line 7000) slams it back in.
Save/restore for free, no per-variable serialization, but it only works
because the memory boundaries are pinned.

(`BSAVE` and `BLOAD` here are being `PRINT`ed, not executed. The trick is
that DOS 3.3 watches the cursor for command-like strings, so printing them at
the prompt triggers DOS to run them. That's the standard DOS-from-BASIC
idiom.)

### 8b. Embedded 6502 machine code (lines 530–540, 160)

```
530 FOR P = 770 TO 788: READ A: POKE P,A: NEXT
540 DATA 173,48,192,136,208,4,198,1,240,8,202,208,246,166,0,76,2,3,96
```

This pokes 19 bytes of 6502 machine code starting at `$0302` (a small free
zone in page 3 reserved for user routines). Disassembled:

```
$0302  AD 30 C0   LDA $C030       ; toggle speaker
$0305  88         DEY
$0306  D0 04      BNE $030C
$0308  C6 01      DEC $01
$030A  F0 08      BEQ $0314       ; done → RTS
$030C  CA         DEX
$030D  D0 F6      BNE $0305
$030F  A6 00      LDX $00         ; reload pitch
$0311  4C 02 03   JMP $0302
$0314  60         RTS
```

`$C030` is the speaker softswitch — any access to it flips the cone, so a
tight loop of accesses produces a square wave. Zero-page `$00` holds the pitch
(toggle period), `$01` holds the duration counter. That's why line 160 does
`POKE 0,TA: POKE 1,DN: CALL 770`. The variables `CF`, `AB`, `AE`, `DN` are
"frames," "begin pitch," "end pitch," "duration," sweeping the pitch from `AB`
to `AE` `CF` times — that's how the game gets sliding tones for blasters and
explosions.

### 8c. Apple II softswitches and ROM calls

A quick reference for the magic numbers:

- `PEEK(-16384)` is `$C000`, the keyboard data register. High bit set means a
  key is waiting; the low 7 bits are the ASCII value. `155` is ESC.
- `POKE -16368,0` is `$C010`, the keyboard strobe — writing here clears the
  "key ready" flag.
- `PEEK(-16336)` is `$C030`, the speaker toggle (same one the ML routine
  uses). Line 2820 is:

```
2820 CF = PEEK( -16336) - PEEK( -16336) + PEEK( -16336) - PEEK( -16336): RETURN
```

  That's four speaker toggles in a row to make a click. The arithmetic is
  meaningless; it exists only because Applesoft needs the PEEKs to be part of
  an expression. `CF` gets overwritten with garbage, but `CF` is reset before
  any real use.

- `CALL -868` is `CLREOL` (clear from cursor to end of line) in the monitor
  ROM. Used everywhere status text is redrawn so leftover characters don't
  trail.
- `PEEK(37)` reads `$25` (`CV`), the current cursor row. `POKE 34,...` writes
  `$22` (`WNDTOP`), the top of the text-scroll window. Lines like
  `2690 ... POKE 34, PEEK(37)` pin the status display at the top of the screen
  and let only the area below it scroll. That's how the game keeps the room
  header/inventory visible while messages roll past underneath.
- `SPEED= 150` slows the character output rate (255 = full speed). Used for
  dramatic effect — the rope swinging, the Falcon taking off.
- `TEXT`, `HOME`, `VTAB`, `HTAB`, `INVERSE`, `NORMAL`, `FLASH` are all
  standard Applesoft display verbs.

### 8d. Command parser (lines 542, 543, 78, 80)

```
542 FOR I = 1 TO 14: READ CM$(I): NEXT
543 DATA GE,D,M,SABR,A,O,GI,L,F,TO,SW,TA,SAB,C
...
78 ... FOR C9 = 1 TO 14: IF LEFT$(A$, LEN(CM$(C9))) = CM$(C9) THEN 830
80 830 ON C9 GOTO 1020,1110,1680,1420,1830,2130,1490,1580,1550,1160,1230,1430,1330,2200
```

Each entry is the *shortest unique prefix* for a command. The clever bit is
the ordering: `SABR` (sabre on/off) appears at position 4, but `SAB`
(sabotage) is at position 13. The parser scans top-down and takes the first
match, so "SABRE ON" matches `SABR` before the loop ever reaches `SAB`. If
those were reversed, `SAB` would swallow "SABRE" and you could never toggle
the sabre. Same kind of thing keeps `GE` (get), `GI` (give) distinct, and
`TO` (toss) ahead of any future `T`-prefix command.

The dispatch table on line 830 is a 14-way `ON ... GOTO`. Very compact verb
dispatcher for the era.

### 8e. Packed room-description codes (line 940)

The fifth field of each room, `R(R1,5)`, is a three-digit decimal code that
encodes the room's description type:

```
940 R2 = INT(R(R1,5)/100):R3 = INT(R(R1,5)/10) -R2 *10:R4 = R(R1,5) -(100 *R2 +10 *R3): ON R4 GOTO 950,980,990,1000
```

`R4` (ones digit) is the *kind* of room: named-with-color, corridor section,
corridor junction, hangar/special, detention cell. `R3` (tens) and `R2`
(hundreds) are indices into the various description arrays — room types,
colors, compass directions. So a single integer like `321` decomposes into
"third entry of one table, second of another, first kind."

The arrays they index were read in lines 480–520: `R$()` (machinery/control),
`B$()` (rooms: tractor beam, power, weaponry...), `E$()` (command, hangar,
detention...), `C$()` (colors), `O$()` (positions: west end, middle, east
end...), `P$()` (directions).

### 8f. Sound-effect "fall-through" pattern (lines 2740–2810)

```
2740 CF = 4:AB = 1:AE = 10:DN = 5: GOTO 160
2750 CF = 1:AB = 5:AE = 20:DN = 3: GOTO 160
...
```

Each one is a *named sound effect* — caller does `GOSUB 2750` for a blaster,
`GOSUB 2800` for a sabre swing, etc. Each line ends in `GOTO 160` rather than
`GOSUB 160`. Line 160 ends in `RETURN`, which pops the GOSUB stack back to
whoever called the *outer* line (e.g. 2750), not to line 160's nonexistent
caller. So `GOSUB 2750` -> falls through to `GOTO 160` -> `RETURN` lands back
at the original `GOSUB 2750` caller. A "tail call" that avoids stacking two
return addresses.

Line 2780 says `GOSUB 160`, not `GOTO 160`. That's deliberate: after the
first sound returns, control falls through to line 2790, which plays *another*
sound before its own `GOTO 160` finally returns. So `GOSUB 2780` plays two
sounds in sequence (a hit thud and a sweep).

### 8g. FOR-loop escape hack (line 230)

```
230 FOR A = 1 TO 10: IF PEEK( -16384) = 155 THEN POKE -16368,0: VTAB 13: CALL -868: FOR X = 1 TO 1: FOR A = 1 TO 1
240 NEXT : NEXT
```

The title screen scrolls inside two nested `FOR` loops (`X` outer in line 220,
`A` inner here). If ESC is pressed, the `THEN` branch opens two *new* `FOR`
loops named `X` and `A`, each bounded `1 TO 1`. The subsequent `NEXT : NEXT`
on line 240 exits those one-iteration loops, and because Applesoft tracks loop
variables by name, the *original* `X` and `A` loops have been effectively
replaced — they never continue. It's a way to "break out" without `GOTO`.

### 8h. The line 1115 DROP typo

Already documented in section 7 ("Known quirks and traps") — see the
"BASIC DROP typo (line 1115)" entry there. That section covers the bug's
effect and how the JS port handles it.

---

## 9. Tests

All tests are headless via jsdom. The pattern: load the HTML, evaluate the
script, drive the input element, assert on the messages/status text. Most
seed `Math.random` deterministically; the unseeded fuzzers explicitly run
many seeds and check aggregate behavior.

The active suite (in suggested run order):

| Test | What it covers |
|------|----------------|
| `test-game.js` | Smoke: walks a sequence of commands; passes if no JS errors. Seeded RNG; bails cleanly on game-over. |
| `test-buttons.js` | Palette button presence, basic state. |
| `test-aggressive.js` | Fuzzer: 5 seeds × smart-wander loop, no JS errors. |
| `test-targeted.js` | Fuzzer: 10 seeds × scenario sequences. |
| `test-charge.js` | CHARGE typed command path. |
| `test-charge-menu.js` | CHARGE multi-column menu UI. |
| `test-charge-attack.js` | CHARGE attack execution. |
| `test-auto-attack.js` | Auto-Attack button picks best weapon. |
| `test-sabre-off-buttons.js` | Sabre-off + CHARGE retry bug doesn't reproduce via clicks. |
| `test-pi-toggle.js` | Dev header is hidden initially; pi-toggle shows/hides it. |
| `test-princess-rescue.js` | RESCUE TEST setup → MOVE EAST → escape → WITH THE PRINCESS in endgame. |
| `test-wookie-kill.js` | WOOKIE TEST setup → iterate seeds until 25% kill roll lands. |
| `test-rescue-and-kill.js` | **Informational only** — random-walker fuzzer; can't reliably reach detention cells. Pass criterion is "no JS errors", not "paths exercised". |
| `test-more-stats.js` | More Stats button visible on game-over, prints breakdown matching headline FINAL SCORE, palette RESTART exists and arms on first click. |

Two legacy diagnostic files in `tests/` are **not** part of the suite and
can be ignored or deleted:

- `test-restart.js` — outdated, throws but exits 0.
- `test-visibility.js` — diagnostic-only, no real assertions.

A previous `test-cell6.js` was deleted as a manual diagnostic that didn't
assert anything and depended on lucky RNG to navigate a long path.

---

## 10. Dev panel

There's a tiny dim `π` glyph in the bottom-right corner. Clicking it
toggles the visibility of the `CONSOLE MESSAGES` header above the message
log, which contains four debug buttons:

| Button | Function |
|--------|----------|
| `GOD` | `godMode()` — sets player.hp to absurdly high. |
| `CHARGE TEST` | `chargeTestSetup()` — princess + friendly wookie + 6 soldiers in current room, player fully equipped. |
| `RESCUE TEST` | `rescueTestSetup()` — princess "lost" in room 2, room 9 pre-sabotaged so TAKE-OFF succeeds. |
| `WOOKIE TEST` | `wookieTestSetup()` — unfriendly wookie "lost" in room 2 for the 25% kill encounter. |

Initially hidden so casual players don't see them. The user requires the
buttons to be reachable through clicks; they don't use `window.X()` from
the console.

---

## 11. Endgame UI

When `gameOver` becomes true and the game loop exits:

1. `document.body.classList.add('game-over')` — CSS rules switch the
   palette into "endgame mode."
2. `showScore()` prints the BASIC-style narrative, ending with `YOU WERE
   [tier]`. **No trailing instruction line.**
3. CSS hides `.dpad`, hides `.footer-actions` (which contains the old
   bottom RESTART), and hides all `.palette > *` except two buttons:
   - `MORE STATS` (dumps `=== SCORE BREAKDOWN ===` into the messages
     when clicked, then disables itself).
   - `RESTART` (two-click confirm → `location.reload()`; same logic as
     the original footer RESTART, factored into a `wireRestart(btn)`
     helper).

Both buttons live in the palette, hidden during pre-game and gameplay,
shown only on `body.game-over`. The CSS uses
`body.game-over .palette > *:not(.more-stats-btn):not(.palette-restart-btn)`
to hide everything else.

---

## 12. Recent session timeline (what was done lately)

This list helps you understand what's fresh and what's been stable for a
while.

**This session (last):**
- Refactored `showScore` around a `computeScoreBreakdown()` helper that
  returns a structured object; `lastBreakdown` is stashed for replay.
- Added `MORE STATS` button to the palette; CSS reveals it on game-over.
- Added `showScoreBreakdown()` that prints a formatted breakdown table.
- Hid the footer RESTART on game-over; added an identical palette RESTART
  next to MORE STATS. Both share a `wireRestart(btn)` helper.
- Removed the added `(PRESS RESTART OR REFRESH TO PLAY AGAIN)` line and
  the blank line before it. `YOU WERE [tier]` is now the final printed line.
- Added `test-more-stats.js`.
- Seeded `Math.random` in `test-game.js` (deterministic, no more flaky
  "FAIL on cmd …" diagnostic; bails on game-over class).
- Deleted `test-cell6.js`.
- Made `test-rescue-and-kill.js` informational-only.

**Recent prior:**
- Added `RESCUE TEST` and `WOOKIE TEST` dev buttons.
- Added the `π` pi-toggle for hiding the dev header.
- Fixed the sabre-off-while-CHARGE retry-loop bug.
- Force-reset `.dpad button[disabled]` in `wireUi()` for Firefox.
- Added the CHARGE multi-column menu.
- Added the Auto-Attack button.
- Fixed the 11 sites of the `'STR'.indexOf('') === 0` bug class.

---

## 13. Backlog (in preferred priority)

When the user comes back wanting more, these are still on the pile:

1. **Turn counter / fuel-bar tied to T8.** The self-destruct timer is
   currently invisible — when it fires, you have to count manually. The
   user named this as the highest-impact pending feature.
2. **Soldier counts on visited rooms in the map.** `room.soldiers` is
   already tracked; just render the number (or dot density) on visited
   squares. Stable because soldiers don't migrate.
3. **Last-known-location markers for princess and wookie on the map.**
   With the caveat about Vader-teleporting "lost" followers (BASIC 750),
   the wookie marker can go stale during Vader roams. Princess is more
   stable because she only goes "lost" via ORDER WAIT or detention cell.
4. **Tooltips on less-obvious commands** (TOSS, SWING, ORDER, CHARGE,
   SABOTAGE, TAKE-OFF). Same pattern as the existing map-room tooltips.
5. **Mobile layout pass.** The palette wraps reasonably, but no proper
   narrow-viewport testing.

Don't surface these unprompted; they're for when asked "what's next?"

---

## 14. Pointers within the code

For when you need to find something:

- **Section dividers**: `grep -n "^  // --------" star-wars-1979.html`
- **Combat resolution**: `combatResolve(A1, D1, P1)` around line ~1430.
- **Per-turn machinery**: `// Per-turn machinery (BASIC 570-770)` section.
- **Scoring**: `computeScoreBreakdown()` and `showScore()`,
  `showScoreBreakdown()`.
- **Command dispatch**: `dispatch(cmd)` near the bottom of cmd handlers.
- **Map rendering**: `renderMap()` — uses static `FIXED_COORDS`.
- **CHARGE menu wiring**: search `chargeDraft` inside `wireUi`.
- **Dev helpers**: bottom of script (`rescueTestSetup`, `wookieTestSetup`,
  `godMode`, `chargeTestSetup`).

Top-of-script overview comment lives right after the IIFE opens — it
expands on much of section 3 above and is the place to skim first.

---

## 15. The BASIC source

`star-wars-1979.bas` is the original. Don't modify it. To reference a
specific BASIC line, just `view` the file at that line range; the port's
comments cite line numbers throughout.

A few notable lines for orientation:
- **160** — main turn-loop label (where most GOTOs land).
- **510** — character names (N$).
- **560-770** — per-turn machinery (Vader move, time warn, soldiers
  shoot, follower escape, self-repair).
- **840** — combat resolution.
- **1750-1820** — enter-room logic.
- **1860+** — performAttack analogue.
- **2200-2270** — CHARGE per-follower prompts.
- **2280-2500** — endgame scoring.
- **2500** — `TEXT : VTAB 23: END` — the BASIC's last line. No "play
  again" message.
- **2740-2820** — SND tone definitions (referenced by line in the SND
  lookup object in the port).
