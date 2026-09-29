/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PANEL INSIDE THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT IS
 *   The 2D sheet, rebuilt as an object in the room. An immersive session
 *   draws no DOM at all, so nothing on the page — search, panels, the time
 *   bar, the map credit — exists once the headset is on. This is what does
 *   their jobs in there: choose a place, set the season and the hour, switch
 *   the subject off and on, measure a spot, go down to the street and back.
 *
 *   It holds no state of the product's. Every button calls a setter App
 *   passes in (see vrMenu.ts), so what the panel says and what the page
 *   would say are the same state read twice.
 *
 * WHAT IT LOOKS LIKE, AND WHY
 *   The same paper card as the 2D sheet — white, the product's green for the
 *   one action that moves the reader on, amber for the sun and the hour —
 *   so that somebody who has used the page recognises the headset, and the
 *   other way round. The first version was white text on a black slab, which
 *   read as a debug console; on the headset it was called "not friendly".
 *
 *   Three steps run across the top (Place, When, Measure), the same three
 *   the page's progress line names, so the reader always knows where they
 *   are and what comes next.
 *
 * HOW IT IS OPERATED
 *   A laser from either controller, and the trigger — how the headset's own
 *   menus work. Buttons are 54 mm tall, list rows 66 mm, the season and
 *   with/without switches 48 mm (about 3.2° at 85 cm); the Menu button on
 *   the left hand is 40 mm, read from much closer.
 *   What the laser is on says so itself: a dark ring and a lighter or darker
 *   fill; held, it darkens again. Nothing is told by hue alone.
 *
 * THE LIST DOES NOT SCROLL
 *   It used to, by pressing and dragging — and on the headset, letting go of
 *   a drag over the row it began on chose that row. It is pages of five now,
 *   turned by buttons that can never choose anything, or by pushing the
 *   right stick up or down. A place is chosen only by pressing a row.
 *
 * PUTTING IT AWAY
 *   Minimise, Hide, and a Menu button on the left hand to bring it back —
 *   see the section of that name below.
 *
 * COLOUR — lightness, measured (WCAG ratios)
 *   ink #16181a on paper            17.9    secondary #5a6169 on paper   6.3
 *   white on green #14624a           7.3    amber ink #8a5e0c on #fcefcc 5.0
 *   edges #7a8087: on paper 4.0, on the sunken fill 3.6, on the track 3.4
 *   panel edge #8a9097 on paper      3.2
 *
 * TEXT
 *   The bundled font carries 104 glyphs — plain ASCII and little else.
 *   Curly quotes, dashes and the middle dot would render as nothing, so every
 *   string goes through `plain`. Separators are drawn as dots, and there are
 *   no icon files at all: a building is two boxes and an arrow is the font's
 *   own `<` or `>` (see "Icons" below for why never SVG).
 *
 * WHY THIS FILE IS LOADED LATE
 *   It brings a layout engine and a font atlas — several hundred kilobytes —
 *   that nobody on a desktop will ever use. SceneCanvas imports it lazily,
 *   only once a session has started.
 */

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { Container, Text } from '@react-three/uikit';
import { Euler, Matrix4, Quaternion, Vector3, type Group } from 'three';
import { worldToEnu } from './frame';
import { panelPose } from './vrPlacement';
import type { VrMenu, VrPlaceOption, VrStage } from './vrMenu';
import { PANEL_RENDER_ORDER } from './vrPointer';

// ── The 2D sheet's tokens (src/styles/tokens.css) ──────────────────────────
const PAPER = '#ffffff';
const SUNKEN = '#f3f5f2';
const TRACK = '#eceeeb';
const PRESSED = '#e2e4e1';
const INK = '#16181a';
const INK_2 = '#5a6169';
const EDGE = '#7a8087';
const PANEL_EDGE = '#8a9097';
const GREEN = '#14624a';
const GREEN_HOVER = '#176b50';
const GREEN_PRESSED = '#0f4d3a';
const GREEN_SOFT = '#d8ebe3';
const AMBER = '#e89a21';
const AMBER_RAIL = '#e9a93f';
const AMBER_SOFT = '#fcefcc';
const AMBER_INK = '#8a5e0c';
const NIGHT_RAIL = '#dce1e3';

/**
 * Frames to wait before the panel is first put in front of the eyes.
 *
 * The head's pose only arrives with the first rendered frame; placed on frame
 * one, the panel is placed against a head at the floor's middle, at floor
 * height, and appears at the player's feet. VrWalk waits a similar few
 * frames in the dark before its own first placement, for the same reason.
 */
const FIRST_PLACEMENT_FRAMES = 5;

