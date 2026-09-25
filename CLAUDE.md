# PIBBOY — rules for working on this repo

Read `HANDOFF.md` first (architecture, decisions, known bugs, next steps), then `README.md` and the
DATA MODEL comment at the top of `js/state.js`.

- Personal, single-user app: no features for other users, no paid services.
- Never lose the owner's data: every data-shape change goes through `migrate()` and
  `sanitizeImported()` in `js/state.js`, with a test.
- Never commit copyrighted audio/video or sound packs (the repo is public for GitHub Pages).
- Plain scripts sharing `window.StatusTerminal`; no framework, no build step for the app.
- Before every push: `node --test` must pass. Pushing to `main` deploys to GitHub Pages.
- Bump `CACHE` in `sw.js` and update `APP_SHELL` when app files are added or removed.
- Keep the amber terminal look; decorations must never block taps and must respect
  `prefers-reduced-motion`.
- The owner writes in French or English; reply in the language of their latest message, simply
  (they are a beginner).
