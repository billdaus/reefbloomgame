import { defineConfig } from 'vite';
import { renameSync, existsSync } from 'node:fs';

// Everything the 3D page needs to behave as an app (status-bar inset, a Home
// link instead of "← Classic", a save flush when iOS backgrounds the app) is
// injected here at build time, so threed.html and the game source stay
// byte-identical for the website.
const APP_SHELL_INJECT = `
  <script>
    document.documentElement.classList.add('app-shell');
    document.addEventListener('DOMContentLoaded', function () {
      var back = document.getElementById('back');
      if (back) { back.textContent = '\u2302 Home'; back.href = './index.html'; }
    });
    // The game saves on beforeunload; iOS may skip that when backgrounding or
    // leaving via a link, so mirror pagehide/hidden into the same handler.
    function flush() { window.dispatchEvent(new Event('beforeunload')); }
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  </script>
  <style>
    /* App feel: no long-press callouts or text selection, no rubber-banding,
       and the reef surfaces with a short fade instead of a hard cut from Home. */
    html.app-shell { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; overscroll-behavior: none; }
    html.app-shell body { animation: appSurface 0.5s ease-out both; }
    @keyframes appSurface { from { opacity: 0; } to { opacity: 1; } }
    /* Edge-to-edge WebView: keep the fixed top chrome below the status bar. */
    :root { --sat: env(safe-area-inset-top, 0px); }
    #back { top: calc(12px + var(--sat)); }
    #slots { top: calc(46px + var(--sat)); }
    #menu3d { top: calc(12px + var(--sat)); }
    #palette { top: calc(84px + var(--sat)); }
    #palette-toggle { top: calc(50px + var(--sat)); }
    @media (min-width: 701px) { #hud { top: calc(10px + var(--sat)); } }
    @media (min-width: 701px) and (max-width: 1200px) { #hud { top: calc(48px + var(--sat)); } }
  </style>`;

// Two builds from one codebase:
//   vite build              → dist/      the website: Classic + Mobile + 3D
//   vite build --mode app   → dist-app/  the iOS app shell: 3D edition only
// The app build has its own Home screen (app.html, emitted as index.html) that
// hands off to threed.html; nothing from Classic or the public/ pages ships.
export default defineConfig(({ mode }) => {
  const isApp = mode === 'app';
  return {
    server: {
      host: true,
      port: 5173,
    },
    publicDir: isApp ? false : 'public',
    build: {
      target: 'es2022',
      assetsDir: 'assets',
      outDir: isApp ? 'dist-app' : 'dist',
      rollupOptions: {
        input: isApp
          ? { app: 'app.html', threed: 'threed.html' }
          : {
              main:   'index.html',
              mobile: 'mobile/index.html',
              threed: 'threed.html',
            },
      },
    },
    base: './',
    plugins: isApp ? [{
      name: 'reef-app-shell',
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          if (!ctx.filename.endsWith('threed.html')) return html;
          return html.replace('</head>', APP_SHELL_INJECT + '\n</head>');
        },
      },
      closeBundle() {
        if (existsSync('dist-app/app.html')) renameSync('dist-app/app.html', 'dist-app/index.html');
      },
    }] : [],
  };
});
