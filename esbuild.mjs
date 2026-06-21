import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

function copyDir(src, dest) {
  if (!existsSync(src)) return;
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  sourcesContent: false,
  treeShaking: true,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"'
  }
};

const highlightConfig = {
  entryPoints: ['src/highlight.bundle.js'],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  outfile: 'dist/highlight.min.js',
  sourcemap: false,
  minify: true,
  legalComments: 'none'
};

async function main() {
  if (!existsSync('dist')) {
    mkdirSync('dist', { recursive: true });
  }

  try {
    await Promise.all([
      build(extensionConfig),
      build(highlightConfig)
    ]);

    if (existsSync('media/icon.png')) {
      copyFileSync('media/icon.png', 'dist/icon.png');
    }

    copyFileSync('src/chat/webview/styles.css', 'dist/chat.css');
    copyFileSync('src/chat/webview/markdown.js', 'dist/markdown.js');
    copyFileSync('src/chat/webview/chat.js', 'dist/chat.js');

    console.log('[esbuild] Build complete');
  } catch (err) {
    console.error('[esbuild] Build failed:', err);
    process.exit(1);
  }
}

main();