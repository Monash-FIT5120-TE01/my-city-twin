/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE NAMES OF THE PLACES, OVER THE BUILDINGS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   A tag over each landmark — Town Hall, St Pauls Cathedral, the market —
 *   so that a reader looking at the city from above, or standing in its
 *   street, can tell which building is which. The street names say where
 *   you are; these say what you are looking at.
 *
 * WHAT IT SHOWS, AND WHEN
 *   From above, pulled right back, nothing: fifty-one names over a
 *   two-kilometre grid is a thicket, and fifty-one white dots without names
 *   were worse — specks over the whole city that said nothing (2026-10-13).
 *   Closer in, the ones near the point the camera is orbiting get a card
 *   with their name, and the dot under it marks the roof. Pressing a card on a building opens that building's
 *   page, the one a search opens; pressing one on open ground (a square, a
 *   park) opens the card out to show its address, since there is no page.
 *
 *   In the street there is no orbit target, so the rule is the walker's
 *   own: the few landmarks ahead and within a few hundred metres, each with
 *   how far away it is. Behind and far off are left out — what is wanted
 *   is "that is St Paul's, 320 m", not an inventory.
 *
 * HOW IT IS DRAWN
 *   DOM through drei's <Html>, like the street names and the site marker,
 *   and for the same reason: the type is the interface's own and there is
 *   no font file to load. Unlike the street names these do not lie on the
 *   ground — they face the screen at a steady size, as a label does.
 *
 *   Outside <WorldFrame>, like every other <Html> in the scene: see
 *   StreetLabels for why the frame's rotation and CSS 3D do not mix. The
 *   one enuToWorld call below is the price.
 *
 *   No occlusion, the same trade StreetLabels makes and explains. In the
 *   street it is even a feature: a landmark behind the building beside you
 *   is still the way to it.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import { enuToWorld, worldToEnu } from './frame';
import type { Landmark } from '../data/landmarks';
import '../styles/landmark-tags.css';
import { groundAt, type Ground } from './terrain';

/** Above the roof, so the dot reads as sitting on the building and not in it. */
const ROOF_LIFT_M = 6;
/** A landmark on open ground: eye height and a bit, so the tag is not in the paving. */
const GROUND_LIFT_M = 10;

/*
 * ── FROM ABOVE ────────────────────────────────────────────────────────────
 *
 * Names appear once the camera is within this of the point it orbits. At
 * 1,200 m the view spans roughly one city block each way at the design's
 * 30° lens, and that is where names stop overlapping.
 */
const NAMES_WITHIN_M = 1200;
/**
 * And then only for landmarks within this of the orbit target, scaled with
 * how far back the camera is: the same question StreetLabels asks — which
 * of these can I actually see — with its answer tied to zoom.
 */
const NAME_RADIUS_PER_DISTANCE = 0.4;
const NAME_RADIUS_MIN_M = 260;
/**
 * Two landmarks closer than this share a building (the Athenaeum's theatre
 * and library are 3 m apart; Federation Square holds four), and two cards on
 * one roof paint over each other. The nearer the view's centre is named,
 * the other keeps its dot — and gets its name once the view settles on it.
 */
const MIN_SEPARATION_M = 25;

/*
 * ── IN THE STREET ─────────────────────────────────────────────────────────
 *
 * How far ahead a landmark may be and still be named, how far off the line
 * of sight (either side), and at most how many. The limits were set in the
 * plan of 2026-10-12 as working values.
 */
const WALK_WITHIN_M = 400;
const WALK_AHEAD_COS = Math.cos((70 * Math.PI) / 180);
const WALK_MAX_NAMES = 6;

/** The view has to move this much before the set of names is reconsidered. */
const RESEAT_DISTANCE_M = 5;
const RESEAT_TURN_COS = Math.cos((5 * Math.PI) / 180);
const RESEAT_ZOOM_RATIO = 1.15;

interface LandmarkTagsProps {
  landmarks: readonly Landmark[];
  /** Ground elevation, metres AHD, for the ones on open ground. */
  /** The ground (terrain.ts), or one flat height. */
  groundAhdM: Ground;
  /** Standing in the street rather than orbiting above it. */
  walking: boolean;
  /** The landmark whose address is open, by name. */
  open: string | null;
  onOpen: (name: string | null) => void;
  /** A tag on a building was pressed: that building's page. */
  onPickBuilding: (buildingId: string) => void;
  /**
   * False where nothing may be opened — the comparison screen. The tags are
   * still read there; pressing one would leave the page.
   */
  interactive?: boolean;
}

/** What is named right now: each landmark's label, or nothing for a dot alone. */
type Named = Map<string, string | null>;

const scratch = new Vector3();

