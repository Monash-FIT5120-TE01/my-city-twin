/*
 * ─────────────────────────────────────────────────────────────────────────
 * SUN & TIME — THE RIGHT-HAND CARD OF THE HEADSET MENU
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Moving the sun is the product: a shadow at one fixed moment is a
 * photograph; moving the hour while standing under it is what the headset
 * adds. So the time has a card of its own in the menu, there whatever the
 * other two are showing.
 *
 * WHAT IS ON IT (ProjectDoc/vr-ui-redesign/map-first.html, 2026-10-19)
 *   Now or a preview, beside the title. The hour, large; the day and how
 *   much sun is left in it. THE DAY BAR: a sky that runs from night through
 *   dawn to noon and back, with the sun's arc above it and the sun (or the
 *   moon) as the handle — pressed or slid, it sets the hour. Ten minutes
 *   either way (A and B, held, move it smoothly) with "play the day" between
 *   them, the season, and the way back to now.
 *
 * NOT BY COLOUR ALONE: each band of the sky has its own lightness (night
 * #1d2840 L*16, twilight #5f5384 L*39, dawn #efb36d L*79, day #fbe7a6 L*92,
 * dusk #ea9a62 L*72), sunrise and sunset are written at the ends of the arc,
 * and the handle is a sun with rays by day and a moon by night.
 *
 * MOVING: the rays turn once in twelve seconds, the halo breathes and the
 * stars twinkle — drawn again ten times a second, and only while the menu is
 * out.
 *
 * The seasons are four buttons, two by two, rather than a drop-down: with a
 * laser, a list that opens over the card is two aims instead of one, and it
 * covers what is beneath it while open.
 */

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Container, Text } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { canvasTexture, paintTexture } from './vrIcons';
import type { VrMenu } from './vrMenu';
import { Button, Label, Segmented } from './vrKit';
import { AMBER, AMBER_INK, AMBER_RAIL, AMBER_SOFT, CONTROL_ORDER, GREEN, GREEN_SOFT, INK, INK_2, plain } from './vrTokens';

/** The day bar, mm: the card's inside width; the arc above the bar, or the bar alone under a note. */
const DAY_W = 292;
const DAY_H = 146;
const BAR_ONLY_H = 64;
/** Where the bar runs across the picture, mm. */
const X0 = 12;
const X1 = 280;
/** The bar's middle, from the top of the full picture. */
const BAR_Y = 101;
/** Canvas pixels per millimetre of card. */
const DENSITY = 2;
/** Redraws a second for the turning rays and twinkling stars. */
const MOVES_PER_S = 10;

