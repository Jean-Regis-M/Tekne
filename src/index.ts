import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PerfHudSystem } from './debug/perf-hud.js';
import { GallerySystem } from './gallery/gallery-system.js';
import { TraySystem } from './marbling/tray-system.js';
import { OnboardingSystem, lessonNeeded } from './onboarding/onboarding-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(TraySystem);
  world.registerSystem(GallerySystem);
  if (lessonNeeded()) world.registerSystem(OnboardingSystem);
  if (new URLSearchParams(location.search).has('hud')) world.registerSystem(PerfHudSystem);
  console.info('[ebru] world ready');
  wireLanding(world);
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('rec')) {
    void import('./debug/recorder.js').then((m) => m.installRecorder(world.renderer.domElement));
  }
  if (import.meta.env.DEV) {
    // Development-only handle for emulator-driven tests and evidence capture.
    (window as unknown as Record<string, unknown>).__ebru = {
      world,
      tray: world.getSystem(TraySystem),
      lesson: world.getSystem(OnboardingSystem),
      gallery: world.getSystem(GallerySystem),
    };
  }
}).catch((err: unknown) => {
  console.error('[ebru] world failed to start', err);
});

/**
 * Landing screen: a clear way in on Quest Browser (the browser may also offer
 * its own Enter button), and an honest message on devices without WebXR AR.
 */
function wireLanding(world: World): void {
  const landing = document.getElementById('landing');
  const button = document.getElementById('enter') as HTMLButtonElement | null;
  const note = document.getElementById('note');
  if (!landing || !button || !note) return;
  const xr = navigator.xr;
  const ready = (ok: boolean) => {
    button.disabled = !ok;
    button.textContent = ok ? 'Enter mixed reality' : 'Open on Meta Quest 3 or 3S';
    note.textContent = ok ? '' : 'This experience needs a headset with hand tracking and passthrough.';
  };
  if (!xr) ready(false);
  else xr.isSessionSupported('immersive-ar').then(ready, () => ready(false));
  button.addEventListener('click', () => {
    note.textContent = 'Starting…';
    world.launchXR();
  });
  world.visibilityState.subscribe((v) => {
    landing.classList.toggle('hidden', v !== VisibilityState.NonImmersive);
    if (v === VisibilityState.NonImmersive) note.textContent = '';
  });
}
