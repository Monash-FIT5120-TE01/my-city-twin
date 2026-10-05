/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREETSCAPE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The street level of the CBD from open data: road surfaces, trees and planters, street lights, signals
 *   with their push buttons, tram rails, overhead and platforms, seats, pit lids, tactile pads, parking-bay
 *   lines, fountains and toilets. Trams themselves are not drawn yet.
 *
 * WHERE THE DATA COMES FROM
 *   public/data/streetscape/*.json, written by scripts/build-streetscape.mjs, which also decides every
 *   placement (see its header for the sources and the rules). manifest.json lists the sources, counts and
 *   what is estimated.
 *
 * INSIDE <WorldFrame>
 *   x east, y north, z up. The group is lifted to the ground plane's AHD, so everything below is built from
 *   z = 0 at the ground. The ground is flat (terrain is later work), so the streetscape is flat too.
 *
 * DISTANCE BANDS (checked four times a second, not every frame)
 *   always    surfaces, tree trunks and crowns, rails
 *   mid       < 600 m: light poles, signal posts, overhead poles and wires
 *   near      < 220 m: everything small, in 100 m cells
 *   textures  < 60 m: ground textures (made on first use, dropped after 20 s unused)
 *
 * NOT IN THE SUNLIGHT FIGURES
 *   None of this casts a shadow, so the picture shows no shade the numbers do not count.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, Vector3, type Mesh, type Object3D } from 'three';
import { bundled } from '../../data/bundled';
import { buildSurfaces, SurfaceTextures, type SurfacesDoc } from './surfaces';
import { buildTrees, type TreesDoc } from './trees';
import { buildStreet, type StreetDoc } from './street';
import { SignalSystem, type SignalsDoc } from './signals';
import { buildTram, type TramDoc } from './tram';
import { PedestrianAudio } from './pedestrianAudio';
import { Lighting } from './lights';
import { setSlicer } from './kit';
import { DEVICE, DIST, LodSet, detectDevice, type DeviceSettings } from './lod';

interface Docs { surfaces: SurfacesDoc; trees: TreesDoc; street: StreetDoc; signals: SignalsDoc; tram: TramDoc }
interface Built {
  root: Group; slabs: Mesh[]; lod: LodSet; low: Object3D[];
  signals: SignalSystem; textures: SurfaceTextures; lighting: Lighting;
}

/*
 * Built in steps with a pause between them, starting only once the browser is idle. Built in one go it held
 * the main thread for several seconds, long enough to make the front page's scrolling miss its target.
 */
const pause = () => new Promise<void>((done) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(() => done(), { timeout: 1500 }); else setTimeout(done, 30);
});
/** A short break inside one step: lets a frame through without waiting for the browser to go idle. */
const yieldNow = () => new Promise<void>((done) => setTimeout(done, 0));
async function build(d: Docs, alive: () => boolean): Promise<Built | null> {
  const root = new Group(); root.name = 'streetscape';
  await pause(); if (!alive()) return null;
  const surfaces = await buildSurfaces(d.surfaces, yieldNow); await pause(); if (!alive()) return null;
  const trees = await buildTrees(d.trees); await pause(); if (!alive()) return null;
  const street = await buildStreet(d.street); await pause(); if (!alive()) return null;
  const tram = await buildTram(d.tram); await pause(); if (!alive()) return null;
  const signals = await new SignalSystem().build(d.signals); await pause(); if (!alive()) return null;
  const lighting = await new Lighting().build(d.street.lights, d.street.featureLights || []);
  root.add(surfaces.root, trees.always, tram.always, trees.near, street.near, street.mid, tram.near, tram.mid, signals.group, lighting.near, lighting.mid, lighting.pools);
  const angle = Math.atan2(d.surfaces.axes.ew[1], d.surfaces.axes.ew[0]);
  const signalNear = signals.group.children.find((c) => c.name === 'signals-near') as Group;
  const signalMid = signals.group.children.find((c) => c.name === 'signals-mid') as Group;

  // Everything switched by distance is registered once, here, with its bounding sphere.
  const lod = new LodSet();
  const slabs = surfaces.near.children as Mesh[];
  for (const m of slabs) { const u = m.userData as { centre: [number, number]; radius: number }; lod.add(m, u.centre[0], u.centre[1], 0, u.radius, DIST.slabs); }
  const cells = (g: Group, within: number) => { for (const c of g.children) if (c.userData.centre) lod.add(c, c.userData.centre[0], c.userData.centre[1], CELL_MID_Z_M, c.userData.radius, within); };
  for (const g of [trees.near, street.near, tram.near, signalNear, lighting.near]) cells(g, DIST.small);
  for (const g of [street.mid, tram.mid, signalMid, lighting.mid]) cells(g, DIST.tall);
  for (const g of [...trees.groups, ...street.groups, signals.marks]) lod.addGroup(g);
  const low: Object3D[] = []; root.traverse((o) => { if (o.userData.lowOnly) low.push(o); });
  return { root, slabs, lod, low, signals, textures: new SurfaceTextures(angle), lighting };
}