/** One pixel of layout is one millimetre in the room. */
const PIXEL_M = 0.001;
const WIDTH_PX = 500;
/** The panel made small: time, place and the way back, in a strip. */
const MINI_WIDTH_PX = 380;

/** Frames to wait after a move lands before measuring where the head is. */
const HEAD_SETTLE_FRAMES = 2;

/** Rows on a page of the place list. */
const PAGE_SIZE = 5;

/*
 * What the laser is on is said by a dark ring and a change of fill — not by
 * lifting the control toward the reader. A lift (uikit's transformTranslateZ
 * on hover, sinking on press) was tried first and taken out: combined with a
 * panel drawn without a depth test, a control that had been lifted and let
 * go stopped being drawn at all — the green "Measure another spot" vanished
 * after its first press in the emulator, leaving a gap in the row.
 */

/**
 * Whose the laser is when things overlap. The panel as a whole outranks the
 * city (see the note on the panel below); its controls outrank the panel.
 * A control lies in the panel's own plane, and a tie between the two went to
 * the panel often enough that small buttons — "Places" in the corner —
 * sometimes ignored a press. Ranked above it, a control is never a tie.
 */
const PANEL_ORDER = 10;
const CONTROL_ORDER = 11;

/** Characters the font has, standing in for the ones it does not. */
function plain(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '|')
    .replace(/…/g, '...')
    .replace(/©/g, '(c)')
    .replace(/−/g, '-')
    .replace(/[^\x20-\x7E°]/g, '');
}

// ── Icons: drawn from boxes and the font, never SVG ────────────────────────
/*
 * NO SVG. uikit's Svg component throws "the svg component can not have any
 * children" if anything attaches to it, and on the Quest something did: the
 * headset's log showed that error the moment the panel appeared, then the
 * scene failing and the WebGL context being lost — which is what went black.
 * The emulator never raised it, and what made the attachment on the device
 * was not found. Rather than keep a component that can take the whole scene
 * down, the icons are boxes and the font's own `<` and `>`.
 */

/** Two blocks of different heights, standing side by side: a building. */
function BuildingMark() {
  return (
    <Container flexDirection="row" alignItems="flex-end" gap={3} width={26} height={24} flexShrink={0}>
      <Container width={10} height={22} borderRadius={2} backgroundColor={GREEN} />
      <Container width={12} height={14} borderRadius={2} backgroundColor={GREEN} />
    </Container>
  );
}

/** A `<` or `>` from the font, sized to sit beside a label. */
function Arrow({ glyph, color, size = 22 }: { glyph: '<' | '>'; color: string; size?: number }) {
  return (
    <Text fontSize={size} fontWeight="bold" color={color}>
      {glyph}
    </Text>
  );
}

function Label({
  children,
  size = 17,
  color = INK,
  weight = 'normal',
  spacing,
}: {
  children: string;
  size?: number;
  color?: string;
  weight?: 'normal' | 'medium' | 'semi-bold' | 'bold';
  spacing?: number;
}) {
  return (
    <Text
      fontSize={size}
      color={color}
      fontWeight={weight}
      lineHeight="135%"
      letterSpacing={spacing}
      wordBreak="break-word"
    >
      {plain(children)}
    </Text>
  );
}

/** Parts of a line with a drawn dot between them — the font has no middle dot. */
function Meta({ parts, color = INK_2, size = 14 }: { parts: string[]; color?: string; size?: number }) {
  return (
    <Container flexDirection="row" alignItems="center" gap={7} flexWrap="wrap">
      {parts.map((part, index) => (
        <Container key={part} flexDirection="row" alignItems="center" gap={7}>
          {index > 0 && <Container width={4} height={4} borderRadius={2} backgroundColor={color} />}
          <Label size={size} color={color}>
            {part}
          </Label>
        </Container>
      ))}
    </Container>
  );
}

type Tone = 'primary' | 'secondary' | 'quiet';

/**
 * A button. Primary is the product's green, for the one action that moves
 * the reader on; secondary is paper with an edge; quiet is words only.
 */
