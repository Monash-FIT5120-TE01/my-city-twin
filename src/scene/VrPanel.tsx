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
 *     left     Places — the approved developments, a list that scrolls
 *     middle   City map — the city as built in the app, the place chosen
 *              pinned on it, the reader's position and heading
 *     right    Sun & time — always there, whatever the others show
 *
 *   Under them a navigation bar (Explore, Measure, Help, More) and, beside it,
 *   Close; under that one white bar that the beam carries the whole menu by
 *   (vrRig.ts). Measure and More change the left card; Help changes the
 *   middle one; the time card never changes. Close does what X on the left
 *   controller does: the whole menu goes, and the small map in the corner of
 *   the eye stays.
 *
 * THE LIST SCROLLS — WITHOUT CHOOSING WHAT IT LANDS ON
 *   It scrolled once before, by dragging with the beam, and letting go of a
 *   drag over the row it began on chose that row. So a row remembers how far
 *   the list had scrolled when it was pressed, and a press that ends with the
 *   list somewhere else is a scroll, not a choice. The right stick up and
 *   down scrolls too.
 *
 * MEASURING
 *   Opening Measure arms the ground straight away — there is no page of
 *   instructions to press past; the card says what to do and shows the
 *   answer when there is one. Leaving Measure disarms it. With no building
 *   chosen, it says so.
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
import { useXRInputSourceState } from '@react-three/xr';
import { Container, Text, type VanillaContainer } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { Euler, Matrix4, Quaternion, SRGBColorSpace, TextureLoader, Vector3, type Group, type Texture } from 'three';
import { worldToEnu } from './frame';
import type { VrMenu, VrPlaceOption, VrStage } from './vrMenu';
import { PANEL_RENDER_ORDER } from './vrPointer';
import { usePanelRig } from './vrRig';
import { TUTORIAL, tutorialImage } from './vrTutorial';
import { TimeCard } from './VrTimePanel';
import { MapCard, MiniMap, type CityForMap, type MapSubject } from './VrMapPanel';
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

/** Frames to wait after a move lands before measuring where the head is. */
const HEAD_SETTLE_FRAMES = 2;

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
    <Label size={17} color={INK_2}>
      {children}
    </Label>
  );
}

function StandButton({ menu, atSpot = false }: { menu: VrMenu; atSpot?: boolean }) {
  return menu.stage === 'above' ? (
    <Button label={atSpot ? 'Stand at the spot' : 'Stand in the street'} icon="down" onClick={menu.onStand} />
  ) : (
    <Button label="Go back up" icon="up" onClick={menu.onRise} />
  );
}

// ── Places (left) ──────────────────────────────────────────────────────────

type Sort = 'nearest' | 'tallest' | 'name';

function PlaceRow({
  option,
  distanceM,
  chosen,
  list,
  onChoose,
}: {
  option: VrPlaceOption;
  distanceM: number | null;
  chosen: boolean;
  list: { current: VanillaContainer | null };
  onChoose: () => void;
}) {
  const pressedAt = useRef<number | null>(null);
  const parts = [`${option.heightM.toFixed(0)} m tall`];
  if (distanceM !== null) {
    parts.unshift(distanceM < 1000 ? `${Math.round(distanceM / 10) * 10} m away` : `${(distanceM / 1000).toFixed(1)} km away`);
  }
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
      {/* Two blocks of different heights: a building. Boxes, not a picture — this lives in a scrolling list (vrPicture.tsx). */}
      <Container width={46} height={46} borderRadius={14} backgroundColor={PAPER} flexDirection="row" alignItems="flex-end" justifyContent="center" gap={3} paddingBottom={11} flexShrink={0}>
        <Container width={9} height={16} borderRadius={2} backgroundColor={GREEN} />
        <Container width={11} height={24} borderRadius={2} backgroundColor={GREEN} />
      </Container>
      <Container flexDirection="column" gap={3} flexGrow={1} flexShrink={1}>
        <Label size={17} weight="bold">
          {option.label}
        </Label>
        <Label size={14} color={INK_2}>
          {parts.join(' | ')}
        </Label>
      </Container>
      {chosen && (
        <Container width={30} height={30} borderRadius={15} backgroundColor={GREEN} alignItems="center" justifyContent="center" flexShrink={0}>
          <Text fontSize={16} fontWeight="bold" color={PAPER}>
            v
          </Text>
        </Container>
      )}
    </Container>
  );
}

