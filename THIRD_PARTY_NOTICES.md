# Third-party notices

Tekne ships no third-party art, audio or fonts. All visuals are generated in code, and all sounds are synthesised at runtime.

## Runtime dependencies (bundled in the web build)

| Package | Licence | Notes |
|---|---|---|
| `@iwsdk/core` and `@iwsdk/*` (Immersive Web SDK, Meta) | MIT | Engine, ECS, XR session, scene understanding |
| `three` (via `super-three@0.185.0`) | MIT | Rendering |
| `elics` | MIT | ECS |
| `@pmndrs/uikit`, `@pmndrs/handle`, `@pmndrs/pointer-events` | MIT (licence text in `LICENSE`) | Pulled in by IWSDK |
| `@pmndrs/msdfonts` | Redistributes Google Fonts (OFL) | Bundled fonts are disabled in this build |
| `@babylonjs/havok` | Apache-2.0 | Pulled in by IWSDK; physics is disabled in this app |
| `@drawcall/uikitml` 0.1.8 | **Not declared by the package** | Transitive dependency of IWSDK; Tekne does not use UIKitML directly |
| Others (`entities`, `moo`, …) | BSD-2/BSD-3/CC0/MIT/Apache-2.0 | Transitive |

Reproduce with `npx license-checker-rseidelsohn --production --summary`.

## Development-only tools (not shipped)

| Package | Licence |
|---|---|
| `iwer`, `@iwer/*` (Immersive Web Emulator, Meta) | MIT |
| `@iwsdk/cli`, `@iwsdk/vite-plugin-dev`, `@iwsdk/reference` | MIT |
| `@meta-quest/metavr` (Meta VR CLI) | Meta Platform Technologies SDK License |
| `vite`, `vitest`, `typescript` | MIT / Apache-2.0 |

## Research credit

The marbling operations follow S. Lu, A. Jaffer, X. Jin, H. Zhao, X. Mao, "Mathematical Marbling," IEEE Computer Graphics and Applications 32(6), 2012. The implementation is original.
