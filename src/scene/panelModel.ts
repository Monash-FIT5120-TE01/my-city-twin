/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT A ROOFTOP ARRAY IS MADE OF, TO SCALE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The panels and the frames under them, as products used on Melbourne
 * apartment roofs are drawn in their makers' documents, so an array on the
 * map has the size, pitch and height of a real one. Every part is a box,
 * placed by a transform: an array of any size is one instanced draw per part.
 *
 * THE PANEL
 *   A 445 W dual-glass module of the size Melbourne apartment projects use
 *   (400-480 W, about 1.7-1.9 m; ProjectDoc/solar/references/installed-systems.md):
 *   1762 x 1134 x 30 mm, black anodised frame showing 10 mm on the face, 144
 *   half cells in 6 columns of 2 x 12 (the maker's datasheet, kept as
 *   references/pdf/trina_vertex_s_plus_NEG9R28.pdf).
 *
 * THE FRAME, ROOFS UP TO ABOUT 30 m: BALLASTED, EAST-WEST AT 10 DEGREES
 *   Held down by concrete blocks rather than fixed through the roof; the
 *   French technical assessment of the system allows it on buildings up to
 *   30 m (references/pdf/mnt-panelclaw-wave-etn-france-2024.pdf p.21). Sizes
 *   from the system's side view for modules 1070-1150 mm wide (DNV's review,
 *   references/pdf/esdec_flatfix_wave_dnv_bankability.pdf p.3 and p.15):
 *     - pairs back to back, one face east and one west, 2460 mm apart (the
 *       pitch), 30-35 mm apart at the ridge;
 *     - the low edge 98 mm above the roof, the panel at 10 degrees;
 *     - base profiles 37 mm high running east-west under each row, on
 *       204 x 154 mm plates;
 *     - ballast blocks 100 x 200 x 80 mm (3.6 kg; the assessment's list,
 *       p.17), how many decided case by case by the maker's calculator: drawn
 *       here as two per profile in each valley, four along the field's edge.
 *   Where along the panel the profiles sit is in the installation manual,
 *   which we do not have: drawn at a fifth of the panel's length from each
 *   end. The system's wind deflectors are left out: the documents show that
 *   they exist, not their shape or where they go.
 *
 * THE FRAME, ROOFS ABOVE 30 m: FIXED TO THE SLAB, EAST-WEST AT 10 DEGREES
 *   Too high for blocks to hold (the frame above stops at 30 m; a maker's
 *   table marks where "the required ballast is higher than will fit under the
 *   system. The system must be mechanically attached to the roof",
 *   references/pdf/mnt-valk-valkbox3-manual.pdf p.5). A 12-storey, 50 m
 *   Port Melbourne block has its panels "chemically fixed 80mm" into the
 *   concrete. Drawn after an Australian system for exactly that
 *   (references/pdf/mnt-clenergy-solarroof-chemset-anchor-v1.pdf p.6-8,
 *   "ComT East-West"):
 *     - rails laid east-west on the slab, held by M8 x 110 mm anchor studs set
 *       80 mm into it through small interfaces;
 *     - a front leg at each panel's low edge and a rear leg under the ridge,
 *       10 degrees;
 *     - three rails under each row: a Sydney CBD tower of 39 storeys chose its
 *       panels for "superior wind uplift ratings when using three rails per
 *       panel" (installed-systems.md).
 *   Not published, so estimated: the legs' heights (the low edge at 150 mm,
 *   from a 350 mm rear leg in a supplier's listing less the panel's rise), the
 *   rail's section (40 x 35 mm), the gap between pairs at the valley (300 mm)
 *   and the anchors' spacing along a rail (1.2 m; the guide's example is
 *   1.5 m).
 */

/** A module, m. */
export const MODULE = { lengthM: 1.762, widthM: 1.134, thickM: 0.03, frameFaceM: 0.01, columns: 6, rowsEachHalf: 12, watts: 445 } as const;

/** The ballasted east-west frame, m and degrees. */
export const BALLASTED_EW = {
  tiltDeg: 10,
  pitchM: 2.46,
  ridgeGapM: 0.032,
  lowEdgeM: 0.098,
  /** Between rows of panels along their length (the clamp's gap). */
  rowGapM: 0.002,
  profileM: { height: 0.037, width: 0.04 },
  plateM: { length: 0.204, width: 0.154, height: 0.012 },
  blockM: { length: 0.2, width: 0.1, height: 0.08 },
  /** Profiles this far in from each end of the panel, as a share of its length (assumed; see above). */
  profileInset: 0.2,
} as const;

