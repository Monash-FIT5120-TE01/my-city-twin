/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE MENU INSIDE THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT IS
 *   The 2D sheet, rebuilt as one object in the room. An immersive session
 *   draws no DOM at all, so nothing on the page — search, panels, the time
 *   bar, the map credit — exists once the headset is on. This does their jobs
 *   in there: choose a place, set the season and the hour, measure a spot, go
 *   down to the street and back, and see where you are.
 *
 *   It holds no state of the product's. Every button calls a setter App
 *   passes in (see vrMenu.ts), so what the menu says and what the page would
 *   say are the same state read twice.
 *
 * ONE MENU OF THREE CARDS
 *   Three cards side by side, flat, moved and closed as one:
 *
 *     left     what the tab is about — the buildings near a spot, a search,
 *              the place chosen, or More
 *     middle   City map — press it to drop a spot; the building chosen is
 *              filled and pinned; or Help, under More
 *     right    Sun & time — always there, whatever the others show
 *
 *   Under them the navigation (Map, Search, Place, More) and Close; under that
 *   one white bar that carries the whole menu (vrRig.ts). Close does what X on
 *   the left controller does.
 *
 * FROM THE MAP TO A PLACE (2026-10-19, ProjectDoc/vr-ui-redesign/nav-search.html)
 *   The tabs are what the reader is doing, not the product's features: find a
 *   place on the map or by its address, then do things with it. Press the map:
 *   a spot, and the buildings within 150 m of it on the left (projects and
 *   buildings standing today); "Stand here" at the foot of the map goes down
 *   to that spot. Choose a building: it is filled on the map, and "Details"
 *   opens Place — measuring the sun, the flat, the project on or off, standing
 *   in front of it. Measure and Flat used to be tabs of their own that did
 *   nothing until a building had been chosen somewhere else.
 *
 * THE LIST SCROLLS — WITHOUT CHOOSING WHAT IT LANDS ON
 *   It scrolled once before, by dragging with the beam, and letting go of a
 *   drag over the row it began on chose that row. So a row remembers how far
 *   the list had scrolled when it was pressed, and a press that ends with the
 *   list somewhere else is a scroll, not a choice. The right stick up and
 *   down scrolls too.
 *
 * MEASURING
 *   "Measure the sun" in Place arms the ground straight away — the card says
 *   what to do and shows the answer when there is one. Leaving it disarms it.
 *
 * LEAVING
 *   Always asked. "Leave VR" (under More) and the grip held for a second both
 *   bring up the same question over the menu; only its own button ends the
 *   session.
 *
 * TEXT
 *   The bundled font carries plain ASCII and little else — every string goes
 *   through `plain`. Icons are drawn into textures, never with the SVG
 *   component (vrIcons.ts).
 *
 * WHY THIS FILE IS LOADED LATE
 *   It brings a layout engine and a font atlas — several hundred kilobytes —
 *   that nobody on a desktop will ever use. SceneCanvas imports it lazily,
 *   only once a session has started.
 */

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR, useXRInputSourceState } from '@react-three/xr';
import { Container, Text, type VanillaContainer } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { Euler, Matrix4, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Group, type Texture } from 'three';
import type { VrFlat, VrHit, VrMenu, VrSelected, VrStage } from './vrMenu';
import { PANEL_RENDER_ORDER } from './vrPointer';
import { usePanelRig } from './vrRig';
import { TUTORIAL, tutorialImage } from './vrTutorial';
import { TimeCard } from './VrTimePanel';
import { MapCard, MiniMap, SPOT_REACH_M, type CityForMap, type MapSubject } from './VrMapPanel';
import { Button, Card, Glass, Grabber, Icon, KeyChip, Label, Segmented } from './vrKit';
import { AMBER, AMBER_INK, CONTROL_ORDER, EDGE, GLASS_EDGE, GREEN, GREEN_PRESSED, GREEN_SOFT, INK, INK_2, PAPER, PIXEL_M, PRESSED, SUNKEN, TRACK, plain } from './vrTokens';
import type { IconName } from './vrIcons';

/** The cards: the same height, so they line up; the map wider than the two either side. */
const CARD_HEIGHT = 660;
const SIDE_WIDTH = 340;
const MAP_WIDTH = 560;
const CARD_GAP = 14;
const ROW_WIDTH = SIDE_WIDTH * 2 + MAP_WIDTH + CARD_GAP * 2;

/**
 * How far in front of the eyes the menu stands, metres. Further than a single
 * panel would (0.85 m): the menu is 1.27 m across, and at this distance its
 * edges are about 32 degrees either side — a turn of the eyes, not the head.
 */
const MENU_DISTANCE_M = 1.0;

/** The right stick scrolls a list this fast at full push, mm per second. */
const STICK_SCROLL_MM_S = 700;
const STICK_DEAD_ZONE = 0.25;
/** A press that ends with the list moved further than this is a scroll, mm. */
const SCROLLED_MM = 6;

/** The layers that must win the laser over everything else on the menu. */
const DIALOG_ORDER = CONTROL_ORDER + 2;

// ── A list that scrolls ────────────────────────────────────────────────────

type Scrollable = { scrollPosition: { value: [number, number] | undefined }; maxScrollPosition: { value: [number | undefined, number | undefined] } };

function scrollYOf(list: VanillaContainer | null): number {
  const position = (list as unknown as Scrollable | null)?.scrollPosition?.value;
  return position?.[1] ?? 0;
}

/** Moves a scrolling container by `dy` millimetres, kept inside what it can scroll. */
function scrollListBy(list: VanillaContainer | null, dy: number) {
  const box = list as unknown as Scrollable | null;
  if (!box?.scrollPosition) return;
  const [x, at] = box.scrollPosition.value ?? [0, 0];
  const max = box.maxScrollPosition.value?.[1] ?? 0;
  const next = Math.min(max, Math.max(0, at + dy));
  if (next !== at) box.scrollPosition.value = [x ?? 0, next];
}

/** The right stick, up and down, scrolls the list while it is on show. */
function useStickScroll(list: { current: VanillaContainer | null }, active: boolean) {
  const right = useXRInputSourceState('controller', 'right');
  useFrame((_, delta) => {
    if (!active) return;
    const y = right?.gamepad?.['xr-standard-thumbstick']?.yAxis ?? 0;
    if (Math.abs(y) < STICK_DEAD_ZONE) return;
    // Down on the stick (positive y on the standard mapping) moves down the list.
    const beyond = (Math.abs(y) - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE);
    scrollListBy(list.current, Math.sign(y) * beyond * STICK_SCROLL_MM_S * Math.min(delta, 0.1));
  });
}

function ScrollList({ listRef, children }: { listRef: { current: VanillaContainer | null }; children: ReactNode }) {
  return (
    <Container
      ref={listRef}
      // Whatever height is left, and no more: the parts above keep theirs.
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      minHeight={0}
      overflow="scroll"
      flexDirection="column"
      gap={10}
      paddingRight={16}
      scrollbarWidth={8}
      scrollbarColor={EDGE}
      pointerEventsOrder={CONTROL_ORDER}
    >
      {children}
    </Container>
  );
}

// ── Common parts of a card ─────────────────────────────────────────────────

function Title({ children }: { children: string }) {
  return (
    <Text fontSize={30} fontWeight="bold" color={INK} lineHeight="120%" wordBreak="break-word">
      {plain(children)}
    </Text>
  );
}