const NIGHT = '#1d2840';
const TWILIGHT = '#5f5384';
const DAWN = '#efb36d';
const DAY = '#fbe7a6';
const DUSK = '#ea9a62';

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes) % 60).padStart(2, '0')}`;

interface DayState {
  minutes: number;
  railStart: number;
  railEnd: number;
  sunrise: number | null;
  sunset: number | null;
  altitudeDeg: number;
  noonAltitudeDeg: number;
}

/*
 * Rise and set are null when the sun does not cross the horizon inside the hours the bar covers (a December
 * evening runs past its last hour): the sky is then day out to that end, and nothing is written there.
 */
function drawDay(ctx: CanvasRenderingContext2D, day: DayState, withArc: boolean, seconds: number) {
  const height = withArc ? DAY_H : BAR_ONLY_H;
  ctx.setTransform(DENSITY, 0, 0, DENSITY, 0, 0);
  ctx.clearRect(0, 0, DAY_W, height);
  // the bar alone sits at the top of its own picture
  if (!withArc) ctx.translate(0, -(BAR_Y - 24));
  const span = Math.max(1, day.railEnd - day.railStart);
  const px = (m: number) => X0 + ((m - day.railStart) / span) * (X1 - X0);
  const rise = day.sunrise ?? day.railStart - 200;
  const set = day.sunset ?? day.railEnd + 200;
  const up = day.minutes > rise && day.minutes < set;
  const share = (m: number) => Math.sin((Math.PI * (m - rise)) / Math.max(1, set - rise));
  // at most 8 + 38 mm above the line at 78: the highest summer sun leaves room for its figure above it
  const peak = 8 + Math.min(1, Math.max(0, day.noonAltitudeDeg) / 80) * 38;
  const arcY = (m: number) => 78 - share(m) * peak;
  const sx = px(Math.min(day.railEnd, Math.max(day.railStart, day.minutes)));
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  if (withArc) {
    // the sun's path through the day, dotted, over the hours it is up
    const from = Math.max(rise, day.railStart);
    const to = Math.min(set, day.railEnd);
    ctx.setLineDash([2, 6]);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = AMBER_RAIL;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const m = from + ((to - from) * i) / 40;
      if (i === 0) ctx.moveTo(px(m), arcY(m));
      else ctx.lineTo(px(m), arcY(m));
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `700 18px system-ui, "Segoe UI", sans-serif`;
    ctx.fillStyle = AMBER_INK;
    // written inside the card's edge, whatever the season
    const inside = (x: number) => Math.min(DAY_W - 30, Math.max(30, x));
    if (day.sunrise !== null) ctx.fillText(`↑${clockOf(day.sunrise)}`, inside(px(day.sunrise)), arcY(day.sunrise) - 8);
    if (day.sunset !== null) ctx.fillText(`${clockOf(day.sunset)}↓`, inside(px(day.sunset)), arcY(day.sunset) - 8);
    if (up) {
      const sy = arcY(day.minutes);
      // the halo breathes
      const glow = 18 + 3 * Math.sin(seconds * 2.2);
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, glow);
      halo.addColorStop(0, 'rgba(255, 210, 122, 0.9)');
      halo.addColorStop(1, 'rgba(255, 210, 122, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(sx, sy, glow, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fillStyle = AMBER;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.fillText(`${Math.round(Math.max(0, day.altitudeDeg))}°`, Math.min(DAY_W - 22, Math.max(22, sx)), sy - 16);
    }
  }

  // the sky across the day
  const sky = ctx.createLinearGradient(X0, 0, X1, 0);
  const stop = (m: number, colour: string) => sky.addColorStop(Math.min(1, Math.max(0, (m - day.railStart) / span)), colour);
  stop(day.railStart, NIGHT);
  stop(rise - 45, NIGHT);
  stop(rise - 10, TWILIGHT);
  stop(rise + 30, DAWN);
  stop(rise + 100, DAY);
  stop(set - 100, DAY);
  stop(set - 30, DUSK);
  stop(set + 10, TWILIGHT);
  stop(set + 45, NIGHT);
  stop(day.railEnd, NIGHT);
  ctx.fillStyle = sky;
  ctx.beginPath();
  ctx.roundRect(X0, BAR_Y - 15, X1 - X0, 30, 15);
  ctx.fill();

  // stars, where the bar is night
  [20, 34, 46, 258, 272].forEach((x, i) => {
    const m = day.railStart + ((x - X0) / (X1 - X0)) * span;
    if (m > rise - 20 && m < set + 20) return;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(seconds * 2.8 + i * 1.3);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, BAR_Y - 9 + (i % 3) * 7, 1.8, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // the handle: the sun with turning rays by day, the moon by night
  ctx.save();
  ctx.translate(sx, BAR_Y);
  ctx.beginPath();
  ctx.arc(0, 0, 21, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (up) {
    ctx.save();
    ctx.rotate((seconds / 12) * Math.PI * 2);
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
      ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = AMBER;
    ctx.fill();
  } else {
    ctx.fillStyle = NIGHT;
    ctx.fill(new Path2D('M4 -10 a 11 11 0 1 0 0 20 a 8.5 8.5 0 1 1 0 -20z'));
  }
  ctx.restore();

  // the hours under the bar
  ctx.font = `600 18px system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = INK_2;
  for (const hour of [6, 9, 12, 15, 18, 20]) {
    const m = hour * 60;
    if (m < day.railStart || m > day.railEnd) continue;
    ctx.fillText(String(hour).padStart(2, '0'), Math.min(DAY_W - 12, Math.max(12, px(m))), BAR_Y + 39);
  }
}

