import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PerfHudSystem } from './debug/perf-hud.js';
import { TraySystem } from './marbling/tray-system.js';
import { OnboardingSystem, lessonNeeded } from './onboarding/onboarding-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(TraySystem);
  if (lessonNeeded()) world.registerSystem(OnboardingSystem);
  if (new URLSearchParams(location.search).has('hud')) world.registerSystem(PerfHudSystem);
  console.info('[ebru] world ready');
  if (import.meta.env.DEV) {
    // Development-only handle for emulator-driven tests and evidence capture.
    (window as unknown as Record<string, unknown>).__ebru = {
      world,
      tray: world.getSystem(TraySystem),
      lesson: world.getSystem(OnboardingSystem),
    };
  }
}).catch((err: unknown) => {
  console.error('[ebru] world failed to start', err);
});
