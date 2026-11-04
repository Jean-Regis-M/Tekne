// Demo footage director (development only). Load in the dev page opened with
// `?rec=1&lesson` while `node scripts/rec-server.mjs <dir>` runs:
//   const m = await import('/scripts/shoot.js'); m.run();   // poll window.__shoot
// It drives the Immersive Web Emulator's hands and head through its
// remote-control API (real app input, scripted) and records each shot with the
// dev recorder. Nothing here changes what the app does.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolves once animation frames are flowing (window visible and in view). */
function framesFlowing(timeout = 400) {
  return new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const f = () => {
      n++;
      if (n >= 3) res(true);
      else if (performance.now() - t0 < timeout) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    setTimeout(() => res(n >= 3), timeout + 50);
  });
}

/** Blocks while the window is hidden; pauses the recording meanwhile. */
async function live() {
  if (await framesFlowing()) return;
  const st = window.__shoot;
  const prev = st.status;
  st.status = `PAUSED: window not visible (${prev})`;
  st.pauses = (st.pauses || 0) + 1;
  window.__rec?.pause();
  while (!(await framesFlowing())) await wait(500);
  await wait(800); // let a few frames render before continuing
  window.__rec?.resume();
  st.status = prev;
}

const sleep = async (ms) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    await live();
    await wait(Math.min(100, end - performance.now()));
  }
};