function disposeAll(o: Object3D) {
  o.traverse((c) => { const m = c as Mesh; if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose(); });
}

/** A cell's bounding sphere is centred 5 m up (Batch sets its radius). */
const CELL_MID_Z_M = 5;

/** Distances and near textures, from the camera in the streetscape's own frame (east, north, up). */
function stepBands(b: Built, cam: Vector3, device: DeviceSettings): void {
  b.root.worldToLocal(cam);
  b.lod.update(cam, device.reach);
  for (const m of b.slabs) {
    const u = m.userData as { texKey: string | null; plain: Mesh['material']; centre: [number, number]; radius: number; walled: boolean; nearOnly: boolean };
    if (!device.textures && !u.walled && !u.nearOnly) m.visible = false;   // the far slab under it is as good without a texture
    if (!m.visible) continue;
    const d = Math.hypot(u.centre[0] - cam.x, u.centre[1] - cam.y, cam.z) - u.radius;
    const mat = device.textures && u.texKey && d < DIST.textures ? b.textures.get(u.texKey) : null;
    m.material = mat ?? u.plain;
  }
  // paint, pit lids and tactile pads (one instanced mesh each for the whole city): only from a low camera
  const low = cam.z < DIST.tiny * 1.5 * device.reach;
  for (const o of b.low) o.visible = low;
}

/**
 * @param lampsLit street and feature lights on: decided by the caller (after sunset, unless the visitor has
 *                 switched the street lights off in Map layers).
 */
export function Streetscape({ groundAhdM, lampsLit = false }: { groundAhdM: number; lampsLit?: boolean }) {
  const [built, setBuilt] = useState<Built | null>(null);
  const getThree = useThree((s) => s.get);
  useEffect(() => {
    let alive = true;
    /*
     * Compile its shaders before it is first drawn: compiled on first draw they held the thread for most of a
     * second. compileAsync lets the GPU driver do it in the background where it can (KHR_parallel_shader_compile).
     * Group by group, in case it cannot.
     */
    const compile = async (b: Built | null) => {
      if (!b || !alive) return b;
      const { gl, camera, scene } = getThree();
      // a group at a time, with a break between, for drivers that compile in the foreground anyway
      for (const part of [...b.root.children]) {
        await yieldNow(); if (!alive) return b;
        try { await gl.compileAsync(part, camera, scene); } catch { /* compiled on first draw instead */ }
      }
      return b;
    };
    const get = (name: string) => fetch(bundled(`data/streetscape/${name}.json`)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(name))));
    Promise.all(['surfaces', 'trees', 'street', 'signals', 'tram'].map(get))
      .then(([surfaces, trees, street, signals, tram]) => { setSlicer(yieldNow); return build({ surfaces, trees, street, signals, tram }, () => alive).finally(() => setSlicer(null)); })
      .then(compile)
      .then((b) => { if (alive && b) setBuilt(b); else if (b) { disposeAll(b.root); b.textures.dispose(); } })
      // The city stands without it; a missing street layer is not worth an error in front of anyone.
      .catch(() => undefined);
    return () => { alive = false; };
  }, [getThree]);

  // The per-frame work changes materials and visibility on these objects; it reads them through a ref.
  const live = useRef<Built | null>(null);
  useEffect(() => { live.current = built; return () => { live.current = null; if (built) { disposeAll(built.root); built.textures.dispose(); } }; }, [built]);

  const { camera, gl } = useThree();
  const baseDevice = useMemo(() => detectDevice(), []);
  const audio = useRef<PedestrianAudio | null>(null);
  useEffect(() => {
    if (!built) return;
    const a = new PedestrianAudio(camera, built.root); audio.current = a;
    return () => { a.dispose(); audio.current = null; };
  }, [built, camera]);

  const tick = useRef(1), sweep = useRef(0), cam = useMemo(() => new Vector3(), []);
  useFrame((state, dt) => {
    const built = live.current;
    if (!built) return;
    const t = state.clock.elapsedTime;
    built.signals.update(t);
    built.lighting.setLit(lampsLit);
    tick.current += dt; if (tick.current < 0.25) return; tick.current = 0;
    // world position: in VR the camera sits inside the player rig, so its own position is only head-local
    state.camera.getWorldPosition(cam); stepBands(built, cam, DEVICE[gl.xr.isPresenting ? 'xr' : baseDevice]);
    sweep.current += 0.25; if (sweep.current > 5) { sweep.current = 0; built.textures.sweep(); }
    audio.current?.update(cam, built.signals.buttons, (i) => { const b = built.signals.buttons[i]; return built.signals.phase(b.site, t).walk === b.crosses; });
  });

  return <group position={[0, 0, groundAhdM]}>{built && <primitive object={built.root} />}</group>;
}