function PlacesCard({
  menu,
  headEN,
  sort,
  onSort,
  onChosen,
  listRef,
}: {
  menu: VrMenu;
  headEN: [number, number] | null;
  sort: Sort;
  onSort: (sort: Sort) => void;
  onChosen: (label: string) => void;
  listRef: { current: VanillaContainer | null };
}) {
  const distance = (option: VrPlaceOption) =>
    headEN ? Math.hypot(option.en[0] - headEN[0], option.en[1] - headEN[1]) : null;
  const sorted = [...menu.options].sort((a, b) =>
    sort === 'tallest'
      ? b.heightM - a.heightM
      : sort === 'nearest' && headEN
        ? (distance(a) ?? 0) - (distance(b) ?? 0)
        : 0,
  );
  return (
    <>
      <Title>Places</Title>
      <Subtitle>Explore Melbourne</Subtitle>
      <Segmented<Sort>
        fixed
        options={[
          { value: 'nearest', label: 'Nearest' },
          { value: 'tallest', label: 'Tallest' },
          { value: 'name', label: 'A-Z' },
        ]}
        value={sort}
        onChange={onSort}
      />
      <ScrollList listRef={listRef}>
        {sorted.map((option) => (
          <PlaceRow
            key={option.key}
            option={option}
            distanceM={distance(option)}
            chosen={option.label === menu.place?.label}
            list={listRef}
            onChoose={() => {
              onChosen(option.label);
              menu.onChoose(option.key);
            }}
          />
        ))}
      </ScrollList>
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
          <Label size={16}>{measured.caption ?? ''}</Label>
          {[
            { name: `Without this ${noun}`, minutes: measured.withoutMin, fill: AMBER },
            { name: 'With it', minutes: measured.withMin, fill: AMBER_INK },
          ].map((row) => (
            <Container key={row.name} flexDirection="column" gap={4}>
              <Label size={14} color={INK_2}>
                {`${row.name} | ${hours(row.minutes)}`}
              </Label>
              <Container height={12}>
                <Container width={bar(row.minutes)} height={12} borderRadius={6} backgroundColor={row.fill} />
              </Container>
            </Container>
          ))}
          {measured.shadowWindow && (
            <Label size={14} color={INK_2}>
              {measured.shadowWindow}
            </Label>
          )}
        </>
      )}
    </Card>
  );
}

function MeasureCard({ menu, onPlaces }: { menu: VrMenu; onPlaces: () => void }) {
  const place = menu.place;
  if (!place) {
    return (
      <>
        <Title>Measure</Title>
        <Card>
          <Label size={19} weight="bold">
            No building selected
          </Label>
          <Label size={16} color={INK_2}>
            Choose a building in Places, or point at a green building in the city and pull the trigger.
          </Label>
        </Card>
        <Container flexGrow={1} />
        <Button label="Choose a place" tone="primary" icon="places" onClick={onPlaces} />
      </>
    );
  }
  return (
    <>
      <Title>Measure</Title>
      <Subtitle>{place.label}</Subtitle>
      {menu.measured && !menu.armed ? (
        <>
          <Answer menu={menu} noun={place.noun} />
          <Label size={12} color={INK_2}>
            {menu.finePrint}
          </Label>
        </>
      ) : (
        <Card tone="amber" gap={8}>
          <Label size={19} weight="bold">
            Point at the ground and pull the trigger.
          </Label>
          <Label size={16} color={INK_2}>
            A ring follows the beam on the ground. The spot you pick is measured for the whole day.
          </Label>
        </Card>
      )}
      <Container flexGrow={1} />
      {menu.measured && !menu.armed && <Button label="Measure another spot" tone="primary" icon="measure" onClick={menu.onMeasure} />}
      <StandButton menu={menu} atSpot={Boolean(menu.measured)} />
    </>
  );
}

// ── More (left) ────────────────────────────────────────────────────────────

