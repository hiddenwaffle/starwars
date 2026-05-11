const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watching = process.argv.includes('--watch');

function inlineIntoHTML(js) {
  const template = fs.readFileSync(path.join(__dirname, 'src', 'index.html'), 'utf8');
  const output = template.replace('<!-- GAME_SCRIPT -->', '<script>\n' + js + '</script>');
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'star-wars-1979.html'), output);
}

if (watching) {
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
          inlineIntoHTML(result.outputFiles[0].text);
          console.log('Rebuilt dist/star-wars-1979.html');
        });
      }
    }]
  });
  ctx.then(c => {
    c.watch();
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
  inlineIntoHTML(result.outputFiles[0].text);
  console.log('Built dist/star-wars-1979.html');
}