function Button({
  label,
  onClick,
  tone = 'secondary',
  grow = false,
  leading,
  trailing,
}: {
  label: string;
  onClick: () => void;
  tone?: Tone;
  grow?: boolean;
  leading?: '<' | '>';
  trailing?: '<' | '>';
}) {
  const primary = tone === 'primary';
  const quiet = tone === 'quiet';
  const ink = primary ? PAPER : quiet ? GREEN : INK;
  return (
    <Container
      onClick={(event) => {
        // The panel is in front of the city; a press on it is for it alone.
        event.stopPropagation();
        onClick();
      }}
      cursor="pointer"
      pointerEventsOrder={CONTROL_ORDER}
      height={54}
      // Narrower when sharing a row, so "+10 min" stays on one line.
      paddingX={quiet ? 8 : grow ? 8 : 18}
      gap={8}
      flexDirection="row"
      flexGrow={grow ? 1 : 0}
      flexBasis={grow ? 0 : undefined}
      flexShrink={grow ? 1 : 0}
      alignItems="center"
      justifyContent="center"
      borderRadius={12}
      borderWidth={2}
      borderColor={primary ? GREEN : quiet ? PAPER : EDGE}
      backgroundColor={primary ? GREEN : PAPER}
      hover={{
        borderColor: INK,
        backgroundColor: primary ? GREEN_HOVER : PAPER,
      }}
      active={{ backgroundColor: primary ? GREEN_PRESSED : PRESSED }}
    >
      {leading && <Arrow glyph={leading} color={ink} size={20} />}
      <Text fontSize={16} fontWeight={primary ? 'bold' : 'semi-bold'} color={ink}>
        {plain(label)}
      </Text>
      {trailing && <Arrow glyph={trailing} color={ink} size={20} />}
    </Container>
  );
}

/**
 * A strip of choices, one of which is on: the 2D sheet's segmented switch.
 * The chosen face is paper with a dark edge on a grey track — lighter and
 * outlined, so it is found by lightness and by line, not by colour.
 */
function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <Container flexDirection="row" gap={4} padding={4} borderRadius={14} backgroundColor={TRACK}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Container
            key={option.value}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
            }}
            cursor="pointer"
            pointerEventsOrder={CONTROL_ORDER}
            flexGrow={1}
            flexBasis={0}
            height={48}
            alignItems="center"
            justifyContent="center"
            borderRadius={10}
            borderWidth={2}
            borderColor={on ? INK : TRACK}
            backgroundColor={on ? PAPER : TRACK}
            hover={{ borderColor: INK, backgroundColor: PAPER }}
            active={{ backgroundColor: PRESSED }}
          >
            <Text fontSize={16} fontWeight={on ? 'bold' : 'medium'} color={on ? INK : INK_2}>
              {plain(option.label)}
            </Text>
          </Container>
        );
      })}
    </Container>
  );
}

/** Place, When, Measure — the page's own three steps. */
function Steps({ at }: { at: 1 | 2 | 3 }) {
  const steps = ['Place', 'When', 'Measure'];
  return (
    <Container flexDirection="row" alignItems="center" gap={6}>
      {steps.map((name, index) => {
        const number = index + 1;
        const done = number < at;
        const current = number === at;
        return (
          <Container key={name} flexDirection="row" alignItems="center" gap={6}>
            {index > 0 && <Container width={14} height={2} backgroundColor={EDGE} />}
            <Container
              width={24}
              height={24}
              borderRadius={12}
              alignItems="center"
              justifyContent="center"
              backgroundColor={current ? INK : done ? GREEN_SOFT : PAPER}
              borderWidth={current || done ? 0 : 1.5}
              borderColor={EDGE}
            >
              <Text fontSize={13} fontWeight="bold" color={current ? PAPER : done ? GREEN : INK_2}>
                {String(number)}
              </Text>
            </Container>
            {current && (
              <Text fontSize={14} fontWeight="bold" color={INK}>
                {name}
              </Text>
            )}
          </Container>
        );
      })}
    </Container>
  );
}

function Header({ at, back, onBack }: { at: 1 | 2 | 3; back?: string; onBack?: () => void }) {
  return (
    <Container flexDirection="row" alignItems="center" justifyContent="space-between">
      {back && onBack ? (
        <Button label={back} tone="quiet" leading="<" onClick={onBack} />
      ) : (
        <Container />
      )}
      <Steps at={at} />
    </Container>
  );
}

// ── The time rail ──────────────────────────────────────────────────────────

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The day on a rail, as the page draws it: grey for night, amber for the
 * hours the sun is up, a handle for the hour on screen. Where the day starts
 * and ends is written under it in words as well, because amber on grey is a
 * difference of hue more than of lightness.
 */