function Subtitle({ children }: { children: string }) {
  return (
    <Label size={19} color={INK_2}>
      {children}
    </Label>
  );
}

function StandButton({ menu, atSpot = false }: { menu: VrMenu; atSpot?: boolean }) {
  if (menu.stage === 'room' && menu.flat) return <Button label="Leave the flat" icon="exit" onClick={menu.flat.onLeave} />;
  return menu.stage === 'above' ? (
    <Button label={atSpot ? 'Stand at the spot' : 'Stand in the street'} icon="down" onClick={menu.onStand} />
  ) : (
    <Button label="Go back up" icon="up" onClick={menu.onRise} />
  );
}

// ── Near a spot (left, under Map) ──────────────────────────────────────────

type Kind = 'All' | 'Planned' | 'Existing';

/** One building in a list: a project or one standing today, near a spot or found by search. */
interface ListedBuilding {
  kind: 'development' | 'building';
  key: string;
  label: string;
  heightM: number;
  en: [number, number];
}

/** What stands within SPOT_REACH_M of a spot, nearest first: the projects, and the buildings with an address. */
function buildingsNear(city: CityForMap | null, spot: [number, number]): (ListedBuilding & { distanceM: number })[] {
  if (!city) return [];
  const away = (en: [number, number]) => Math.hypot(en[0] - spot[0], en[1] - spot[1]);
  const listed: (ListedBuilding & { distanceM: number })[] = [];
  for (const development of city.developments) {
    const distanceM = away(development.anchorEN);
    if (distanceM <= SPOT_REACH_M) listed.push({ kind: 'development', key: development.devKey, label: development.streetAddress, heightM: development.maxHeightM, en: development.anchorEN, distanceM });
  }
  for (const building of city.searchable) {
    const distanceM = away(building.anchorEN);
    if (distanceM <= SPOT_REACH_M) listed.push({ kind: 'building', key: building.buildingId, label: building.streetAddress, heightM: building.heightM, en: building.anchorEN, distanceM });
  }
  return listed.sort((a, b) => a.distanceM - b.distanceM);
}

/** "9-29 Swanston Street", without the suburb, state and postcode the register adds. */
function streetLine(address: string): string {
  return address.replace(/,?\s*(MELBOURNE|VIC|VICTORIA|3000|3008|AUSTRALIA)\b/gi, '').replace(/[,\s]+$/, '').trim();
}

function BuildingRow({
  item,
  meta,
  chosen,
  list,
  onChoose,
}: {
  item: ListedBuilding;
  meta: string;
  chosen: boolean;
  list: { current: VanillaContainer | null };
  onChoose: () => void;
}) {
  const pressedAt = useRef<number | null>(null);
  const planned = item.kind === 'development';
  return (
    <Container
      onPointerDown={() => {
        pressedAt.current = scrollYOf(list.current);
      }}
      onClick={(event) => {
        event.stopPropagation();
        // A press that dragged the list is a scroll, not a choice.
        const from = pressedAt.current;
        pressedAt.current = null;
        if (from !== null && Math.abs(scrollYOf(list.current) - from) > SCROLLED_MM) return;
        onChoose();
      }}
      cursor="pointer"
      pointerEventsOrder={CONTROL_ORDER}
      flexDirection="row"
      alignItems="center"
      gap={12}
      minHeight={74}
      flexShrink={0}
      paddingX={12}
      paddingY={10}
      borderRadius={22}
      borderWidth={3}
      // The one chosen: a dark green edge and a tick — not the fill's tint alone.
      borderColor={chosen ? GREEN : SUNKEN}
      backgroundColor={chosen ? GREEN_SOFT : SUNKEN}
      hover={{ borderColor: INK, backgroundColor: chosen ? GREEN_SOFT : PAPER }}
      active={{ backgroundColor: PRESSED }}
    >
      {/* Two blocks: a building. Green for a project, grey for one standing — and "Planned" in words as well. */}
      <Container width={46} height={46} borderRadius={14} backgroundColor={PAPER} flexDirection="row" alignItems="flex-end" justifyContent="center" gap={3} paddingBottom={11} flexShrink={0}>
        <Container width={9} height={16} borderRadius={2} backgroundColor={planned ? GREEN : EDGE} />
        <Container width={11} height={24} borderRadius={2} backgroundColor={planned ? GREEN : EDGE} />
      </Container>
      <Container flexDirection="column" gap={3} flexGrow={1} flexShrink={1}>
        <Label size={18} weight="bold">
          {item.label}
        </Label>
        <Label size={18} color={INK_2}>
          {meta}
        </Label>
        {planned && (
          <Container alignSelf="flex-start" paddingX={8} borderRadius={10} borderWidth={2} borderColor={GREEN}>
            <Text fontSize={18} fontWeight="bold" color={GREEN}>
              Planned
            </Text>
          </Container>
        )}
      </Container>
    </Container>
  );
}

function NearSpotCard({
  menu,
  city,
  spot,
  kind,
  onKind,
  listRef,
  onSearch,
}: {
  menu: VrMenu;
  city: CityForMap | null;
  spot: [number, number] | null;
  kind: Kind;
  onKind: (kind: Kind) => void;
  listRef: { current: VanillaContainer | null };
  onSearch: () => void;
}) {
  if (!spot) {
    return (
      <>
        <Title>Map</Title>
        <Subtitle>Explore Melbourne</Subtitle>
        <Card tone="amber" gap={8}>
          <Label size={20} weight="bold">
            Point at the city map and pull the trigger.
          </Label>
          <Label size={20} color={INK_2}>
            The buildings around that spot are listed here.
          </Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Search an address" tone="outline" icon="search" onClick={onSearch} />
      </>
    );
  }
  const near = buildingsNear(city, spot).filter((item) => kind === 'All' || (kind === 'Planned') === (item.kind === 'development'));
  return (
    <>
      <Title>Near this spot</Title>
      <Subtitle>{`${near.length} within ${SPOT_REACH_M} m`}</Subtitle>
      <Segmented<Kind>
        fixed
        options={[
          { value: 'All', label: 'All' },
          { value: 'Planned', label: 'Planned' },
          { value: 'Existing', label: 'Existing' },
        ]}
        value={kind}
        onChange={onKind}
      />
      <ScrollList listRef={listRef}>
        {near.length === 0 ? (
          <Label size={20} color={INK_2}>
            None here. Try another spot.
          </Label>
        ) : (
          near.map((item) => (
            <BuildingRow
              key={`${item.kind}:${item.key}`}
              item={{ ...item, label: streetLine(item.label) }}
              meta={`${item.distanceM < 10 ? 'Here' : `${Math.round(item.distanceM / 10) * 10} m`} | ${item.heightM.toFixed(0)} m tall`}
              chosen={menu.selected?.key === item.key && menu.selected.kind === item.kind}
              list={listRef}
              onChoose={() => menu.onPick({ kind: item.kind, key: item.key })}
            />
          ))
        )}
      </ScrollList>
    </>
  );
}

// ── Search (left) ──────────────────────────────────────────────────────────