/** The frame fixed to the slab, m and degrees (see above for what is estimated). */
export const ANCHORED_EW = {
  tiltDeg: 10,
  lowEdgeM: 0.15,
  ridgeGapM: 0.05,
  valleyGapM: 0.3,
  rowGapM: 0.02,
  railM: { width: 0.04, height: 0.035 },
  /** Rails under each row, as shares of the panel's length from its south end. */
  rails: [0.15, 0.5, 0.85],
  anchorSpacingM: 1.2,
  interfaceM: { length: 0.08, width: 0.06, height: 0.03 },
  legM: 0.04,
} as const;

/** Buildings taller than this have their panels fixed to the slab; up to it, ballasted. */
export const BALLAST_MAX_HEIGHT_M = 30;
export type FrameKind = 'ballasted' | 'anchored';
export function frameFor(buildingHeightM: number): FrameKind {
  return buildingHeightM > BALLAST_MAX_HEIGHT_M ? 'anchored' : 'ballasted';
}

/** One box of a part: centre, size along its own axes, turn about north (y) in radians. */
export interface PartBox { centre: [number, number, number]; size: [number, number, number]; turnY: number }
/** Steel: profiles, rails, posts and legs; plates: black pads; blocks: concrete ballast. */
export interface ArrayParts { modules: PartBox[]; profiles: PartBox[]; posts: PartBox[]; plates: PartBox[]; blocks: PartBox[] }

const DEG = Math.PI / 180;

const RUN_M = MODULE.widthM * Math.cos(10 * DEG);
/** The east-west footprint of one pair and the north-south length of one row, m, by frame. */
export const PAIR_WIDTH_M: Record<FrameKind, number> = {
  ballasted: BALLASTED_EW.pitchM,
  anchored: ANCHORED_EW.ridgeGapM + 2 * RUN_M + ANCHORED_EW.valleyGapM,
};
export const ROW_LENGTH_M: Record<FrameKind, number> = {
  ballasted: MODULE.lengthM + BALLASTED_EW.rowGapM,
  anchored: MODULE.lengthM + ANCHORED_EW.rowGapM,
};

/** The two modules of a pair, either side of a ridge at x, the low edges `low` above the roof at z0. */
function pairModules(out: PartBox[], ridge: number, ridgeGap: number, low: number, yMid: number, z0: number) {
  const t = 10 * DEG, run = MODULE.widthM * Math.cos(t), rise = MODULE.widthM * Math.sin(t);
  for (const side of [-1, 1]) {
    // the module: its upper edge at the ridge, falling away to the valley on its side
    const cx = ridge + side * (ridgeGap / 2 + run / 2);
    const cz = z0 + low + rise / 2 + (MODULE.thickM / 2) * Math.cos(t);
    out.push({ centre: [cx + side * (MODULE.thickM / 2) * Math.sin(t), yMid, cz], size: [MODULE.widthM, MODULE.lengthM, MODULE.thickM], turnY: side * t });
  }
}

/** A field of either frame (see ballastedField and anchoredField). */
export function field(kind: FrameKind, pairs: number, rows: number, x0: number, y0: number, z0: number): ArrayParts {
  return kind === 'ballasted' ? ballastedField(pairs, rows, x0, y0, z0) : anchoredField(pairs, rows, x0, y0, z0);
}

/**
 * A field of `pairs` east-west pairs by `rows` rows, its south-west corner at (x0, y0) on a roof at
 * height z0, in metres east, north and up. The valleys fall on the field's east and west edges.
 */