function MoreCard({ menu, onLeave }: { menu: VrMenu; onLeave: () => void }) {
  return (
    <>
      <Title>More</Title>
      <Subtitle>{menu.stage === 'above' ? 'You are above the city.' : 'You are on the street.'}</Subtitle>
      <StandButton menu={menu} />
      <Container flexGrow={1} />
      <Container flexDirection="column" gap={2}>
        {menu.credits.map((line) => (
          <Label key={line} size={13} color={INK_2}>
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
              <Label size={16}>{does}</Label>
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

type Tab = 'explore' | 'measure' | 'help' | 'more';

const TABS: { tab: Tab; label: string; icon: IconName }[] = [
  { tab: 'explore', label: 'Explore', icon: 'map' },
  { tab: 'measure', label: 'Measure', icon: 'ruler' },
  { tab: 'help', label: 'Help', icon: 'help' },
  { tab: 'more', label: 'More', icon: 'more' },
];

function Navigation({ at, onTab }: { at: Tab; onTab: (tab: Tab) => void }) {
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
            width={96}
            height={68}
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
            <Icon name={icon} color={on ? PAPER : INK_2} size={26} />
            <Text fontSize={14} fontWeight="bold" color={on ? PAPER : INK_2}>
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
        <Label size={17} color={INK_2}>
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
      <Label size={17} color={INK_2}>
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
        <Label size={14} color={INK_2} weight="semi-bold">
          {`Controls | ${at + 1} of ${TUTORIAL.length}`}
        </Label>
        {!last && <Button label="Skip" height={52} onClick={onDone} />}
      </Container>

      <Container flexDirection="column" gap={6}>
        <Title>{page.title}</Title>
        <Label size={17} color={INK_2}>
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
                <Label size={16}>{does}</Label>
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
          <Text fontSize={17} fontWeight="bold" color={practised ? PAPER : GREEN}>
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
  placed,
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
  placed: number;
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
  const head = useRef(new Vector3());
  const listRef = useRef<VanillaContainer | null>(null);
  const [tab, setTab] = useState<Tab>('explore');
  const [sort, setSort] = useState<Sort>('nearest');

  /*
   * Where the reader is standing, for "nearest" — taken when the list opens
   * or is re-sorted, and after every move lands, not continuously, so the
   * rows never reorder under a laser that is lining one of them up.
   */
  const [headEN, setHeadEN] = useState<[number, number] | null>(null);
  const measureIn = useRef(HEAD_SETTLE_FRAMES);
  useEffect(() => {
    measureIn.current = HEAD_SETTLE_FRAMES;
  }, [placed]);
  useFrame((state) => {
    if (measureIn.current > 0 && --measureIn.current === 0) {
      state.camera.getWorldPosition(head.current);
      const [east, north] = worldToEnu([head.current.x, head.current.y, head.current.z]);
      setHeadEN([east, north]);
    }
  });
  /** Measure where the head is on the next frame. */
  const remeasure = () => {
    measureIn.current = 1;
  };

  /*
   * Opening Measure arms the ground; leaving it disarms it. Arming again once
   * a spot is measured would hide the answer, so it waits for "Measure
   * another spot".
   */
  const placeLabel = menu.place?.label ?? null;
  const wantsArming = shown && !tutorial && tab === 'measure' && placeLabel !== null && !menu.armed && !menu.measured;
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
    if (shown && tab === 'measure') setStandAsk(true);
  }, [spotKey, shown, tab]);
  useEffect(() => {
    // Put away, or measuring again: the question was about the last spot.
    // oxlint-disable-next-line react/set-state-in-effect -- follows the menu and the ground
    if (!shown || menu.armed) setStandAsk(false);
  }, [shown, menu.armed]);

  const openTab = (next: Tab) => {
    setStandAsk(false);
    if (tab === 'measure' && next !== 'measure' && menu.armed) menu.onCancelMeasure();
    if (next === 'explore' || next === 'help') remeasure();
    setTab(next);
  };


  const placesShown = tab === 'explore' || tab === 'help';
  useStickScroll(listRef, shown && !tutorial && !leaving && placesShown);

  const subject: MapSubject | null =
    menu.place && subjectEN ? { key: subjectKey ?? menu.place.label, label: menu.place.label, detail: menu.place.detail, en: subjectEN } : null;

  const left =
    tab === 'measure' ? (
      <MeasureCard menu={menu} onPlaces={() => openTab('explore')} />
    ) : tab === 'more' ? (
      <MoreCard menu={menu} onLeave={() => onLeaving(true)} />
    ) : (
      <PlacesCard
        menu={menu}
        headEN={headEN}
        sort={sort}
        onSort={(next) => {
          setSort(next);
          remeasure();
        }}
        listRef={listRef}
        onChosen={() => undefined}
      />
    );
  const middle =
    tab === 'help' ? (
      <HelpCard onTutorial={() => onTutorial(true)} />
    ) : (
      <MapCard city={city} subject={subject} shown={shown && !tutorial} onViewPlace={() => openTab('measure')} />
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
                <Glass width={SIDE_WIDTH} height={CARD_HEIGHT} padding={24} gap={10}>
                  <TimeCard menu={menu} />
                </Glass>
              </Container>
              <Container flexDirection="row" alignItems="center" gap={14}>
                <Navigation at={tab} onTab={openTab} />
                {/* The whole menu at once — the same as X on the left controller. */}
                <Button label="Close" icon="close" tone="quiet" height={84} onClick={onClose} />
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
  placed,
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
  placed: number;
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
            placed={placed}
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
        <MiniMap city={city} subjectKey={subjectKey} shown={!shown} />
        <VrMenuButton shown={!shown} onOpen={onShow} />
      </PanelBoundary>
    </>
  );
}