/*
 * Typing in a headset: the headset's own keyboard, not one of ours (user decision, 2026-10-19). A text
 * field of the page — hidden, but in the document — is focused when the field on the card is pressed, and
 * the browser shows its system keyboard over the session; what is typed arrives as the field's value
 * (developers.meta.com, "System Keyboard in WebXR"). A browser that says it has none
 * (isSystemKeyboardSupported false) is told so on the card. On a desktop, the computer's keyboard types.
 */
function useSystemKeyboard(onText: (text: string) => void) {
  const field = useRef<HTMLInputElement | null>(null);
  const latest = useRef(onText);
  useEffect(() => {
    latest.current = onText;
  });
  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Search an address in the headset');
    // in the document, so it can be focused, but nowhere anyone can see it
    input.style.cssText = 'position:fixed;left:-1000px;top:0;width:1px;height:1px;opacity:0;';
    input.addEventListener('input', () => latest.current(input.value));
    document.body.append(input);
    field.current = input;
    return () => input.remove();
  }, []);
  return {
    open: (text: string) => {
      const input = field.current;
      if (!input) return;
      input.value = text;
      input.focus();
    },
    clear: () => {
      if (field.current) field.current.value = '';
      latest.current('');
    },
  };
}

function SearchCard({
  menu,
  query,
  onQuery,
  listRef,
  onHit,
}: {
  menu: VrMenu;
  query: string;
  onQuery: (query: string) => void;
  listRef: { current: VanillaContainer | null };
  onHit: (hit: VrHit) => void;
}) {
  const keyboard = useSystemKeyboard(onQuery);
  const session = useXR((state) => state.session) as (XRSession & { isSystemKeyboardSupported?: boolean }) | undefined;
  const noKeyboard = session?.isSystemKeyboardSupported === false;
  const hits = menu.search(query).slice(0, 8);
  return (
    <>
      <Title>Search</Title>
      <Subtitle>An address or a street</Subtitle>
      <Container
        onClick={(event) => {
          event.stopPropagation();
          keyboard.open(query);
        }}
        cursor="text"
        pointerEventsOrder={CONTROL_ORDER}
        height={64}
        flexShrink={0}
        flexDirection="row"
        alignItems="center"
        gap={10}
        paddingX={18}
        borderRadius={32}
        borderWidth={3}
        borderColor={INK}
        backgroundColor={PAPER}
        hover={{ backgroundColor: SUNKEN }}
      >
        <Icon name="search" color={INK_2} size={24} />
        <Container flexGrow={1} flexShrink={1}>
          <Label size={20} color={query ? INK : INK_2}>
            {query || 'Point here to type'}
          </Label>
        </Container>
        {query && <Button label="" icon="close" tone="quiet" height={44} onClick={keyboard.clear} />}
      </Container>
      {noKeyboard ? (
        <Card tone="amber">
          <Label size={20}>This headset cannot show its keyboard here. Use the map instead.</Label>
        </Card>
      ) : query.trim().length < 2 ? (
        <Label size={20} color={INK_2}>
          The headset keyboard opens. Matches show as you type.
        </Label>
      ) : (
        <ScrollList listRef={listRef}>
          {hits.length === 0 ? (
            <Label size={20} color={INK_2}>
              No address matches. Try fewer letters.
            </Label>
          ) : (
            hits.map((hit) => (
              <BuildingRow
                key={`${hit.kind}:${hit.key}`}
                item={{ kind: hit.kind === 'development' ? 'development' : 'building', key: hit.key, label: hit.label, heightM: 0, en: hit.en }}
                meta={hit.detail.replace(/ · /g, ' | ')}
                chosen={hit.kind !== 'landmark' && menu.selected?.key === hit.key}
                list={listRef}
                onChoose={() => onHit(hit)}
              />
            ))
          )}
        </ScrollList>
      )}
    </>
  );
}

// ── Place (left) ───────────────────────────────────────────────────────────

/** What can be done with the building chosen, or with a spot. The way to Measure and to the flat. */
function PlaceCard({
  menu,
  selected,
  spot,
  onMeasure,
  onFlat,
  onMap,
  onSearch,
}: {
  menu: VrMenu;
  selected: VrSelected | null;
  spot: [number, number] | null;
  onMeasure: () => void;
  onFlat: () => void;
  onMap: () => void;
  onSearch: () => void;
}) {
  if (!selected && !spot) {
    return (
      <>
        <Title>Place</Title>
        <Subtitle>Nothing chosen yet</Subtitle>
        <Card tone="amber" gap={8}>
          <Label size={20} weight="bold">
            Choose a building or a spot first.
          </Label>
          <Label size={20} color={INK_2}>
            Point at the map, or search an address.
          </Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Open the map" tone="primary" icon="map" onClick={onMap} />
        <Button label="Search an address" tone="outline" icon="search" onClick={onSearch} />
      </>
    );
  }
  if (!selected && spot) {
    return (
      <>
        <Title>Place</Title>
        <Subtitle>A spot on the map</Subtitle>
        <Card>
          <Label size={20}>Stand on it, or choose a building near it on the map.</Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Stand here" tone="primary" icon="stand" onClick={() => menu.onStandAt(spot)} />
        <Button label="Back to the map" tone="outline" icon="map" onClick={onMap} />
      </>
    );
  }
  const chosen = selected!;
  const planned = chosen.kind === 'development';
  return (
    <>
      <Title>{chosen.label}</Title>
      <Container flexDirection="row" alignItems="center" gap={8} flexShrink={0}>
        <Container flexShrink={0} paddingX={8} borderRadius={10} borderWidth={2} borderColor={planned ? GREEN : INK_2}>
          <Text fontSize={18} fontWeight="bold" color={planned ? GREEN : INK_2}>
            {planned ? 'Planned' : 'Existing'}
          </Text>
        </Container>
        <Container flexShrink={1}>
          <Label size={18} color={INK_2}>
            {chosen.detail}
          </Label>
        </Container>
      </Container>
      {planned && (
        <>
          <Label size={18} color={INK_2} weight="semi-bold">
            On show
          </Label>
          <Segmented<'off' | 'on'>
            fixed
            options={[
              { value: 'off', label: 'Today' },
              { value: 'on', label: 'With project' },
            ]}
            value={menu.plan.shown ? 'on' : 'off'}
            onChange={(value) => menu.plan.onShow(value === 'on')}
          />
        </>
      )}
      <Container flexGrow={1} />
      {menu.stage === 'street' ? (
        <Button label="Go back up" tone="primary" icon="up" onClick={menu.onRise} />
      ) : (
        <Button label="Stand in front" tone="primary" icon="stand" onClick={menu.onStand} />
      )}
      <Button label="Measure the sun" tone="outline" icon="measure" onClick={onMeasure} />
      {!planned && menu.flat && <Button label="Look out from a flat" tone="outline" icon="home" onClick={onFlat} />}
    </>
  );
}

// ── Measure (left) ─────────────────────────────────────────────────────────

/**
 * The measured spot: the figure large, and the two sums it is the difference
 * of drawn as bars — without the subject, and with it — so the loss is seen
 * as a length and not only read as a number.
 */
