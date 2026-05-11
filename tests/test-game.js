// Headless test harness for the Star Wars 1979 port (v2).
// The input element is created dynamically per-prompt; we watch for it.

const { createGame } = require('./harness');

async function run() {
  // Deterministic RNG so the sequence of soldier shots, Vader moves, etc.
  // doesn't randomly kill the player partway through and trash the test.
  // Chosen by trying values until the player survives the command sequence.
  const g = createGame(42);
  const { document, errors, wait, getMessages, getStatus, sendCommand } = g;

  try { await g.boot(); } catch (e) { console.log('NAME FAIL:', e.message); return finalize(); }

  console.log('=== INITIAL STATUS ===');
  console.log(getStatus());
  console.log('=== INITIAL MESSAGES (tail 600) ===');
  console.log(getMessages().slice(-600));

  const commands = [
    'L', 'SABRE', 'SABRE', 'A H', 'GET A', 'M N', 'M E', 'M W', 'M S',
    '?', 'TOSS', 'SWING', 'SAB', 'TA', 'GIVE P S', 'O W S', 'F', 'L', 'C H'
  ];

  for (const c of commands) {
    if (document.body.classList.contains('game-over')) {
      console.log('Game ended; stopping command loop. (last cmd: previous)');
      break;
    }
    try {
      await sendCommand(c);
      await wait(80);
    } catch (e) {
      console.log('FAIL on cmd "' + c + '": ' + e.message);
      break;
    }
    if (errors.length > 0) {
      console.log('Stopped due to error after cmd "' + c + '"');
      break;
    }
  }

  finalize();

  function finalize() {
    console.log('\n=== FINAL STATUS ===');
    console.log(getStatus());
    console.log('\n=== FINAL MESSAGES (tail 1500) ===');
    console.log(getMessages().slice(-1500));
    console.log('\n=== ERRORS ===');
    if (errors.length === 0) console.log('(none)');
    else for (const e of errors) console.log(e);
    process.exit(errors.length > 0 ? 1 : 0);
  }
}

run().catch(e => {
  console.error('Test harness error:', e);
  process.exit(2);
});
