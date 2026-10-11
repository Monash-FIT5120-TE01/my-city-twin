/*
 * Draws the parts of rooftop arrays (panelModel.ts): one instanced box per
 * kind of part, so a roof of thousands of panels is a handful of draws.
 * The panel's face is painted from its datasheet: the black frame, and the
 * cells in 6 columns of 2 x 12 with the glass showing between them.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CanvasTexture, InstancedMesh, Matrix4, MeshLambertMaterial, MeshStandardMaterial, Object3D, SRGBColorSpace, type Material } from 'three';
import { MODULE, type ArrayParts, type PartBox } from './panelModel';

/** Galvanised steel, the black plates, concrete, and the frame (L* about 70, 17, 73, 7). */
const STEEL = '#a9adb0', PLATE = '#2a2a2a', CONCRETE = '#b9b4aa', FRAME = '#111111';

function cellFace(): CanvasTexture {
  const pxPerM = 600, w = Math.round(MODULE.widthM * pxPerM), h = Math.round(MODULE.lengthM * pxPerM);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = FRAME; g.fillRect(0, 0, w, h);
  const f = MODULE.frameFaceM * pxPerM;
  // the glass between the cells
  g.fillStyle = '#8b939c'; g.fillRect(f, f, w - 2 * f, h - 2 * f);
  const gap = 0.003 * pxPerM, mid = 0.012 * pxPerM;
  const cw = (w - 2 * f - (MODULE.columns + 1) * gap) / MODULE.columns;
  const ch = (h - 2 * f - mid - 2 * (MODULE.rowsEachHalf + 1) * gap) / (2 * MODULE.rowsEachHalf);
  for (let half = 0; half < 2; half++) {
    const top = f + half * ((h - 2 * f + mid) / 2);
    for (let row = 0; row < MODULE.rowsEachHalf; row++) {
      for (let col = 0; col < MODULE.columns; col++) {
        const x = f + gap + col * (cw + gap), y = top + gap + row * (ch + gap);
        g.fillStyle = '#1c2433'; g.fillRect(x, y, cw, ch);
      }
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function Boxes({ boxes, material }: { boxes: PartBox[]; material: Material | Material[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D(), m = new Matrix4();
    boxes.forEach((b, i) => {
      o.position.set(...b.centre); o.rotation.set(0, b.turnY, 0); o.scale.set(...b.size); o.updateMatrix();
      m.copy(o.matrix); mesh.setMatrixAt(i, m);
    });
    mesh.count = boxes.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  if (!boxes.length) return null;
  return <instancedMesh key={boxes.length} ref={ref} args={[geometry, material, boxes.length]} castShadow receiveShadow />;
}

export function PanelArray({ parts }: { parts: ArrayParts }) {
  const materials = useMemo(() => {
    const frame = new MeshStandardMaterial({ color: FRAME, metalness: 0.4, roughness: 0.5 });
    const face = new MeshStandardMaterial({ map: cellFace(), metalness: 0.1, roughness: 0.25 });
    return {
      // box faces: +x, -x, +y, -y, +z (the face), -z (the back glass)
      module: [frame, frame, frame, frame, face, new MeshLambertMaterial({ color: '#3a4250' })],
      steel: new MeshStandardMaterial({ color: STEEL, metalness: 0.6, roughness: 0.45 }),
      plate: new MeshLambertMaterial({ color: PLATE }),
      concrete: new MeshLambertMaterial({ color: CONCRETE }),
    };
  }, []);
  useEffect(() => () => {
    for (const m of [...materials.module, materials.steel, materials.plate, materials.concrete]) {
      (m as MeshStandardMaterial).map?.dispose(); m.dispose();
    }
  }, [materials]);
  return (
    <>
      <Boxes boxes={parts.modules} material={materials.module} />
      <Boxes boxes={parts.profiles} material={materials.steel} />
      <Boxes boxes={parts.posts} material={materials.steel} />
      <Boxes boxes={parts.plates} material={materials.plate} />
      <Boxes boxes={parts.blocks} material={materials.concrete} />
    </>
  );
}