function Answer({ menu, noun }: { menu: VrMenu; noun: string }) {
  const measured = menu.measured;
  if (!measured) return null;
  const longest = Math.max(1, measured.withoutMin, measured.withMin);
  const bar = (minutes: number) => `${(minutes / longest) * 100}%` as const;
  const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return (
    <Card tone="amber" gap={8}>
      {measured.none ? (
        <Label size={19} weight="semi-bold">
          {measured.none}
        </Label>
      ) : (
        <>
          <Text fontSize={40} fontWeight="bold" color={INK}>
            {plain(measured.figure ?? '')}
          </Text>
          <Label size={18}>{measured.caption ?? ''}</Label>
          {[
            { name: `Without this ${noun}`, minutes: measured.withoutMin, fill: AMBER },
            { name: 'With it', minutes: measured.withMin, fill: AMBER_INK },
          ].map((row) => (
            <Container key={row.name} flexDirection="column" gap={4}>
              <Label size={18} color={INK_2}>
                {`${row.name} | ${hours(row.minutes)}`}
              </Label>
              <Container height={12}>
                <Container width={bar(row.minutes)} height={12} borderRadius={6} backgroundColor={row.fill} />
              </Container>
            </Container>
          ))}
          {measured.shadowWindow && (
            <Label size={18} color={INK_2}>
              {measured.shadowWindow}
            </Label>
          )}
        </>
      )}
    </Card>
  );
}

function MeasureCard({ menu, onPlaces, onBack }: { menu: VrMenu; onPlaces: () => void; onBack: () => void }) {
  const place = menu.place;
  if (!place) {
    return (
      <>
        <Title>Measure</Title>
        <Card>
          <Label size={19} weight="bold">
            No building selected
          </Label>
          <Label size={18} color={INK_2}>
            Choose a building in Places, or point at a green building in the city and pull the trigger.
          </Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Open the map" tone="primary" icon="map" onClick={onPlaces} />
      </>
    );
  }
  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <Title>Measure</Title>
        <Button label="Back" tone="quiet" height={48} onClick={onBack} />
      </Container>
      <Subtitle>{place.label}</Subtitle>
      {menu.measured && !menu.armed ? (
        <>
          <Answer menu={menu} noun={place.noun} />
          <Label size={18} color={INK_2}>
            {menu.finePrint}
          </Label>
        </>
      ) : (
        <Card tone="amber" gap={8}>
          <Label size={19} weight="bold">
            Point at the ground and pull the trigger.
          </Label>
          <Label size={18} color={INK_2}>
            A ring follows the beam on the ground. The spot you pick is measured for the whole day.
          </Label>
        </Card>
      )}
      <Container flexGrow={1} />
      {menu.measured && !menu.armed && <Button label="Measure another spot" tone="primary" onClick={menu.onMeasure} />}
      <StandButton menu={menu} atSpot={Boolean(menu.measured)} />
    </>
  );
}

// ── Flat (left) ────────────────────────────────────────────────────────────

/*
 * Looking out from a flat: a building standing today, chosen with the beam (opening this card arms it,
 * as Measure arms the ground), then its floor and side, then in. Inside, the way back out. Where the flat
 * does not fit, the button is not offered and the card says why, as the page's flat picker does.
 */
function FlatCard({ menu, flat, onBack }: { menu: VrMenu; flat: VrFlat; onBack: () => void }) {
  if (menu.stage === 'room') {
    return (
      <>
        <Title>In the flat</Title>
        {flat.building && <Subtitle>{flat.building}</Subtitle>}
        <Card gap={8}>
          <Label size={20} weight="semi-bold">
            {`Floor ${flat.floor}${flat.side ? ` | ${flat.side} side` : ''}`}
          </Label>
          <Label size={20} color={INK_2}>
            Hold A or B to watch the sun move across the floor.
          </Label>
          <Label size={18} color={INK_2}>
            An example layout, not the real plan.
          </Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Leave the flat" tone="primary" icon="exit" onClick={flat.onLeave} />
      </>
    );
  }
  if (!flat.building || flat.choosing) {
    return (
      <>
        <Title>Look out from a flat</Title>
        <Subtitle>See the view from a floor</Subtitle>
        <Card tone="amber" gap={8}>
          <Label size={20} weight="bold">
            Point at a building and pull the trigger.
          </Label>
          <Label size={20} color={INK_2}>
            Any building standing today.
          </Label>
        </Card>
        <Container flexGrow={1} />
        {flat.building && flat.choosing && <Button label="Keep this building" onClick={flat.onCancelChoose} />}
      </>
    );
  }
  const atTop = flat.floorsAboveGround !== null && flat.floor >= flat.floorsAboveGround;
  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <Title>Choose a flat</Title>
        <Button label="Back" tone="quiet" height={48} onClick={onBack} />
      </Container>
      <Subtitle>{flat.building}</Subtitle>
      <Label size={18} color={INK_2} weight="semi-bold">
        Floor
      </Label>
      <Container flexDirection="row" alignItems="center" gap={10}>
        <Button label="Down" icon="minus" onClick={() => flat.onFloor(Math.max(1, flat.floor - 1))} />
        <Container flexGrow={1} alignItems="center">
          <Text fontSize={40} fontWeight="bold" color={INK}>
            {String(flat.floor)}
          </Text>
        </Container>
        <Button label="Up" icon="plus" onClick={() => (atTop ? undefined : flat.onFloor(flat.floor + 1))} />
      </Container>
      <Label size={18} color={INK_2} weight="semi-bold">
        Facing
      </Label>
      {flat.sides.length > 0 ? (
        // four to a row: eight sides in one row would be too narrow to aim at
        Array.from({ length: Math.ceil(flat.sides.length / 4) }, (_, row) => (
          <Segmented<string>
            key={row}
            fixed
            options={flat.sides.slice(row * 4, row * 4 + 4).map((compass) => ({ value: compass, label: compass }))}
            value={flat.side}
            onChange={flat.onSide}
          />
        ))
      ) : (
        <Label size={20}>No walls to look out from at this floor.</Label>
      )}
      <Label size={18} color={INK_2}>
        {flat.problem ?? 'An example layout, not the real plan.'}
      </Label>
      <Container flexGrow={1} />
      {/* No icons on these two: with one, the words broke onto a second line at 20 mm. */}
      {flat.canEnter && <Button label="Look out from this flat" tone="primary" onClick={flat.onEnter} />}
      <Button label="Choose another building" onClick={flat.onChoose} />
    </>
  );
}

// ── More (left) ────────────────────────────────────────────────────────────

function MoreCard({ menu, onLeave }: { menu: VrMenu; onLeave: () => void }) {
  return (
    <>
      <Title>More</Title>
      <Subtitle>{menu.stage === 'above' ? 'You are above the city.' : menu.stage === 'room' ? 'You are in the flat.' : 'You are on the street.'}</Subtitle>
      <StandButton menu={menu} />
      <Container flexGrow={1} />
      <Container flexDirection="column" gap={2}>
        {menu.credits.map((line) => (
          <Label key={line} size={18} color={INK_2}>
            {line}
          </Label>
        ))}
      </Container>
      <Button label="Leave VR" icon="exit" onClick={onLeave} />
    </>
  );
}

// ── Help (middle) ──────────────────────────────────────────────────────────

