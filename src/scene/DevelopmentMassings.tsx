/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE 49 APPROVED PROJECTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Draws the proposals standing in the city, and makes them clickable.
 *
 * WHAT IT DOES
 *   - Builds each proposal's shape once and keeps it.
 *   - Colours each by what can be done with it (see below).
 *   - Outlines the one being read about (SelectionEdges).
 *   - Opens a proposal on a DOUBLE click at a desk, and on a single pull of
 *     the trigger in a headset (see WHY A DOUBLE CLICK below).
 *   - Tells a click apart from the end of a camera drag (tap.ts).
 *   - Frees the old shapes on the GPU when the set is replaced.
 *
 * WHY A DOUBLE CLICK
 *   A single click on the city is mostly the end of something else — a
 *   pan, a tap to look closer — and opening a project on it took the
 *   reader somewhere they had not asked to go. A double click is a request.
 *   In a headset it stays a single pull: aiming a laser twice at the same
 *   tower is far harder than clicking twice, and the panel is how most
 *   places are chosen there anyway.
 *
 * WHY EACH ONE IS A SEPARATE OBJECT
 *   The 1,548 existing buildings are welded into one object because nobody
 *   ever needs to click one. A proposal is different: it has to be
 *   selectable and it has to be able to change colour on its own, and
 *   neither is possible once geometry has been merged. Forty-nine objects
 *   is a cost worth paying; four and a half thousand would not be.
 *
 * WHY THE GEOMETRY IS BUILT WITHOUT KNOWING WHICH IS SELECTED
 *   Selection only changes a material. Rebuilding the shapes when it
 *   changes meant re-extruding and re-welding all 49 on every click, which
 *   was a visible pause. The shapes are built once; the colour is decided
 *   at draw time.
 *
 * COLOUR SAYS WHAT CAN BE DONE, AND HOW FAR ALONG IT IS
 *
 *   The family is the stage: teal for approved, orange for under
 *   construction (palette.ts, where the lightness of each is worked out).
 *   Within it, the shade is the state:
 *
 *   selected     the lightest shade and a dark outline — this is the one
 *                being read about
 *   clickable    the full colour — plainly not an existing building, and
 *                plainly something to press
 *   not clickable  pale — in focus mode nothing responds, so nothing
 *                  should look like it will
 *
 *   Colour that invites a click the click will not answer is worse than no
 *   invitation at all.
 *
 * WHY ONLY ONE APPEARS ON THE SUNLIGHT SCREEN
 *   Forty-nine towers casting at once buries the single shadow that screen
 *   exists to explain.
 */

import { useEffect, useMemo, useRef } from 'react';
import type { BufferGeometry } from 'three';
import type { Development } from '../data/model';
import { mergeMassings } from './massing';
import { SelectionEdges } from './SelectionEdges';
import { toneOf } from './palette';
import { useInVr } from './xrStore';
import { beginTap, trackTap, wasDragged, type Gesture } from './tap';

interface DevelopmentMassingsProps {
  developments: Development[];
  /** The proposal being read about, drawn selected; null for none. */
  focus: Development | null;
  groundAhdM: number;
  /** When false, only the focused proposal is drawn. */
  showAll: boolean;
  /** False in focus mode: the view becomes something to look at, not operate. */
  interactive: boolean;
  onSelect: (development: Development) => void;
}

/** The approved projects as separate, clickable, state-coloured meshes. */
export function DevelopmentMassings({
  developments,
  focus,
  groundAhdM,
  showAll,
  interactive,
  onSelect,
}: DevelopmentMassingsProps) {
  /*
   * Geometry is built for every development once and kept. `focus` is
   * deliberately NOT a dependency: it only decides which material is used, and
   * including it re-extruded and re-merged all 49 massings on every selection,
   * which is a visible stall on a click.
   */
  const built = useMemo(
    () =>
      developments
        .map((development) => ({
          development,
          geometry: mergeMassings(development.parts, groundAhdM),
        }))
        .filter((entry): entry is { development: Development; geometry: BufferGeometry } =>
          Boolean(entry.geometry),
        ),
    [developments, groundAhdM],
  );

  // Free the buffers when the set is replaced — a live-API refresh rebuilds
  // every development, and the old ones would otherwise stay on the GPU.
  useEffect(() => {
    return () => {
      for (const entry of built) entry.geometry.dispose();
    };
  }, [built]);

  const meshes = showAll ? built : built.filter((entry) => entry.development === focus);

  /*
   * Where the button went down. The left button pans the camera as well as
   * selecting, so a release has to be told apart from the end of a drag —
   * see tap.ts. One ref for all the massings: only one of them can be under
   * the pointer at a time.
   */
  const pressedAt = useRef<Gesture | null>(null);
  /** Whether the latest click was a clean one, for the double click after it. */
  const lastClickClean = useRef(false);
  const inVr = useInVr();

  // A pointer cursor left behind when this unmounts under the pointer.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <group>
      {meshes.map(({ development, geometry }) => {
        const focused = development === focus;
        /*
         * Colour states what can be done, not just what is what.
         *
         * An unfocused proposal is only worth noticing while it can be
         * clicked, so it carries the strong green then and drops back to
         * scenery when it cannot — in focus mode, where the interface is
         * gone and nothing responds. See COLOUR SAYS WHAT CAN BE DONE above.
         */
        const invites = !focused && interactive;
        const tone = toneOf(development.status);
        return (
          <mesh
            key={development.devId}
            geometry={geometry}
            castShadow
            receiveShadow
            onPointerDown={
              interactive
                ? (event) => {
                    pressedAt.current = beginTap(event.nativeEvent);
                  }
                : undefined
            }
            onPointerMove={
              interactive
                ? (event) => trackTap(pressedAt.current, event.nativeEvent)
                : undefined
            }
            onClick={
              interactive
                ? (event) => {
                    // Kept from the ground beneath even when it opens nothing.
                    event.stopPropagation();
                    /*
                     * Not if the camera was being moved. A drag that happens
                     * to finish over a tower is not a request to open it —
                     * see tap.ts, and Ground, which had the same fault.
                     */
                    const from = pressedAt.current;
                    pressedAt.current = null;
                    lastClickClean.current = !wasDragged(from, event.nativeEvent);
                    // In a headset one pull opens it; at a desk, see onDoubleClick.
                    if (inVr && lastClickClean.current) onSelect(development);
                  }
                : undefined
            }
            onDoubleClick={
              interactive && !inVr
                ? (event) => {
                    event.stopPropagation();
                    // The second click must be a click too, not a drag's end.
                    if (lastClickClean.current) onSelect(development);
                  }
                : undefined
            }
            onPointerOver={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    document.body.style.cursor = 'pointer';
                  }
                : undefined
            }
            onPointerOut={interactive ? () => { document.body.style.cursor = ''; } : undefined}
          >
            {/*
              The focused proposal carries the lightest shade; the rest are stated
              quietly enough that the eye still goes to the one being read
              about, but plainly enough to be seen and clicked.
            */}
            <meshStandardMaterial
              color={focused ? tone.selected : invites ? tone.base : tone.quiet}
              roughness={focused ? 0.4 : 0.55}
              metalness={0}
              emissive={tone.glow}
              emissiveIntensity={focused ? 0.3 : invites ? tone.glowStrength : 0.05}
              transparent
              opacity={focused ? 0.95 : invites ? 0.9 : 0.78}
            />
            {/* The one being read about is outlined too — see SelectionEdges. */}
            {focused && <SelectionEdges parts={development.parts} floorAhdM={groundAhdM} />}
          </mesh>
        );
      })}
    </group>
  );
}