function TimeRail({ menu }: { menu: VrMenu }) {
  const span = Math.max(1, menu.railEnd - menu.railStart);
  const at = (minutes: number) =>
    `${Math.min(100, Math.max(0, ((minutes - menu.railStart) / span) * 100))}%` as const;
  return (
    <Container flexDirection="column" gap={10} padding={16} borderRadius={14} backgroundColor={SUNKEN}>
      {menu.note && (
        <Label size={14} color={AMBER_INK} weight="semi-bold">
          {menu.note}
        </Label>
      )}
      <Container flexDirection="row" alignItems="center" justifyContent="space-between">
        <Text fontSize={34} fontWeight="bold" color={INK}>
          {plain(menu.timeLabel)}
        </Text>
        <Label size={15} color={INK_2}>
          {menu.dateLabel}
        </Label>
      </Container>
      <Container height={30} positionType="relative">
        <Container
          positionType="absolute"
          positionLeft={0}
          positionRight={0}
          positionTop={12}
          height={6}
          borderRadius={3}
          backgroundColor={NIGHT_RAIL}
        />
        {menu.sunrise !== null && menu.sunset !== null && (
          <Container
            positionType="absolute"
            positionLeft={at(menu.sunrise)}
            width={`${Math.max(0, ((menu.sunset - menu.sunrise) / span) * 100)}%`}
            positionTop={12}
            height={6}
            borderRadius={3}
            backgroundColor={AMBER_RAIL}
          />
        )}
        <Container
          positionType="absolute"
          positionLeft={at(menu.minutes)}
          marginLeft={-14}
          positionTop={1}
          width={28}
          height={28}
          borderRadius={14}
          borderWidth={3}
          borderColor={INK}
          backgroundColor={PAPER}
        />
      </Container>
      <Container flexDirection="row" justifyContent="space-between">
        <Label size={13} color={INK_2}>
          {menu.sunrise !== null ? `Sunrise ${clockOf(menu.sunrise)}` : clockOf(menu.railStart)}
        </Label>
        <Label size={13} color={INK_2}>
          {menu.sunset !== null ? `Sunset ${clockOf(menu.sunset)}` : clockOf(menu.railEnd)}
        </Label>
      </Container>
      <Container flexDirection="row" gap={8}>
        <Button label="-1 h" onClick={() => menu.onNudgeMinutes(-60)} grow />
        <Button label="-10 min" onClick={() => menu.onNudgeMinutes(-10)} grow />
        <Button label="+10 min" onClick={() => menu.onNudgeMinutes(10)} grow />
        <Button label="+1 h" onClick={() => menu.onNudgeMinutes(60)} grow />
      </Container>
    </Container>
  );
}

// ── The answer ─────────────────────────────────────────────────────────────

/**
 * The measured spot: the figure large, and the two sums it is the difference
 * of drawn as bars — without the subject, and with it — so the loss is seen
 * as a length and not only read as a number. The two bars differ in
 * lightness (L* 70 against 43) and are labelled.
 */
function Answer({ menu, noun }: { menu: VrMenu; noun: string }) {
  const measured = menu.measured;
  if (!measured) return null;
  const longest = Math.max(1, measured.withoutMin, measured.withMin);
  const bar = (minutes: number) => `${(minutes / longest) * 100}%` as const;
  const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return (
    <Container flexDirection="column" gap={8} padding={16} borderRadius={14} backgroundColor={AMBER_SOFT}>
      <Label size={13} color={AMBER_INK} weight="bold" spacing={1}>
        AT THIS SPOT
      </Label>
      {measured.none ? (
        <Label size={20} weight="semi-bold">
          {measured.none}
        </Label>
      ) : (
        <>
          <Container flexDirection="row" alignItems="flex-end" gap={10} flexWrap="wrap">
            <Text fontSize={34} fontWeight="bold" color={INK}>
              {plain(measured.figure ?? '')}
            </Text>
            <Label size={16}>{measured.caption ?? ''}</Label>
          </Container>
          {[
            { name: `Without this ${noun}`, minutes: measured.withoutMin, fill: AMBER },
            { name: `With it`, minutes: measured.withMin, fill: AMBER_INK },
          ].map((row) => (
            <Container key={row.name} flexDirection="row" alignItems="center" gap={10}>
              <Container width={150} flexShrink={0}>
                <Label size={13} color={INK_2}>
                  {row.name}
                </Label>
              </Container>
              <Container flexGrow={1} height={12}>
                <Container width={bar(row.minutes)} height={12} borderRadius={6} backgroundColor={row.fill} />
              </Container>
              <Container width={92} flexShrink={0}>
                <Label size={13} color={INK_2}>
                  {hours(row.minutes)}
                </Label>
              </Container>
            </Container>
          ))}
          {measured.shadowWindow && (
            <Label size={13} color={INK_2}>
              {measured.shadowWindow}
            </Label>
          )}
        </>
      )}
    </Container>
  );
}

// ── The place list ─────────────────────────────────────────────────────────

type Sort = 'nearest' | 'tallest' | 'name';