export function ballastedField(pairs: number, rows: number, x0: number, y0: number, z0: number): ArrayParts {
  const f = BALLASTED_EW, t = f.tiltDeg * DEG;
  const out: ArrayParts = { modules: [], profiles: [], posts: [], plates: [], blocks: [] };
  const rise = MODULE.widthM * Math.sin(t);
  const ridgeTop = f.lowEdgeM + rise;
  const width = pairs * f.pitchM;
  // the plates and posts on the field's outer valleys are drawn wholly inside it: the layout checked
  // the field's footprint, not beyond
  const inField = (x: number, size: number) => Math.min(x0 + width - size / 2, Math.max(x0 + size / 2, x));

  for (let r = 0; r < rows; r++) {
    const yMid = y0 + (r + 0.5) * ROW_LENGTH_M.ballasted;
    const insets = [-1, 1].map((s) => yMid + s * (MODULE.lengthM / 2 - f.profileInset * MODULE.lengthM));
    // the profiles, continuous across the field
    for (const y of insets) out.profiles.push({ centre: [x0 + width / 2, y, z0 + f.profileM.height / 2], size: [width, f.profileM.width, f.profileM.height], turnY: 0 });

    for (let p = 0; p < pairs; p++) {
      const ridge = x0 + (p + 0.5) * f.pitchM;
      pairModules(out.modules, ridge, f.ridgeGapM, f.lowEdgeM, yMid, z0);
      for (const y of insets) {
        // a post up to the ridge, and one at each valley, each on a plate
        out.posts.push({ centre: [ridge, y, z0 + ridgeTop / 2], size: [0.05, f.profileM.width, ridgeTop], turnY: 0 });
        for (const x of [ridge, ridge - f.pitchM / 2, ridge + f.pitchM / 2]) {
          out.plates.push({ centre: [inField(x, f.plateM.length), y, z0 + f.plateM.height / 2], size: [f.plateM.length, f.plateM.width, f.plateM.height], turnY: 0 });
        }
        out.posts.push({ centre: [inField(ridge - f.pitchM / 2, 0.05), y, z0 + f.lowEdgeM / 2], size: [0.05, f.profileM.width, f.lowEdgeM], turnY: 0 });
      }
    }
    // the last valley's posts, on the field's east edge
    for (const y of insets) out.posts.push({ centre: [inField(x0 + width, 0.05), y, z0 + f.lowEdgeM / 2], size: [0.05, f.profileM.width, f.lowEdgeM], turnY: 0 });

    // ballast on the profiles in each valley, either side of the post: more along the field's edges
    for (let v = 0; v <= pairs; v++) {
      const x = x0 + v * f.pitchM;
      const edge = v === 0 || v === pairs || r === 0 || r === rows - 1;
      for (const y of insets) {
        const offsets = edge ? [-0.27, -0.12, 0.12, 0.27] : [-0.15, 0.15];
        for (const dx of offsets) {
          if (x + dx < x0 || x + dx > x0 + width) continue;
          out.blocks.push({ centre: [x + dx, y, z0 + f.profileM.height + f.blockM.height / 2], size: [f.blockM.width, f.blockM.length, f.blockM.height], turnY: 0 });
        }
      }
    }
  }
  return out;
}

/**
 * The same field on the frame fixed to the slab: rails east-west under each row, anchored along their
 * length, a front leg at each low edge and a rear leg under each ridge.
 */
export function anchoredField(pairs: number, rows: number, x0: number, y0: number, z0: number): ArrayParts {
  const f = ANCHORED_EW, rise = MODULE.widthM * Math.sin(f.tiltDeg * DEG);
  const out: ArrayParts = { modules: [], profiles: [], posts: [], plates: [], blocks: [] };
  const pitch = PAIR_WIDTH_M.anchored, width = pairs * pitch, rowLength = ROW_LENGTH_M.anchored;
  const ridgeTop = f.lowEdgeM + rise;
  for (let r = 0; r < rows; r++) {
    const ySouth = y0 + r * rowLength + f.rowGapM / 2, yMid = ySouth + MODULE.lengthM / 2;
    const rails = f.rails.map((share) => ySouth + share * MODULE.lengthM);
    for (const y of rails) {
      out.profiles.push({ centre: [x0 + width / 2, y, z0 + f.railM.height / 2], size: [width, f.railM.width, f.railM.height], turnY: 0 });
      // the anchors' interfaces along the rail, the ends no further out than they are apart
      const n = Math.max(2, Math.ceil(width / f.anchorSpacingM) + 1);
      for (let k = 0; k < n; k++) {
        const x = x0 + 0.1 + (k * (width - 0.2)) / (n - 1);
        out.plates.push({ centre: [x, y, z0 + f.interfaceM.height / 2], size: [f.interfaceM.length, f.interfaceM.width + 0.02, f.interfaceM.height], turnY: 0 });
      }
    }
    for (let p = 0; p < pairs; p++) {
      const ridge = x0 + (p + 0.5) * pitch;
      pairModules(out.modules, ridge, f.ridgeGapM, f.lowEdgeM, yMid, z0);
      const run = MODULE.widthM * Math.cos(f.tiltDeg * DEG);
      for (const y of rails) {
        const h0 = f.railM.height;
        out.posts.push({ centre: [ridge, y, z0 + h0 + (ridgeTop - h0) / 2], size: [f.legM * 1.5, f.legM, ridgeTop - h0], turnY: 0 });
        for (const side of [-1, 1]) {
          const x = ridge + side * (f.ridgeGapM / 2 + run - 0.03);
          out.posts.push({ centre: [x, y, z0 + h0 + (f.lowEdgeM - h0) / 2], size: [f.legM, f.legM, f.lowEdgeM - h0], turnY: 0 });
        }
      }
    }
  }
  return out;
}
