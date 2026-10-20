import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { UNIT_ROD, rodBetween } from './kit';
import { cutFine, liftOntoGround, streetGroundOf } from './onGround';
import { heightAt, type Terrain } from '../terrain';
import { trackFrame } from './trams/TramLayer';

/** Ground rising 1 m every 10 m eastward. */
const slope = (e: number) => e / 10;

describe('the street furniture onto the ground', () => {
  it('two meshes sharing one geometry are each raised once, by the ground where each stands', async () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
    const root = new Group();
    const west = new Mesh(geo, new MeshBasicMaterial());
    const east = new Mesh(geo, new MeshBasicMaterial());
    east.position.set(100, 0, 0);
    root.add(west, east);
    await liftOntoGround(root, slope);
    expect(west.geometry.getAttribute('position').getZ(0)).toBeCloseTo(0, 6);
    expect(east.geometry.getAttribute('position').getZ(0)).toBeCloseTo(10, 6);   // not 10 + 0, nor twice
    expect(geo.getAttribute('position').getZ(0)).toBe(0);                         // the shared one untouched
  });

  it('a long thin instance has each end on the ground at that end', async () => {
    const rod = new BoxGeometry(0.02, 0.02, 1);   // a unit rod along z, as kit.ts UNIT_ROD is scaled
    const im = new InstancedMesh(rod, new MeshBasicMaterial(), 1);
    // lie it east-west from (0,0) to (20,0), 6 m up: rotate z onto x and stretch to 20 m
    const m = new Matrix4().compose(new Vector3(10, 0, 6), new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(1, 0, 0)), new Vector3(1, 1, 20));
    im.setMatrixAt(0, m);
    const root = new Group();
    root.add(im);
    await liftOntoGround(root, slope);
    im.getMatrixAt(0, m);
    const west = new Vector3(0, 0, -0.5).applyMatrix4(m);
    const east = new Vector3(0, 0, 0.5).applyMatrix4(m);
    expect(west.z).toBeCloseTo(6 + slope(west.x), 4);
    expect(east.z).toBeCloseTo(6 + slope(east.x), 4);
  });

  it('a real span wire (the kit unit rod, placed by rodBetween) has each end on the ground at that end', async () => {
    const from = new Vector3(0, 0, 6.6);
    const to = new Vector3(20, 0, 5.74);
    const im = new InstancedMesh(UNIT_ROD, new MeshBasicMaterial(), 1);
    im.setMatrixAt(0, rodBetween(from, to, 0.005));
    const root = new Group();
    root.add(im);
    await liftOntoGround(root, slope);
    const m = new Matrix4();
    im.getMatrixAt(0, m);
    // the rod runs along its local z from 0 to 1
    const a = new Vector3(0, 0, 0).applyMatrix4(m);
    const b = new Vector3(0, 0, 1).applyMatrix4(m);
    expect(a.z).toBeCloseTo(6.6 + slope(0), 3);
    expect(b.z).toBeCloseTo(5.74 + slope(20), 3);
  });

  it('cuts long flat triangles fine, carrying the texture coordinates along', () => {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 40, 0, 0, 0, 40, 0]), 3));
    geo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2));
    const cut = cutFine(geo, 8);
    const p = cut.getAttribute('position');
    const uv = cut.getAttribute('uv');
    expect(p.count).toBeGreaterThan(30);
    for (let i = 0; i < p.count; i++) {
      expect(uv.getX(i)).toBeCloseTo(p.getX(i) / 40, 5);
      expect(uv.getY(i)).toBeCloseTo(p.getY(i) / 40, 5);
    }
    for (let i = 0; i < p.count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = i + k, b = i + ((k + 1) % 3);
        expect(Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b))).toBeLessThanOrEqual(8 + 1e-6);
      }
    }
  });
});

describe('a tram section on a slope', () => {
  const up = (m: Matrix4) => new Vector3(0, 0, 1).transformDirection(m);
  const ahead = (m: Matrix4) => new Vector3(1, 0, 0).transformDirection(m);

  it('heading west on the level stays upright', () => {
    const m = trackFrame([10, 0], [0, 0], 5, 5, 0.04, new Matrix4());
    expect(up(m).z).toBeCloseTo(1, 6);
    expect(ahead(m).x).toBeCloseTo(-1, 6);
  });

  for (const [name, a, b] of [['north', [0, 0], [0, 10]], ['south-west', [10, 10], [0, 0]], ['east', [0, 0], [10, 0]]] as const) {
    it(`heading ${name} up a 10% slope: tipped up, never rolled`, () => {
      const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = trackFrame(a, b, 0, run / 10, 0, new Matrix4());
      const f = ahead(m);
      expect(f.z / Math.hypot(f.x, f.y)).toBeCloseTo(0.1, 6);                 // along the slope
      const side = new Vector3(0, 1, 0).transformDirection(m);
      expect(side.z).toBeCloseTo(0, 6);                                        // level across: no roll
      expect(up(m).z).toBeGreaterThan(0.99);
    });
  }
});

describe('the ground the street is laid on', () => {
  // a ridge running north-south along e = 50: up 1 m in 10 m, then down again
  const cols = 11, rows = 11, cell = 10;
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) heights[r * cols + c] = 5 - Math.abs(c - 5) * 1;
  const ridge = { minE: 0, minN: 0, cell, cols, rows, heights } as unknown as Terrain;

  it('a 20 m road across a ridge, its corners on the street ground, passes over the top', () => {
    const at = streetGroundOf(ridge);
    // corners either side of the crest, 20 m apart; the middle of the edge is over the crest
    const mid = (at(40, 50) + at(60, 50)) / 2;
    expect(mid).toBeGreaterThanOrEqual(heightAt(ridge, 50, 50));
  });

  it('flat ground is not raised', () => {
    const flat = { ...ridge, heights: new Float32Array(cols * rows).fill(3) } as Terrain;
    expect(streetGroundOf(flat)(42, 57)).toBeCloseTo(3, 6);
    expect(streetGroundOf(7)(1, 2)).toBe(7);
  });
});