export function LandmarkTags({
  landmarks,
  groundAhdM,
  walking,
  open,
  onOpen,
  onPickBuilding,
  interactive = true,
}: LandmarkTagsProps) {
  const controls = useThree((state) => state.controls) as { target?: Vector3 } | null;
  const camera = useThree((state) => state.camera);

  const [named, setNamed] = useState<Named>(() => new Map());
  // Where the view was when the names were last decided.
  const seated = useRef<{ east: number; north: number; fe: number; fn: number; distance: number } | null>(null);

  /*
   * The names depend on the list and on the mode as much as on the camera:
   * the live API can replace the snapshot's list under a camera that has
   * not moved, and coming back up from the street with the orbit target
   * where the walker stood would otherwise keep the street's "200 m" cards
   * on the map. Forgetting the seat makes the next frame decide afresh.
   */
  useEffect(() => {
    seated.current = null;
  }, [landmarks, walking]);

  useFrame(() => {
    let east: number;
    let north: number;
    let fe = 0;
    let fn = 0;
    let distance = 0;

    if (walking) {
      const [e, n] = worldToEnu([camera.position.x, camera.position.y, camera.position.z]);
      east = e;
      north = n;
      camera.getWorldDirection(scratch);
      const [de, dn] = worldToEnu([scratch.x, scratch.y, scratch.z]);
      const len = Math.hypot(de, dn) || 1;
      fe = de / len;
      fn = dn / len;
    } else {
      const target = controls?.target;
      if (!target) return;
      east = target.x;
      north = -target.z;
      distance = camera.position.distanceTo(target);
    }

    const previous = seated.current;
    if (previous) {
      const moved = Math.hypot(east - previous.east, north - previous.north);
      const turned = fe * previous.fe + fn * previous.fn;
      const zoomed =
        previous.distance > 0 && distance > 0
          ? Math.max(distance / previous.distance, previous.distance / distance)
          : 1;
      if (moved < RESEAT_DISTANCE_M && zoomed < RESEAT_ZOOM_RATIO && (!walking || turned > RESEAT_TURN_COS)) {
        return;
      }
    }
    seated.current = { east, north, fe, fn, distance };

    setNamed(walking ? namesInStreet(landmarks, east, north, fe, fn) : namesFromAbove(landmarks, east, north, distance));
  });

  return (
    <group>
      {landmarks.map((landmark) => {
        const label = named.get(landmark.name);
        const opened = open === landmark.name;
        // Only the named are drawn. From above, a card opened from the search
        // stays until it is closed; in the street even that one goes once it
        // is behind the walker or too far, as a floating card would.
        if (label === undefined && (walking || !opened)) return null;
        const up = landmark.topAhdM !== null ? landmark.topAhdM + ROOF_LIFT_M : groundAt(groundAhdM, landmark.en[0], landmark.en[1]) + GROUND_LIFT_M;

        const press = () => {
          if (landmark.buildingId) onPickBuilding(landmark.buildingId);
          else onOpen(opened ? null : landmark.name);
        };

        return (
          <Html
            key={landmark.name}
            position={enuToWorld([landmark.en[0], landmark.en[1], up])}
            center
            // An opened card over the others; the rest under the header (6) and the panels.
            zIndexRange={opened ? [2, 2] : [1, 0]}
          >
            <div className={`landmark${interactive ? '' : ' landmark--still'}`}>
              {/* The roof it stands on. Part of the card, not a control of its own. */}
              <span className="landmark__dot" aria-hidden="true" />
              <button
                type="button"
                className={`landmark__tag${opened ? ' landmark__tag--open' : ''}`}
                aria-expanded={landmark.buildingId ? undefined : opened}
                tabIndex={interactive ? undefined : -1}
                onClick={interactive ? press : undefined}
              >
                {landmark.name}
                {opened ? (
                  <span className="landmark__meta">{landmark.address}</span>
                ) : label ? (
                  <span className="landmark__meta">{label}</span>
                ) : null}
              </button>
            </div>
          </Html>
        );
      })}
    </group>
  );
}

/** From above: names for the landmarks near the orbit target, once close enough in. */
function namesFromAbove(landmarks: readonly Landmark[], east: number, north: number, distance: number): Named {
  const named: Named = new Map();
  if (distance >= NAMES_WITHIN_M) return named;
  const radius = Math.max(NAME_RADIUS_MIN_M, distance * NAME_RADIUS_PER_DISTANCE);
  const near = landmarks
    .map((landmark) => ({ landmark, distanceM: Math.hypot(landmark.en[0] - east, landmark.en[1] - north) }))
    .filter((entry) => entry.distanceM <= radius)
    // Nearest first; by name under a tie, so the same one wins every time.
    .sort((a, b) => a.distanceM - b.distanceM || a.landmark.name.localeCompare(b.landmark.name));
  for (const { landmark } of spaced(near.map((entry) => entry.landmark))) named.set(landmark.name, null);
  return named;
}

/** Drops any landmark within MIN_SEPARATION_M of one already kept. Nearest first in, so the nearer wins. */
function spaced(ordered: readonly Landmark[]): { landmark: Landmark }[] {
  const kept: Landmark[] = [];
  for (const landmark of ordered) {
    const crowded = kept.some(
      (other) => Math.hypot(other.en[0] - landmark.en[0], other.en[1] - landmark.en[1]) < MIN_SEPARATION_M,
    );
    if (!crowded) kept.push(landmark);
  }
  return kept.map((landmark) => ({ landmark }));
}

/** In the street: the nearest few ahead, each with its distance. */
function namesInStreet(landmarks: readonly Landmark[], east: number, north: number, fe: number, fn: number): Named {
  const ahead: { name: string; distanceM: number }[] = [];
  for (const landmark of landmarks) {
    const de = landmark.en[0] - east;
    const dn = landmark.en[1] - north;
    const distanceM = Math.hypot(de, dn);
    if (distanceM === 0 || distanceM > WALK_WITHIN_M) continue;
    if ((de * fe + dn * fn) / distanceM < WALK_AHEAD_COS) continue;
    ahead.push({ name: landmark.name, distanceM });
  }
  ahead.sort((a, b) => a.distanceM - b.distanceM);
  const byName = new Map(landmarks.map((landmark) => [landmark.name, landmark]));
  const distances = new Map(ahead.map((entry) => [entry.name, entry.distanceM]));
  const named: Named = new Map();
  for (const { landmark } of spaced(ahead.map((entry) => byName.get(entry.name)!)).slice(0, WALK_MAX_NAMES)) {
    // To the nearest ten metres: a figure finer than that claims a precision
    // the rounded source points do not have.
    const distanceM = distances.get(landmark.name) ?? 0;
    named.set(landmark.name, `${Math.max(10, Math.round(distanceM / 10) * 10)} m`);
  }
  return named;
}