export async function run() {
  const st = (window.__shoot = { status: 'starting', clips: [], error: null });
  try {
    const E = window.__ebru;
    const dev = window.IWER_DEVICE;
    const r = dev.remote;
    const tray = E.tray;
    if (!E.world.session) {
      E.world.launchXR();
      await sleep(3000);
    }
    dev.primaryInputMode = 'hand';
    await sleep(6000); // emulator room and shaders settle before filming
    const T = tray.root;
    const V = T.position.constructor;
    const W = (x, h, y) => T.localToWorld(new V(x, h, -y));

    const tip = async (x, h, y, wait = 40) => {
      await live();
      const w = W(x, h, y);
      await r.dispatch('set_transform', { device: 'hand-right', position: { x: w.x, y: w.y, z: w.z }, anchor: 'index-finger-tip' });
      if (wait) await sleep(wait);
    };
    const pinch = async (v, wait = 110) => {
      await live();
      await r.dispatch('set_select_value', { device: 'hand-right', value: v });
      await sleep(wait);
    };
    const drop = async (x, y, h) => {
      await tip(x, h, y, 60);
      await pinch(1);
      await pinch(0, 150);
    };
    const head = async (pos, look) => {
      await r.dispatch('set_transform', { device: 'headset', position: pos });
      await r.dispatch('look_at', { device: 'headset', target: look });
    };
    const pan = async (from, to, ms) => {
      const steps = Math.max(1, Math.round(ms / 40));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        await r.dispatch('look_at', {
          device: 'headset',
          target: { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e },
        });
        await sleep(40);
      }
    };
    const clip = async (name, body) => {
      st.status = `recording ${name}`;
      window.__rec.start(30);
      await body();
      const res = await window.__rec.stop(name);
      st.clips.push({ name, res });
    };
    const P = (v) => ({ x: v.x, y: v.y, z: v.z });
    const seated = { x: 0, y: 1.6, z: 0 };
    const trayC = P(W(0, 0, 0.02));
    let seed = 1453;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const park = () => tip(0.55, 0.35, 0.45, 0);

    // 1. First-run lesson: watch the ghost, then poke a pot and make 3 drops.
    await head(P(W(0, 0.5, -0.42)), trayC);
    await park();
    await clip('c1_lesson', async () => {
      await sleep(6500);
      const pot = tray.potPosition(0);
      await tip(pot.x, 0.08, -pot.z, 250);
      await tip(pot.x, 0.02, -pot.z, 300);
      await tip(pot.x, 0.08, -pot.z, 200);
      await park();
      st.lessonAfterPoke = E.lesson?.flow.step?.id ?? 'none';
      await sleep(3200);
      for (const [x, y] of [[-0.1, 0.04], [0.06, -0.05], [0.0, 0.07]]) await drop(x, y, 0.1);
      await park();
      await sleep(2500);
    });

    // 2. Painting: battal ground in three pigments, then gelgit strokes.
    const near = P(W(0, 0.45, -0.34)); // user's side of the tray (surface y is negative toward the user)
    await head(near, trayC);
    await clip('c2_paint', async () => {
      for (const [pig, n] of [[0, 14], [2, 11], [1, 9]]) {
        tray.selectPigment(pig);
        for (let i = 0; i < n; i++) await drop((rnd() - 0.5) * 0.44, (rnd() - 0.5) * 0.3, 0.06 + rnd() * 0.12);
      }
      for (let row = 0; row < 9; row++) {
        const y = -0.14 + row * 0.035;
        const dir = row % 2 ? -1 : 1;
        await tip(-0.22 * dir, 0.03, y);
        for (let s = 0; s <= 22; s++) await tip((-0.22 + s * 0.02) * dir, -0.003, y, 30);
        await tip(0.22 * dir, 0.04, y);
      }
      await park();
      await sleep(800);
    });

    // 3. Comb: pinch it off the rim and pull through two lanes (close view).
    await head(P(W(0, 0.38, -0.2)), P(W(0, 0, 0.02)));
    await clip('c3_comb', async () => {
      const c = tray.combRest;
      await tip(c.x, c.y + 0.05, -c.z, 300);
      await tip(c.x, c.y, -c.z, 200);
      await pinch(1, 300);
      for (const x of [-0.11, 0.11]) {
        await tip(x, 0.1, -0.17, 200);
        await tip(x, 0.044, -0.17, 150);
        for (let s = 0; s <= 34; s++) await tip(x, 0.044, -0.17 + s * 0.01, 70);
        await tip(x, 0.1, 0.17, 200);
      }
      await pinch(0, 300);
      await park();
      await sleep(1200);
    });

    // 4. Print: carry the paper onto the water, release, follow it to the wall.
    await head(seated, trayC);
    await clip('c4_print', async () => {
      await sleep(1200);
      const p = tray.paperRest;
      await tip(p.x, 0.05, -p.z, 300);
      await tip(p.x, 0.012, -p.z, 300);
      await pinch(1, 400);
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        await tip(p.x * (1 - t), 0.012 + Math.sin(t * Math.PI) * 0.08, 0, 60);
      }
      await sleep(400);
      await pinch(0, 200);
      await park();
      const wall = E.gallery.prints[0]?.userData.target;
      const wallLook = wall ? { x: wall.x - 0.25, y: wall.y, z: wall.z } : { x: 0.6, y: 1.5, z: -3.4 };
      await pan(trayC, wallLook, 1600);
      await sleep(6500);
      await pan(wallLook, trayC, 1600);
      await sleep(1500);
    });

    // 5. Comfort tiles: high contrast on, a few drops, then off again.
    const tiles = tray.tiles;
    await head(P(W(0.14, 0.4, -0.4)), P(W(0.14, 0, -0.08)));
    await clip('c5_access', async () => {
      await sleep(1000);
      const t = tiles[1].mesh.position;
      const poke = async () => {
        await tip(t.x, 0.06, -t.z, 300);
        await tip(t.x, 0.004, -t.z, 300);
        await tip(t.x, 0.06, -t.z, 300);
      };
      await poke();
      for (const pig of [4, 2, 1, 0, 5, 4]) {
        tray.selectPigment(pig);
        await drop((rnd() - 0.5) * 0.36, (rnd() - 0.5) * 0.22, 0.08);
      }
      await sleep(1200);
      await poke();
      await park();
      await sleep(1500);
    });

    // 6. Gallery: a slow look along the wall.
    const g = E.gallery.prints[0]?.userData.target;
    const gl = g ? { x: g.x, y: g.y, z: g.z } : { x: 0.9, y: 1.5, z: -3.4 };
    await head({ x: gl.x - 0.35, y: gl.y + 0.05, z: gl.z + 0.95 }, { x: gl.x - 0.7, y: gl.y, z: gl.z });
    await clip('c6_gallery', async () => {
      await sleep(600);
      await pan({ x: gl.x - 0.7, y: gl.y, z: gl.z }, { x: gl.x + 0.1, y: gl.y, z: gl.z }, 5200);
      await sleep(1500);
    });

    st.final = { lesson: E.lesson?.flow.done ? 'complete' : E.lesson?.flow.step?.id, prints: tray.counters.prints, drops: tray.counters.drops, combTravel: +tray.counters.combTravel.toFixed(2) };
    st.status = 'done';
  } catch (e) {
    st.error = String(e && e.stack ? e.stack : e);
    st.status = 'failed';
  }
}