/*
 * The day bar. A press on it sets the hour there; held and moved, it follows the hand. The press is taken on
 * a clear sheet over the picture, which the UI library hands back as a fraction across (uv), as on the map.
 */
function DayBar({ menu, withArc, shown, onTouch }: { menu: VrMenu; withArc: boolean; shown: boolean; onTouch: () => void }) {
  const height = withArc ? DAY_H : BAR_ONLY_H;
  // Made once for each shape (the bar is keyed on it); drawn into for as long as the card lives.
  const [texture] = useState(() => canvasTexture(DAY_W * DENSITY, height * DENSITY, true));
  useEffect(() => () => texture.dispose(), [texture]);
  const day: DayState = {
    minutes: menu.minutes,
    railStart: menu.railStart,
    railEnd: menu.railEnd,
    sunrise: menu.sunrise,
    sunset: menu.sunset,
    altitudeDeg: menu.sunAltitudeDeg,
    noonAltitudeDeg: menu.noonAltitudeDeg,
  };
  const latest = useRef(day);
  useEffect(() => {
    latest.current = day;
  });
  const drawnAt = useRef(-1);
  const drawnFor = useRef('');

  useFrame((state) => {
    if (!shown) return;
    const seconds = state.clock.elapsedTime;
    const key = JSON.stringify(latest.current);
    // a change at once; the moving parts only ten times a second
    if (key === drawnFor.current && seconds - drawnAt.current < 1 / MOVES_PER_S) return;
    drawnFor.current = key;
    drawnAt.current = seconds;
    paintTexture(texture, (ctx) => drawDay(ctx, latest.current, withArc, seconds));
  });

  const dragging = useRef(false);
  const setFrom = (event: unknown) => {
    const uv = (event as { uv?: { x: number } }).uv;
    if (!uv) return;
    const share = Math.min(1, Math.max(0, (uv.x * DAY_W - X0) / (X1 - X0)));
    const next = Math.round((menu.railStart + share * (menu.railEnd - menu.railStart)) / 10) * 10;
    if (next !== menu.minutes) menu.onSetMinutes(next);
  };

  return (
    <Container width={DAY_W} height={height} positionType="relative" flexShrink={0}>
      <Picture texture={texture} width={DAY_W} height={height} />
      <Container
        positionType="absolute"
        positionLeft={0}
        positionTop={0}
        width={DAY_W}
        height={height}
        zIndex={1}
        cursor="ew-resize"
        pointerEventsOrder={CONTROL_ORDER}
        onPointerDown={(event) => {
          event.stopPropagation();
          dragging.current = true;
          (event.target as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(event.pointerId);
          onTouch();
          setFrom(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) setFrom(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerLeave={() => {
          dragging.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </Container>
  );
}

/** "3 h 20 of sun left", or that it is not up. Nothing when it sets after the last hour. */
function sunLeft(menu: VrMenu): string | null {
  if (menu.sunrise !== null && menu.minutes <= menu.sunrise) return 'before sunrise';
  if (menu.sunset === null) return null;
  if (menu.minutes >= menu.sunset) return 'sun down';
  const left = menu.sunset - menu.minutes;
  return `${Math.floor(left / 60)} h ${String(Math.round(left % 60)).padStart(2, '0')} of sun left`;
}

/*
 * Playing the day: ten minutes every fifth of a second, as on the page, until the last hour. It stops when
 * the hour is moved by hand, and when the menu is put away.
 */
function usePlayDay(menu: VrMenu, shown: boolean) {
  const [playing, setPlaying] = useState(false);
  const latest = useRef(menu);
  useEffect(() => {
    latest.current = menu;
  });
  useEffect(() => {
    if (!playing || !shown) return;
    const timer = window.setInterval(() => {
      const now = latest.current;
      if (now.minutes >= now.railEnd) {
        setPlaying(false);
        return;
      }
      now.onNudgeMinutes(10);
    }, 200);
    return () => window.clearInterval(timer);
  }, [playing, shown]);
  const atEnd = menu.minutes >= menu.railEnd;
  return {
    playing: playing && shown && !atEnd,
    toggle: () => {
      if (playing && !atEnd) {
        setPlaying(false);
        return;
      }
      // pressing play on a finished day means "again", from sunrise
      if (atEnd) menu.onSetMinutes(Math.ceil((menu.sunrise ?? menu.railStart) / 10) * 10);
      setPlaying(true);
    },
    stop: () => setPlaying(false),
  };
}

export function TimeCard({ menu, shown }: { menu: VrMenu; shown: boolean }) {
  const play = usePlayDay(menu, shown);
  const left = sunLeft(menu);
  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <Text fontSize={30} fontWeight="bold" color={INK}>
          Sun & time
        </Text>
        {/* Now, or another moment: said in words, with the colour only as a second sign. */}
        <Container flexDirection="row" alignItems="center" gap={6} height={30} paddingX={12} borderRadius={15} backgroundColor={menu.isNow ? GREEN_SOFT : AMBER_SOFT}>
          <Container width={8} height={8} borderRadius={4} backgroundColor={menu.isNow ? GREEN : AMBER_INK} />
          <Text fontSize={18} fontWeight="bold" color={menu.isNow ? GREEN : AMBER_INK}>
            {menu.isNow ? 'Now' : 'Preview'}
          </Text>
        </Container>
      </Container>
      <Container flexDirection="column" alignItems="center" gap={2} flexShrink={0}>
        <Text fontSize={48} fontWeight="bold" color={INK}>
          {plain(menu.timeLabel)}
        </Text>
        <Label size={18} color={INK_2}>
          {left ? `${menu.dateLabel} | ${left}` : menu.dateLabel}
        </Label>
      </Container>
      {/* An hour other than the one asked for: said in words, over the bar alone. */}
      {menu.note && (
        <Container padding={10} borderRadius={16} backgroundColor={AMBER_SOFT} flexShrink={0}>
          <Label size={18} color={AMBER_INK} weight="semi-bold">
            {menu.note}
          </Label>
        </Container>
      )}
      <DayBar key={menu.note ? 'bar' : 'arc'} menu={menu} withArc={!menu.note} shown={shown} onTouch={play.stop} />
      <Container flexDirection="row" gap={8} flexShrink={0}>
        <Button
          label="-10 min"
          tone="amber"
          grow
          onClick={() => {
            play.stop();
            menu.onNudgeMinutes(-10);
          }}
        />
        <Button label="" icon={play.playing ? 'pause' : 'play'} tone="amber" onClick={play.toggle} />
        <Button
          label="+10 min"
          tone="amber"
          grow
          onClick={() => {
            play.stop();
            menu.onNudgeMinutes(10);
          }}
        />
      </Container>
      {/*
        No "Season" heading over these since the words went up to 18 mm (2026-10-19): the card ran out of
        height, and Summer, Autumn, Winter and Spring say what they are.
      */}
      {[menu.seasons.slice(0, 2), menu.seasons.slice(2)].map((pair, row) => (
        <Segmented
          key={row}
          fixed
          options={pair.map((season) => ({ value: season.key, label: season.label }))}
          value={menu.season}
          onChange={(key) => {
            play.stop();
            menu.onSeason(key);
          }}
        />
      ))}
      <Container flexGrow={1} />
      <Button
        label="Reset to now"
        icon="reset"
        onClick={() => {
          play.stop();
          menu.onNow();
        }}
      />
    </>
  );
}