function PlaceRow({ option, distanceM, onChoose }: { option: VrPlaceOption; distanceM: number | null; onChoose: () => void }) {
  const parts = [`Approved`, `${option.heightM.toFixed(0)} m`];
  if (distanceM !== null) {
    parts.push(distanceM < 1000 ? `${Math.round(distanceM / 10) * 10} m away` : `${(distanceM / 1000).toFixed(1)} km away`);
  }
  return (
    <Container
      onClick={(event) => {
        event.stopPropagation();
        onChoose();
      }}
      cursor="pointer"
      pointerEventsOrder={CONTROL_ORDER}
      flexDirection="row"
      alignItems="center"
      gap={14}
      minHeight={66}
      paddingX={14}
      paddingY={10}
      borderRadius={14}
      borderWidth={2}
      borderColor={EDGE}
      backgroundColor={SUNKEN}
      hover={{ borderColor: INK, backgroundColor: PAPER }}
      active={{ backgroundColor: PRESSED }}
    >
      <BuildingMark />
      <Container flexDirection="column" gap={3} flexGrow={1} flexShrink={1}>
        <Label size={17} weight="semi-bold">
          {option.label}
        </Label>
        <Meta parts={parts} />
      </Container>
      <Arrow glyph=">" color={INK_2} />
    </Container>
  );
}

function PlaceList({
  menu,
  headEN,
  sort,
  onSort,
  page,
  onPage,
  onBack,
  onChosen,
}: {
  menu: VrMenu;
  headEN: [number, number] | null;
  sort: Sort;
  onSort: (sort: Sort) => void;
  page: number;
  onPage: (page: number) => void;
  onBack: (() => void) | null;
  onChosen: (label: string) => void;
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
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const shown = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <Header at={1} back={onBack ? menu.place?.label : undefined} onBack={onBack ?? undefined} />
      <Container flexDirection="column" gap={6}>
        <Text fontSize={30} fontWeight="bold" color={INK}>
          Choose a place
        </Text>
        <Label size={16} color={INK_2}>
          Point at a green proposal in the city and pull the trigger, or pick one here.
        </Label>
      </Container>
      <Segmented<Sort>
        options={[
          { value: 'nearest', label: 'Nearest' },
          { value: 'tallest', label: 'Tallest' },
          { value: 'name', label: 'A-Z' },
        ]}
        value={sort}
        onChange={onSort}
      />
      <Container flexDirection="column" gap={8}>
        {shown.map((option) => (
          <PlaceRow
            key={option.key}
            option={option}
            distanceM={distance(option)}
            onChoose={() => {
              onChosen(option.label);
              menu.onChoose(option.key);
            }}
          />
        ))}
      </Container>
      <Container flexDirection="row" alignItems="center" gap={10}>
        <Button label="Previous" leading="<" onClick={() => onPage(Math.max(0, page - 1))} grow />
        <Container width={84} alignItems="center">
          <Label size={15} color={INK_2}>
            {`${page + 1} of ${pages}`}
          </Label>
        </Container>
        <Button
          label="Next"
          trailing=">"
          onClick={() => onPage(Math.min(pages - 1, page + 1))}
          grow
        />
      </Container>
      <Label size={13} color={INK_2}>
        The right stick up and down turns the pages too.
      </Label>
    </>
  );
}

// ── The subject's page ─────────────────────────────────────────────────────

function SunlightPage({ menu, onPlaces }: { menu: VrMenu; onPlaces: () => void }) {
  const place = menu.place;
  if (!place) return null;
  const noun = place.noun;
  const step: 2 | 3 = menu.armed || menu.measured ? 3 : 2;
  return (
    <>
      <Header at={step} back="Places" onBack={onPlaces} />
      <Container flexDirection="column" gap={4}>
        <Text fontSize={28} fontWeight="bold" color={INK}>
          {plain(place.label)}
        </Text>
        <Label size={15} color={INK_2}>
          {place.detail}
        </Label>
      </Container>

      <Segmented
        options={menu.seasons.map((season) => ({ value: season.key, label: season.label }))}
        value={menu.season}
        onChange={menu.onSeason}
      />
      <TimeRail menu={menu} />
      <Segmented<'without' | 'with'>
        options={[
          { value: 'without', label: 'Without it' },
          { value: 'with', label: `With this ${noun}` },
        ]}
        value={menu.showSubject ? 'with' : 'without'}
        onChange={(value) => menu.onShowSubject(value === 'with')}
      />

      {menu.armed ? (
        <Container flexDirection="column" gap={10} padding={16} borderRadius={14} backgroundColor={GREEN_SOFT}>
          <Label size={18} weight="semi-bold">
            Point at the ground and pull the trigger.
          </Label>
          <Label size={14} color={INK_2}>
            A ring follows the laser on the ground. The spot you pick is measured for the whole day.
          </Label>
          <Container flexDirection="row">
            <Button label="Cancel" onClick={menu.onCancelMeasure} />
          </Container>
        </Container>
      ) : menu.measured ? (
        <Answer menu={menu} noun={noun} />
      ) : (
        <Label size={15} color={INK_2}>
          {`Measure how much direct sun a spot on the ground loses to this ${noun} on ${menu.dateLabel}.`}
        </Label>
      )}

      <Container flexDirection="row" gap={10}>
        {!menu.armed && (
          <Button
            label={menu.measured ? 'Measure another spot' : 'Measure a spot'}
            tone="primary"
            onClick={menu.onMeasure}
            grow
          />
        )}
        {menu.stage === 'above' ? (
          <Button
            label={menu.measured ? 'Stand at the spot' : 'Stand in the street'}
            onClick={menu.onStand}
            grow
          />
        ) : (
          <Button label="Go back up" onClick={menu.onRise} grow />
        )}
      </Container>

      <Label size={12} color={INK_2}>
        {menu.finePrint}
      </Label>
    </>
  );
}

