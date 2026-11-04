import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { TraySystem } from './marbling/tray-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(TraySystem);
  console.info('[ebru] world ready');
  if (import.meta.env.DEV) {
    // Development-only handle for emulator-driven tests and evidence capture.
    (window as unknown as Record<string, unknown>).__ebru = {
      world,
      tray: world.getSystem(TraySystem),
    };
  }
}).catch((err: unknown) => {
  console.error('[ebru] world failed to start', err);
});
