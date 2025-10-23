// Minimal postbuild copy to ensure production matches local
// Copies top-level 'images' into 'dist/images' after Vite build.
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', 'images');
const DEST = path.resolve(__dirname, '..', 'dist', 'images');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(SRC, DEST);
console.log('[postbuild] Copied images/ to dist/images');