// ── Putting the panel away ─────────────────────────────────────────────────

/*
 * Three ways, because the panel stands between the reader and the city and
 * they will want it gone for different lengths of time:
 *
 *   Minimise   a strip with the hour and the place, for watching a shadow
 *              move — A and B still move the hour — without a card in the
 *              way. "Open" brings the card back where it was.
 *   Hide       gone altogether (X on the left controller does the same).
 *   Menu       while it is gone, a small button rides on the left hand and
 *              brings it back in front of the eyes, so nobody has to know
 *              about X to find the panel again.
 */

function TopBar({ onMinimise, onHide }: { onMinimise: () => void; onHide: () => void }) {
  return (
    <Container flexDirection="row" alignItems="center" justifyContent="space-between">
      <Label size={13} color={GREEN} weight="bold" spacing={1}>
        MY CITY TWIN
      </Label>
      <Container flexDirection="row" gap={4}>
        <Button label="Minimise" tone="quiet" onClick={onMinimise} />
        <Button label="Hide" tone="quiet" onClick={onHide} />
      </Container>
    </Container>
  );
}

function MiniBar({ menu, onOpen, onHide }: { menu: VrMenu; onOpen: () => void; onHide: () => void }) {
  return (
    <Container flexDirection="row" alignItems="center" gap={12}>
      <Container flexDirection="column" gap={2} flexGrow={1} flexShrink={1}>
        <Text fontSize={28} fontWeight="bold" color={INK}>
          {plain(menu.timeLabel)}
        </Text>
        <Label size={13} color={INK_2}>
          {menu.place ? `${menu.place.label} | ${menu.dateLabel}` : menu.dateLabel}
        </Label>
      </Container>
      <Button label="Open" tone="primary" onClick={onOpen} />
      <Button label="Hide" tone="quiet" onClick={onHide} />
    </Container>
  );
}

/** Where the Menu button sits on the left controller, and how it is tilted to face the eyes. */
const MENU_ON_HAND = new Matrix4().compose(
  new Vector3(0, 0.065, -0.015),
  new Quaternion().setFromEuler(new Euler(-Math.PI / 2.6, 0, 0)),
  new Vector3(1, 1, 1),
);