function HelpCard({ onTutorial }: { onTutorial: () => void }) {
  const rows: [string, string][] = [
    ['Trigger', 'Press what the beam is on'],
    ['Trigger, held', 'On the white bar under the menu: move it'],
    ['Right stick', 'Up or down: scroll a list. Left or right: turn'],
    ['Left stick', 'Walk. Push further to go faster'],
    ['A / B, held', 'Time later / earlier'],
    ['X', 'Open or close the menu'],
    ['Grip, held', 'Leave VR (asks first)'],
  ];
  return (
    <>
      <Title>Help</Title>
      <Subtitle>Your controllers</Subtitle>
      <Container flexDirection="column" gap={8}>
        {rows.map(([key, does]) => (
          <Container key={key} flexDirection="row" gap={14} alignItems="center" minHeight={54} paddingX={12} borderRadius={20} backgroundColor={SUNKEN}>
            <KeyChip name={key} width={150} />
            <Container flexShrink={1}>
              <Label size={18}>{does}</Label>
            </Container>
          </Container>
        ))}
      </Container>
      <Container flexGrow={1} />
      <Button label="Show the tutorial again" tone="primary" onClick={onTutorial} />
    </>
  );
}

// ── The navigation, and Close beside it ────────────────────────────────────

/*
 * Four tabs, and what the reader is doing, not the product's features (2026-10-19): Map and Search to find a
 * place, Place to do things with it, More for the rest. Measure and Flat were tabs that did nothing until a
 * building had been chosen somewhere else; they are in Place now. Help is in More: its middle card is the
 * controls and the tutorial again, which every Enter VR shows anyway.
 */
type Tab = 'map' | 'search' | 'place' | 'more';

const TABS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'map', label: 'Map', icon: 'map' },
  { tab: 'search', label: 'Search', icon: 'search' },
  { tab: 'place', label: 'Place', icon: 'building' },
  { tab: 'more', label: 'More', icon: 'more' },
];

function Navigation({ at, onTab, marked }: { at: Tab; onTab: (tab: Tab) => void; marked: Tab | null }) {
  return (
    <Container flexDirection="row" gap={6} padding={8} borderRadius={36} backgroundColor={PAPER} borderWidth={2} borderColor={GLASS_EDGE}>
      {TABS.map(({ tab, label, icon }) => {
        const on = tab === at;
        return (
          <Container
            key={tab}
            onClick={(event) => {
              event.stopPropagation();
              onTab(tab);
            }}
            cursor="pointer"
            pointerEventsOrder={CONTROL_ORDER}
            positionType="relative"
            width={132}
            height={88}
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            gap={4}
            borderRadius={26}
            borderWidth={3}
            borderColor={on ? GREEN : PAPER}
            backgroundColor={on ? GREEN : PAPER}
            hover={{ borderColor: on ? GREEN_PRESSED : INK, backgroundColor: on ? GREEN : SUNKEN }}
            active={{ backgroundColor: on ? GREEN_PRESSED : PRESSED }}
          >
            <Icon name={icon} color={on ? PAPER : INK_2} size={32} />
            {/* Something is chosen there: a dot with a white ring, so it shows on green and on white. */}
            {marked === tab && (
              <Container positionType="absolute" positionTop={10} positionRight={34} width={18} height={18} borderRadius={9} borderWidth={3} borderColor={PAPER} backgroundColor={AMBER} />
            )}
            <Text fontSize={19} fontWeight="bold" color={on ? PAPER : INK_2}>
              {label}
            </Text>
          </Container>
        );
      })}
    </Container>
  );
}

// ── Leaving ────────────────────────────────────────────────────────────────

function LeaveDialog({ width, onLeave, onStay }: { width: number; onLeave: () => void; onStay: () => void }) {
  return (
    <>
      {/* Dims the cards, and takes any press that misses the dialog. */}
      <Container
        positionType="absolute"
        positionLeft={0}
        positionTop={0}
        width={width}
        height={CARD_HEIGHT}
        borderRadius={40}
        backgroundColor={INK}
        opacity={0.35}
        zIndex={10}
        pointerEventsOrder={DIALOG_ORDER - 1}
        onClick={(event) => event.stopPropagation()}
      />
      <Container
        positionType="absolute"
        positionLeft={(width - 380) / 2}
        positionTop={150}
        width={380}
        padding={28}
        gap={12}
        flexDirection="column"
        alignItems="center"
        borderRadius={40}
        backgroundColor={PAPER}
        borderWidth={2}
        borderColor={GLASS_EDGE}
        zIndex={11}
        pointerEventsOrder={DIALOG_ORDER - 1}
        onClick={(event) => event.stopPropagation()}
      >
        <Container width={64} height={64} borderRadius={32} backgroundColor={SUNKEN} alignItems="center" justifyContent="center">
          <Icon name="exit" color={INK} size={32} />
        </Container>
        <Text fontSize={28} fontWeight="bold" color={INK}>
          Leave VR?
        </Text>
        <Label size={18} color={INK_2}>
          You will go back to the web page, at the place you were looking at.
        </Label>
        <Container height={6} />
        <Container flexDirection="column" gap={10} alignSelf="stretch">
          <Button label="Yes, leave VR" tone="primary" onClick={onLeave} order={DIALOG_ORDER} />
          <Button label="Stay in VR" onClick={onStay} order={DIALOG_ORDER} />
        </Container>
      </Container>
    </>
  );
}

// ── Standing at the spot just measured ─────────────────────────────────────

const STAND_ASK_W = 420;

/*
 * "Stand here?" — asked once, straight after a spot is measured, as the page
 * asks it (ui/StandPrompt.tsx, the same words). Over the CITY MAP card, not
 * over the Measure card: the figure just measured is what the question is
 * about, so it stays in sight beside it; and low on that card, under the
 * map's pin for the place. Not modal — nothing is dimmed, and
 * the rest of the menu still works; it goes when answered, when another tab
 * is opened, when the menu is put away, and under "Leave VR?". The laser
 * draws over it like any other control (vrPointer), and it is part of the
 * menu, so it moves and hides with it and never floats over the map on the
 * hand, the wrist clock or the street bar.
 */
function StandAsk({ left, onStand, onNotNow }: { left: number; onStand: () => void; onNotNow: () => void }) {
  return (
    <Container
      positionType="absolute"
      positionLeft={left}
      positionTop={CARD_HEIGHT - 280}
      width={STAND_ASK_W}
      padding={26}
      gap={10}
      flexDirection="column"
      alignItems="center"
      borderRadius={36}
      backgroundColor={PAPER}
      borderWidth={2}
      borderColor={GLASS_EDGE}
      zIndex={11}
      pointerEventsOrder={DIALOG_ORDER - 1}
      onClick={(event) => event.stopPropagation()}
    >
      <Container width={56} height={56} borderRadius={28} backgroundColor={SUNKEN} alignItems="center" justifyContent="center">
        <Icon name="down" color={INK} size={28} />
      </Container>
      <Text fontSize={26} fontWeight="bold" color={INK}>
        Stand here?
      </Text>
      <Label size={18} color={INK_2}>
        See this spot from the footpath, at eye level.
      </Label>
      <Container height={4} />
      <Container flexDirection="row" gap={10} alignSelf="stretch">
        <Container flexGrow={1} flexBasis={0}>
          <Button label="Not now" onClick={onNotNow} order={DIALOG_ORDER} />
        </Container>
        <Container flexGrow={1} flexBasis={0}>
          <Button label="Stand here" tone="primary" icon="down" onClick={onStand} order={DIALOG_ORDER} />
        </Container>
      </Container>
    </Container>
  );
}

// ── The controls tutorial ──────────────────────────────────────────────────

