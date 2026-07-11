import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Stamp the service worker with a per-build id. public/sw.js is copied
 * verbatim into dist by Vite, so after the bundle closes we rewrite the
 * dist copy, replacing the literal __BUILD__ placeholder. The SW names its
 * app cache rie-app-<stamp> and sweeps every other rie-app-* on activate —
 * this stamp is what makes each deploy a fresh cache. Dev never registers
 * the SW (prod-only guard in src/ui/main.ts), so the placeholder staying
 * literal in dev is harmless. */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'rie-stamp-sw',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir;
      root = cfg.root;
    },
    closeBundle() {
      const file = resolve(root, outDir, 'sw.js');
      try {
        const stamp = Date.now().toString(36);
        writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD__', stamp));
      } catch {
        // no sw.js in this build (e.g. lib mode) — nothing to stamp
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [stampServiceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
  },
});