/**
 * The way back to a hidden panel: a small button riding on the left hand,
 * just ahead of the wrist clock, pressed with the right hand's laser. Shown
 * only while the panel is away.
 *
 * It lives in the player's floor like the panel, so the controller's pose is
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
        height={40}
        paddingX={16}
        alignItems="center"
        justifyContent="center"
        borderRadius={20}
        borderWidth={2}
        borderColor={PAPER}
        backgroundColor={GREEN}
        hover={{ borderColor: INK, backgroundColor: GREEN_HOVER }}
        active={{ backgroundColor: GREEN_PRESSED }}
      >
        <Text fontSize={17} fontWeight="bold" color={PAPER}>
          Menu
        </Text>
      </Container>
    </group>
  );
}

// ── The panel ──────────────────────────────────────────────────────────────

export function VrPanel({
  menu,
  shown,
  summon,
  flick,
  placed,
  onHide,
}: {
  menu: VrMenu;
  /** Whether the panel is up at all. */
  shown: boolean;
  /** Changes whenever a move has landed (see VrWalk's onPlaced). */
  placed: number;
  /** Put it away — the Hide button; X on the left controller does the same. */
  onHide: () => void;
  /** Changes whenever the panel should be brought in front of the eyes again. */
  summon: number;
  /** A right-stick page turn: a count, and which way. */
  flick: { count: number; direction: -1 | 0 | 1 };
}) {
  const rig = useRef<Group>(null);
  /** Frames until the panel is placed; 0 when there is nothing to do. */
  const placeIn = useRef(FIRST_PLACEMENT_FRAMES);
  const head = useRef(new Vector3());
  const facing = useRef(new Quaternion());
  const forward = useRef(new Vector3());
  const originTurn = useRef(new Quaternion());

  /*
   * The panel's own state: whether the list is open over a place already
   * chosen (held as that place's name, so choosing another closes it without
   * an effect to tidy up), how it is sorted, and which page is showing.
   */
  const [pickingOver, setPickingOver] = useState<string | null>(null);
  const picking = pickingOver !== null && pickingOver === menu.place?.label;
  const choosing = !menu.place || picking;
  const [sort, setSort] = useState<Sort>('nearest');
  const [page, setPage] = useState(0);

  /*
   * Where the reader is standing, for "nearest" — taken when the list opens
   * or is re-sorted, not continuously, so the rows never reorder under a
   * laser that is lining one of them up.
   */
  const [headEN, setHeadEN] = useState<[number, number] | null>(null);
  /**
   * Frames until the head is measured; 0 when it is not wanted. Not at once
   * after a move: the player is put down in the dark a few frames after the
   * move is asked for (see VrWalk), and a head measured before that is the
   * head at the place being left.
   */
  const measureIn = useRef(0);
  const measureHead = () => {
    measureIn.current = 1;
  };
  /*
   * And again whenever a move LANDS — VrWalk says so. Keyed on the landing
   * rather than on the stage, because choosing another place while already
   * above the city moves the player without changing the stage, and a list
   * opened during that move's fade would otherwise keep measuring from the
   * place being left.
   */
  useEffect(() => {
    measureIn.current = HEAD_SETTLE_FRAMES;
  }, [placed]);

  /*
   * Leaving asks once more. The panel stands between the eyes and the city,
   * so a laser aimed down at a building can cross the panel on its way;
   * being thrown out of the headset by accident is the most expensive
   * mistake the panel can make, and a second press is cheap by comparison.
   */
  const [leaving, setLeaving] = useState(false);

  /** Made small: see "Putting the panel away". */
  const [mini, setMini] = useState(false);

  const firstSummon = useRef(summon);
  useEffect(() => {
    // The first placement is already counting down; later ones are at once.
    if (summon !== firstSummon.current) placeIn.current = 1;
  }, [summon]);

  /*
   * The right stick turns the list's pages — only while the list is what is
   * showing; everywhere else the push does nothing.
   */
  const pagesNow = Math.max(1, Math.ceil(menu.options.length / PAGE_SIZE));
  const lastFlick = useRef(flick.count);
  useEffect(() => {
    if (flick.count === lastFlick.current) return;
    lastFlick.current = flick.count;
    // Spent either way, but only turns a page the reader can see.
    if (!shown || mini || !choosing || flick.direction === 0) return;
    const direction = flick.direction;
    // oxlint-disable-next-line react/set-state-in-effect -- the stick is outside React
    setPage((now) => Math.min(pagesNow - 1, Math.max(0, now + direction)));
  }, [flick, shown, mini, choosing, pagesNow]);

  useFrame((state) => {
    const group = rig.current;
    const origin = group?.parent;

    if (measureIn.current > 0 && --measureIn.current === 0) {
      state.camera.getWorldPosition(head.current);
      const [east, north] = worldToEnu([head.current.x, head.current.y, head.current.z]);
      setHeadEN([east, north]);
    }

    /*
     * Placed on the next frame rather than now, because the head's pose is
     * only known inside a frame. Read in world space and brought into the
     * origin's, which is where this panel lives.
     */
    if (!group || !origin || placeIn.current === 0) return;
    if (--placeIn.current > 0) return;

    state.camera.getWorldPosition(head.current);
    state.camera.getWorldQuaternion(facing.current);
    forward.current.set(0, 0, -1).applyQuaternion(facing.current);

    origin.updateWorldMatrix(true, false);
    origin.worldToLocal(head.current);
    origin.getWorldQuaternion(originTurn.current).invert();
    forward.current.applyQuaternion(originTurn.current);

    const pose = panelPose(
      [head.current.x, head.current.y, head.current.z],
      [forward.current.x, forward.current.y, forward.current.z],
    );
    group.position.set(...pose.position);
    group.rotation.set(0, pose.yawRad, 0);
  });

  const openList = () => {
    setPickingOver(menu.place?.label ?? null);
    setPage(0);
    measureHead();
  };

  let body: ReactNode;
  if (mini) {
    body = <MiniBar menu={menu} onOpen={() => setMini(false)} onHide={onHide} />;
  } else if (choosing) {
    body = (
      <PlaceList
        menu={menu}
        headEN={headEN}
        sort={sort}
        onSort={(next) => {
          setSort(next);
          setPage(0);
          measureHead();
        }}
        page={Math.min(page, pagesNow - 1)}
        onPage={setPage}
        onBack={menu.place ? () => setPickingOver(null) : null}
        /*
         * Choosing the place already chosen leaves its name unchanged, so the
         * list — which closes itself when the name changes — would stay open.
         * Closed here for that case only: closing it for every choice showed
         * the previous place's page for the frames before the new one arrived.
         */
        onChosen={(label) => {
          if (label === menu.place?.label) setPickingOver(null);
        }}
      />
    );
  } else {
    body = <SunlightPage menu={menu} onPlaces={openList} />;
  }

  return (
    <group ref={rig} name="vr-panel" visible={shown}>
      <Container
        pixelSize={PIXEL_M}
        width={mini ? MINI_WIDTH_PX : WIDTH_PX}
        anchorY="center"
        flexDirection="column"
        gap={16}
        paddingX={mini ? 18 : 26}
        paddingY={mini ? 14 : 24}
        borderRadius={22}
        borderWidth={2}
        borderColor={PANEL_EDGE}
        backgroundColor={PAPER}
        /*
         * Drawn over the city, whatever is between it and the eyes. At street
         * level a wall can be nearer than the panel, and a panel that
         * vanishes into a building is a panel nobody can close.
         */
        depthTest={false}
        renderOrder={PANEL_RENDER_ORDER}
        /*
         * And AIMED at first, for the same reason. Drawing on top is a render
         * setting and does nothing for the laser, which by default takes the
         * NEAREST thing it hits: at street level a proposal's wall nearer
         * than the panel took the press meant for the button drawn over it.
         * A higher order wins whatever the distance. The panel's own controls
         * rank higher still (CONTROL_ORDER), so the panel behind a button
         * never wins a tie with it.
         */
        pointerEventsOrder={PANEL_ORDER}
        pointerEvents={shown ? 'auto' : 'none'}
      >
        {!mini && <TopBar onMinimise={() => setMini(true)} onHide={onHide} />}
        {body}

        {!mini && (
          <>
        <Container height={2} backgroundColor={TRACK} />
        <Container flexDirection="row" alignItems="center" justifyContent="space-between" gap={10}>
          <Container flexShrink={1}>
            <Label size={13} color={INK_2}>
              Hidden, it waits behind the Menu button on your left hand (or X).
            </Label>
          </Container>
          {leaving ? (
            <Container flexDirection="row" gap={8}>
              <Button label="Stay" onClick={() => setLeaving(false)} />
              <Button label="Yes, leave VR" tone="primary" onClick={menu.onExit} />
            </Container>
          ) : (
            <Button label="Leave VR" tone="quiet" onClick={() => setLeaving(true)} />
          )}
        </Container>
        {menu.stage === 'street' && choosing && (
          <Button label="Go back up" onClick={menu.onRise} />
        )}
        <Container flexDirection="column" gap={2}>
          {menu.credits.map((line) => (
            <Label key={line} size={11} color={INK_2}>
              {line}
            </Label>
          ))}
        </Container>
          </>
        )}
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
 * A failure in the panel stays in the panel.
 *
 * Without this, one error inside it — the SVG icons on the Quest — went up
 * through the whole canvas: the scene failed, the WebGL context was lost, and
 * the headset showed black. With it, the city stays; only the panel is gone,
 * and the error goes to the console.
 */
class PanelBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The headset panel failed and was taken down:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Everything the player carries: the panel, and — above the city — the
 * platform under their feet. The default export, so SceneCanvas can load this
 * whole file lazily with one `lazy(() => import(...))`.
 */
export default function VrFurniture({
  menu,
  stage,
  shown,
  summon,
  flick,
  placed,
  onHide,
  onShow,
}: {
  menu: VrMenu;
  stage: VrStage;
  shown: boolean;
  summon: number;
  flick: { count: number; direction: -1 | 0 | 1 };
  placed: number;
  onHide: () => void;
  /** Bring the panel back in front of the eyes. */
  onShow: () => void;
}) {
  return (
    <>
      {stage === 'above' && <VrPlatform />}
      <PanelBoundary>
        <VrPanel
          menu={menu}
          shown={shown}
          summon={summon}
          flick={flick}
          placed={placed}
          onHide={onHide}
        />
        <VrMenuButton shown={!shown} onOpen={onShow} />
      </PanelBoundary>
    </>
  );
}