/*
 * What the menu shows first in every session (vrTutorial.ts): a page per
 * action, with a picture of the controller and the part that does it lit.
 * Only its own card shows until it is done — one thing at a time for
 * somebody who has never held a controller.
 */

/** The picture's size: the tutorial card's width inside its padding, and a band of the picture's height. */
const TUTORIAL_IMAGE_W = 508;
const TUTORIAL_IMAGE_PX = 214;

/**
 * All the pictures, fetched and sent to the GPU as soon as the menu exists.
 *
 * Not one at a time as each page is reached, which is what handing uikit a
 * URL does: it fetches the picture when the page appears and throws it away
 * when the page goes. Every page turn then cost a decode and an upload, a
 * frame that stalls — and it landed under the next press. A press held
 * across a stall that long is no longer a click (xrStore.ts), so the reader
 * pressed Next and nothing happened.
 *
 * Held for the session, because Help can bring the pages back at any time.
 */
function useTutorialPictures(): (Texture | undefined)[] {
  const gl = useThree((state) => state.gl);
  const [pictures, setPictures] = useState<(Texture | undefined)[]>([]);
  useEffect(() => {
    let live = true;
    const loader = new TextureLoader();
    const held: Texture[] = [];
    TUTORIAL.forEach((page, index) => {
      loader
        .loadAsync(tutorialImage(page))
        .then((texture) => {
          // As uikit sets its own: sRGB, and a matrix it owns (it fits the picture to the box).
          texture.colorSpace = SRGBColorSpace;
          texture.matrixAutoUpdate = false;
          if (!live) {
            texture.dispose();
            return;
          }
          held.push(texture);
          gl.initTexture(texture);
          setPictures((now) => {
            const next = [...now];
            next[index] = texture;
            return next;
          });
        })
        .catch((error: unknown) => console.error(`The tutorial picture ${page.image} did not load:`, error));
    });
    return () => {
      live = false;
      for (const texture of held) texture.dispose();
    };
  }, [gl]);
  return pictures;
}

function Tutorial({ pictures, onDone }: { pictures: (Texture | undefined)[]; onDone: () => void }) {
  const [at, setAt] = useState(0);
  /** Whether the practice button has been pressed — said back, so the press is felt to have worked. */
  const [practised, setPractised] = useState(false);
  const page = TUTORIAL[at];
  const last = at === TUTORIAL.length - 1;
  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between">
        <Label size={18} color={INK_2} weight="semi-bold">
          {`Controls | ${at + 1} of ${TUTORIAL.length}`}
        </Label>
        {!last && <Button label="Skip" height={52} onClick={onDone} />}
      </Container>

      <Container flexDirection="column" gap={6}>
        <Title>{page.title}</Title>
        <Label size={18} color={INK_2}>
          {page.body}
        </Label>
      </Container>

      {/* 3:2 pictures, cropped to the band the box shows (vrPicture.tsx). */}
      <Picture texture={pictures[at]} width={TUTORIAL_IMAGE_W} height={TUTORIAL_IMAGE_PX} radius={24} aspect={1.5} />

      {page.legend.length > 0 && (
        <Container flexDirection="column" gap={8}>
          {page.legend.map(([key, does]) => (
            <Container key={key} flexDirection="row" alignItems="center" gap={10}>
              <KeyChip name={key} />
              <Container flexShrink={1}>
                <Label size={18}>{does}</Label>
              </Container>
            </Container>
          ))}
        </Container>
      )}

      {page.practice && (
        <Container
          onClick={(event) => {
            event.stopPropagation();
            setPractised(true);
          }}
          cursor="pointer"
          pointerEventsOrder={CONTROL_ORDER}
          height={60}
          flexShrink={0}
          alignItems="center"
          justifyContent="center"
          borderRadius={30}
          borderWidth={3}
          borderColor={GREEN}
          backgroundColor={practised ? GREEN : GREEN_SOFT}
          hover={{ borderColor: INK }}
          active={{ backgroundColor: practised ? GREEN_PRESSED : PRESSED }}
        >
          <Text fontSize={18} fontWeight="bold" color={practised ? PAPER : GREEN}>
            {practised ? 'Well done - that is every button here.' : 'Try it: point here and pull the trigger'}
          </Text>
        </Container>
      )}

      <Container flexGrow={1} />
      <Container flexDirection="row" gap={10}>
        {at > 0 && <Button label="Back" onClick={() => setAt(at - 1)} />}
        <Button
          label={last ? 'Start exploring' : 'Next'}
          tone="primary"
          icon={last ? undefined : 'chevron'}
          grow
          onClick={() => (last ? onDone() : setAt(at + 1))}
        />
      </Container>

      {/* Where the reader is in it, as dots: the current one long and green. */}
      <Container flexDirection="row" gap={7} justifyContent="center">
        {TUTORIAL.map((_, index) => (
          <Container
            key={index}
            width={index === at ? 26 : 10}
            height={10}
            borderRadius={5}
            backgroundColor={index === at ? GREEN : TRACK}
            borderWidth={index === at ? 0 : 2}
            borderColor={EDGE}
          />
        ))}
      </Container>
    </>
  );
}

// ── The menu ───────────────────────────────────────────────────────────────

