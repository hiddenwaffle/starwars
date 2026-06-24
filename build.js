const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watching = process.argv.includes('--watch');

// `docs` is true only for one-shot production builds. Watch mode keeps
// docs/index.html stable so in-progress work doesn't get accidentally
// committed and deployed via GitHub Pages.
function inlineIntoHTML(js, { docs }) {
  const template = fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf8');
  const output = template.replace('<!-- GAME_SCRIPT -->', '<script>\n' + js + '</script>');
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'star-wars-1979.html'), output);
  if (docs) {
    fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'docs', 'index.html'), output);
  }
}

if (watching) {
  let lastJs = '';
  const ctx = esbuild.context({
    entryPoints: [path.join(__dirname, 'src', 'game.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2020',
    plugins: [{
      name: 'inline-html',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length > 0) return;
          lastJs = result.outputFiles[0].text;
          inlineIntoHTML(lastJs, { docs: false });
          console.log('Rebuilt dist/star-wars-1979.html (game.ts change)');
        });
      }
    }]
  });
  ctx.then(c => {
    c.watch();
    // esbuild only watches files in the JS bundle. The HTML template
    // is read fresh by inlineIntoHTML but isn't part of the bundle.
    // fs.watch is unreliable on macOS with editors that do atomic
    // saves (write-to-temp + rename leaves fs.watch bound to a stale
    // inode). fs.watchFile polls every 200ms and survives that.
    // Some editors briefly remove the file mid-save; on ENOENT we
    // retry once after a short pause.
    const rebuildHtml = () => {
      if (!lastJs) return;
      const attempt = (retried) => {
        try {
          inlineIntoHTML(lastJs, { docs: false });
          console.log('Rebuilt dist/star-wars-1979.html (index.html change)');
        } catch (e) {
          if (e.code === 'ENOENT' && !retried) {
            setTimeout(() => attempt(true), 80);
          } else {
            console.log('HTML rebuild failed:', e.message);
          }
        }
      };
      attempt(false);
    };
    fs.watchFile(
      path.join(__dirname, 'src', 'index.html'),
      { interval: 200 },
      (curr, prev) => {
        if (curr.mtimeMs === prev.mtimeMs) return;
        rebuildHtml();
      }
    );
    console.log('Watching for changes...');
  });
} else {
  const result = esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'src', 'game.ts')],
    bundle: true,
    format: 'iife',
    write: false,
    target: 'es2020',
  });
  inlineIntoHTML(result.outputFiles[0].text, { docs: true });
  console.log('Built dist/star-wars-1979.html + docs/index.html');
}
