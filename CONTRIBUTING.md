# Contributing

Issues and pull requests are welcome.

1. `npm install`, then `npm run dev`.
2. Keep simulation maths pure and covered in `tests/`. Run `npm run typecheck && npm test` before opening a PR.
3. Import three.js from `@iwsdk/core`, never from `three` directly.
4. Never allocate in a system's `update()`. Avoid per-frame garbage on Quest.
5. Label any screenshot or measurement with where it came from: emulator or headset.