function Menu({
  menu,
  shown,
  summon,
  tutorial,
  onTutorial,
  leaving,
  onLeaving,
  onClose,
  pictures,
  city,
  subjectKey,
  subjectEN,
}: {
  menu: VrMenu;
  shown: boolean;
  summon: number;
  tutorial: boolean;
  onTutorial: (on: boolean) => void;
  leaving: boolean;
  onLeaving: (on: boolean) => void;
  onClose: () => void;
  pictures: (Texture | undefined)[];
  city: CityForMap | null;
  subjectKey: string | null;
  subjectEN: [number, number] | null;
}) {
  const { rig, startGrab } = usePanelRig({ asideRad: 0, summon, distanceM: MENU_DISTANCE_M });
  const listRef = useRef<VanillaContainer | null>(null);
  const [tab, setTab] = useState<Tab>('map');
  /** A spot pressed on the map: what the list under Map is about. */
  const [spot, setSpot] = useState<[number, number] | null>(null);
  const [kind, setKind] = useState<Kind>('All');
  const [query, setQuery] = useState('');
  /** Inside Place: the building's card, or measuring the sun, or choosing a flat in it. */
  const [placeView, setPlaceView] = useState<'info' | 'measure' | 'flat'>('info');

  /*
   * Measuring the sun (in Place) arms the ground; leaving it disarms it. Arming again once a spot is
   * measured would hide the answer, so it waits for "Measure another spot".
   */
  const measuring = tab === 'place' && placeView === 'measure';
  const placeLabel = menu.place?.label ?? null;
  const wantsArming = shown && !tutorial && measuring && placeLabel !== null && !menu.armed && !menu.measured;
  const onMeasure = menu.onMeasure;
  useEffect(() => {
    if (wantsArming) onMeasure();
  }, [wantsArming, onMeasure]);
  /*
   * Asking "Stand here?": once for each spot measured, by the spot itself
   * (VrMeasurement.spotKey) rather than by watching the ground disarm — that
   * relied on the figure arriving on the same render, and a figure arriving
   * a render later was never asked about. A spot already measured when the
   * menu mounts is not asked about; nor is one measured with the menu away.
   */
  const [standAsk, setStandAsk] = useState(false);
  const spotKey = menu.measured?.spotKey || null;
  const askedFor = useRef(spotKey);
  useEffect(() => {
    if (!spotKey || spotKey === askedFor.current) return;
    askedFor.current = spotKey;
    // oxlint-disable-next-line react/set-state-in-effect -- the spot arrives from the ground, outside the menu
    if (shown && measuring) setStandAsk(true);
  }, [spotKey, shown, measuring]);
  useEffect(() => {
    // Put away, or measuring again: the question was about the last spot.
    // oxlint-disable-next-line react/set-state-in-effect -- follows the menu and the ground
    if (!shown || menu.armed) setStandAsk(false);
  }, [shown, menu.armed]);

  /*
   * Choosing a flat from Place, in a building with none chosen yet, arms the beam for a building; leaving
   * it disarms it. Putting the menu away does not: the city is easier to aim at with the menu out of the way.
   */
  const flat = menu.flat;
  const choosingFlat = tab === 'place' && placeView === 'flat';
  const wantsBuilding = shown && !tutorial && choosingFlat && flat !== null && flat.building === null && !flat.choosing && menu.stage !== 'room';
  const onChooseBuilding = flat?.onChoose;
  useEffect(() => {
    if (wantsBuilding) onChooseBuilding?.();
  }, [wantsBuilding, onChooseBuilding]);
  const choosingBuilding = flat?.choosing ?? false;
  const onCancelBuilding = flat?.onCancelChoose;
  useEffect(() => {
    if (choosingBuilding && (!choosingFlat || menu.stage === 'room')) onCancelBuilding?.();
  }, [choosingBuilding, choosingFlat, menu.stage, onCancelBuilding]);

  const leavePlaceView = () => {
    if (measuring && menu.armed) menu.onCancelMeasure();
    setPlaceView('info');
  };
  const openTab = (next: Tab) => {
    setStandAsk(false);
    if (next !== tab) leavePlaceView();
    setTab(next);
  };
  // a new building chosen: its own card, not the last one's measuring or flat
  const selectedKey = menu.selected ? `${menu.selected.kind}:${menu.selected.key}` : null;
  const shownFor = useRef(selectedKey);
  useEffect(() => {
    if (selectedKey === shownFor.current) return;
    shownFor.current = selectedKey;
    // oxlint-disable-next-line react/set-state-in-effect -- the choice arrives from the map, the list or the city
    setPlaceView('info');
  }, [selectedKey]);

  const listShown = (tab === 'map' && spot !== null) || (tab === 'search' && query.trim().length >= 2);
  useStickScroll(listRef, shown && !tutorial && !leaving && listShown);

  const subject: MapSubject | null =
    menu.selected?.kind === 'development' && menu.place && subjectEN
      ? { key: subjectKey ?? menu.place.label, label: menu.place.label, detail: menu.place.detail, en: subjectEN }
      : menu.selected
        ? { key: menu.selected.key, label: menu.selected.label, detail: menu.selected.detail, en: menu.selected.en }
        : null;

  const left =
    menu.stage === 'room' && flat ? (
      <FlatCard menu={menu} flat={flat} onBack={() => setPlaceView('info')} />
    ) : tab === 'search' ? (
      <SearchCard
        menu={menu}
        query={query}
        onQuery={setQuery}
        listRef={listRef}
        onHit={(hit) => {
          if (hit.kind === 'landmark') {
            // a named place: a spot on the map, with what stands around it
            setSpot(hit.en);
            setTab('map');
            return;
          }
          setSpot(hit.en);
          menu.onPick({ kind: hit.kind, key: hit.key });
          setTab('place');
        }}
      />
    ) : tab === 'place' && placeView === 'measure' ? (
      <MeasureCard menu={menu} onPlaces={() => openTab('map')} onBack={leavePlaceView} />
    ) : tab === 'place' && placeView === 'flat' && flat ? (
      <FlatCard menu={menu} flat={flat} onBack={leavePlaceView} />
    ) : tab === 'place' ? (
      <PlaceCard
        menu={menu}
        selected={menu.selected}
        spot={spot}
        onMeasure={() => setPlaceView('measure')}
        onFlat={() => setPlaceView('flat')}
        onMap={() => openTab('map')}
        onSearch={() => openTab('search')}
      />
    ) : tab === 'more' ? (
      <MoreCard menu={menu} onLeave={() => onLeaving(true)} />
    ) : (
      <NearSpotCard menu={menu} city={city} spot={spot} kind={kind} onKind={setKind} listRef={listRef} onSearch={() => openTab('search')} />
    );

  // the foot of the map: what can be done with the building chosen, or with the spot
  const footer = menu.selected ? (
    // the name on a line of its own, the two buttons under it: side by side, a long address took three lines
    <Container flexDirection="column" gap={8} flexGrow={1}>
      <Container flexDirection="row" gap={10} alignItems="baseline">
        <Label size={19} weight="bold">
          {menu.selected.label}
        </Label>
      </Container>
      <Label size={18} color={INK_2}>
        {menu.selected.detail}
      </Label>
      <Container flexDirection="row" gap={10}>
        <Button label="Stand here" tone="outline" icon="stand" grow onClick={menu.onStand} />
        <Button label="Details" tone="primary" grow onClick={() => openTab('place')} />
      </Container>
    </Container>
  ) : spot ? (
    <>
      <Container flexDirection="column" gap={2} flexGrow={1} flexShrink={1}>
        <Label size={19} weight="bold">
          Spot chosen
        </Label>
        <Label size={18} color={INK_2}>
          The buildings around it are on the left.
        </Label>
      </Container>
      <Button label="Stand here" tone="primary" icon="stand" onClick={() => menu.onStandAt(spot)} />
    </>
  ) : (
    <Container flexDirection="column" gap={2} flexGrow={1} flexShrink={1}>
      <Label size={19} weight="bold">
        Point at the map
      </Label>
      <Label size={18} color={INK_2}>
        Pull the trigger to choose a spot.
      </Label>
    </Container>
  );

  const middle =
    tab === 'more' ? (
      <HelpCard onTutorial={() => onTutorial(true)} />
    ) : (
      <MapCard
        city={city}
        subject={subject}
        buildingKey={menu.selected?.kind === 'building' ? menu.selected.key : null}
        spot={spot}
        onSpot={(en) => {
          setSpot(en);
          // the list of what stands there is under Map
          if (tab !== 'map') openTab('map');
        }}
        shown={shown && !tutorial}
        footer={footer}
      />
    );

  const width = tutorial ? MAP_WIDTH : ROW_WIDTH;
  return (
    <group ref={rig} name="vr-menu" visible={shown}>
      <Container
        pixelSize={PIXEL_M}
        anchorY="center"
        flexDirection="column"
        alignItems="center"
        gap={16}
        /*
         * Drawn over the city, whatever is between it and the eyes. At street
         * level a wall can be nearer than the menu, and a menu that vanishes
         * into a building is a menu nobody can close.
         */
        depthTest={false}
        renderOrder={PANEL_RENDER_ORDER}
        pointerEvents={shown ? 'auto' : 'none'}
      >
        <Container positionType="relative" flexDirection="column" alignItems="center" gap={18} width={width}>
          {tutorial ? (
            <Glass width={MAP_WIDTH} height={CARD_HEIGHT} padding={26} gap={14}>
              <Tutorial pictures={pictures} onDone={() => onTutorial(false)} />
            </Glass>
          ) : (
            <>
              <Container flexDirection="row" gap={CARD_GAP}>
                <Glass width={SIDE_WIDTH} height={CARD_HEIGHT} padding={24} gap={12}>
                  {left}
                </Glass>
                <Glass width={MAP_WIDTH} height={CARD_HEIGHT} padding={24} gap={14}>
                  {middle}
                </Glass>
                <Glass width={SIDE_WIDTH} height={CARD_HEIGHT} padding={24} gap={7}>
                  <TimeCard menu={menu} shown={shown} />
                </Glass>
              </Container>
              <Container flexDirection="row" alignItems="center" gap={14}>
                <Navigation at={tab} onTab={openTab} marked={menu.selected && tab !== 'place' ? 'place' : null} />
                {/* The whole menu at once — the same as X on the left controller. */}
                <Button label="Close" icon="close" tone="quiet" height={104} onClick={onClose} />
              </Container>
            </>
          )}
          {standAsk && !leaving && !tutorial && menu.measured && (
            <StandAsk
              left={SIDE_WIDTH + CARD_GAP + (MAP_WIDTH - STAND_ASK_W) / 2}
              onNotNow={() => setStandAsk(false)}
              onStand={() => {
                setStandAsk(false);
                menu.onStand();
              }}
            />
          )}
          {leaving && <LeaveDialog width={width} onLeave={menu.onExit} onStay={() => onLeaving(false)} />}
        </Container>
        <Grabber width={170} onGrab={startGrab} />
      </Container>
    </group>
  );
}

// ── The way back to a closed menu ──────────────────────────────────────────

/** Where the Menu button sits on the left controller, and how it is tilted to face the eyes. */
const MENU_ON_HAND = new Matrix4().compose(
  new Vector3(0, 0.065, -0.015),
  new Quaternion().setFromEuler(new Euler(-Math.PI / 2.6, 0, 0)),
  new Vector3(1, 1, 1),
);

/**
 * A small button riding on the left hand, just ahead of the wrist clock,
 * pressed with the right hand's laser. Shown only while the menu is closed,
 * so nobody has to know about X to find it again.
 *
 * It lives in the player's floor like the menu, so the controller's pose is
 * brought from the world into that space every frame.
 */
export function VrMenuButton({ shown, onOpen }: { shown: boolean; onOpen: () => void }) {
  const left = useXRInputSourceState('controller', 'left');
  const rig = useRef<Group>(null);
  const pose = useRef(new Matrix4());
  const undo = useRef(new Matrix4());

  useFrame(() => {
    const group = rig.current;
    const parent = group?.parent;
    const hand = left?.object;
    if (!group || !parent) return;
    if (!hand || !shown) {
      group.visible = false;
      return;
    }
    group.visible = true;
    hand.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    pose.current.copy(hand.matrixWorld).multiply(MENU_ON_HAND);
    undo.current.copy(parent.matrixWorld).invert();
    pose.current.premultiply(undo.current);
    pose.current.decompose(group.position, group.quaternion, group.scale);
  });

  return (
    <group ref={rig} name="vr-menu-button">
      <Container
        pixelSize={PIXEL_M}
        anchorY="center"
        depthTest={false}
        renderOrder={PANEL_RENDER_ORDER}
        pointerEventsOrder={CONTROL_ORDER}
        pointerEvents={shown ? 'auto' : 'none'}
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
        cursor="pointer"
        height={44}
        paddingX={20}
        alignItems="center"
        justifyContent="center"
        borderRadius={22}
        borderWidth={3}
        borderColor={PAPER}
        backgroundColor={GREEN}
        hover={{ borderColor: INK }}
        active={{ backgroundColor: GREEN_PRESSED }}
      >
        <Text fontSize={18} fontWeight="bold" color={PAPER}>
          Menu
        </Text>
      </Container>
    </group>
  );
}

/** The floor of the platform over the city: something to stand on. */
export function VrPlatform() {
  return (
    <group>
      {/*
        In the origin's own space, which is three.js Y-up — a floor is a disc
        turned flat about X. Translucent and pale, so the city shows through
        it and it reads as glass rather than as a hole in the view.
      */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} renderOrder={1}>
        <circleGeometry args={[1.6, 48]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} renderOrder={2}>
        <ringGeometry args={[1.52, 1.6, 64]} />
        <meshBasicMaterial color={PAPER} transparent opacity={0.85} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * A failure in the menu stays in the menu.
 *
 * Without this, one error inside it went up through the whole canvas: the
 * scene failed, the WebGL context was lost, and the headset showed black.
 * With it, the city stays; only the menu is gone, and the error goes to the
 * console. (The black screens of September and October were one cause — two
 * uikit classes given the same name by the minifier; see vite.config.ts —
 * and some of that failure happens outside React, where no boundary reaches.)
 */
class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The headset menu failed and was taken down:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Everything the player carries: the menu, the small map and the Menu button
 * for while it is closed, and — above the city — the platform under their
 * feet. The default export, so SceneCanvas can load this whole file lazily
 * with one `lazy(() => import(...))`.
 */
export default function VrFurniture({
  menu,
  stage,
  shown,
  summon,
  askToLeave,
  city,
  subjectKey,
  subjectEN,
  onHide,
  onShow,
}: {
  menu: VrMenu;
  stage: VrStage;
  shown: boolean;
  summon: number;
  /** Bumped when the grip is held: ask whether to leave. */
  askToLeave: number;
  city: CityForMap | null;
  /** The development being looked at, for the map. */
  subjectKey: string | null;
  /** Where the subject stands, east/north metres; null when the whole city is on show. */
  subjectEN: [number, number] | null;
  onHide: () => void;
  /** Bring the menu back in front of the eyes. */
  onShow: () => void;
}) {
  /*
   * The controls tutorial, up first. The menu is mounted afresh for every
   * session (VrWalk exists only while one runs), so this starts true on
   * every Enter VR — which is the point: see vrTutorial.ts.
   */
  const [tutorial, setTutorial] = useState(true);
  const pictures = useTutorialPictures();
  const [leaving, setLeaving] = useState(false);

  const firstAsk = useRef(askToLeave);
  useEffect(() => {
    if (askToLeave === firstAsk.current) return;
    firstAsk.current = askToLeave;
    // oxlint-disable-next-line react/set-state-in-effect -- the grip is outside React
    setLeaving(true);
  }, [askToLeave]);

  return (
    <>
      {stage === 'above' && <VrPlatform />}
      <PanelBoundary>
        <group name="vr-panel" visible={shown}>
          <Menu
            menu={menu}
            shown={shown}
            summon={summon}
            tutorial={tutorial}
            onTutorial={setTutorial}
            leaving={leaving}
            onLeaving={setLeaving}
            onClose={onHide}
            pictures={pictures}
            city={city}
            subjectKey={subjectKey}
            subjectEN={subjectEN}
          />
        </group>
        {/* Not in the flat: a few metres to walk, and the small map sat over the view out of the window. */}
        <MiniMap city={city} subjectKey={subjectKey} shown={!shown && stage !== 'room'} />
        <VrMenuButton shown={!shown} onOpen={onShow} />
      </PanelBoundary>
    </>
  );
}
