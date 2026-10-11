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
 * WHAT IS ON IT
 *   Whether this is now or a preview of another moment. The hour, large, and
 *   the day. The sun's arc from rise to set with the sun on it — where in the
 *   day this is, without reading two numbers and comparing them. The hours
 *   the time can cover as a rail, daylight marked on it. Ten minutes either
 *   way (A and B, held, move it smoothly), the season, and the way back to
 *   now.
 *
 * The seasons are four buttons, two by two, rather than a drop-down: with a
 * laser, a list that opens over the card is two aims instead of one, and it
 * covers what is beneath it while open.
 */

import { useEffect, useState } from 'react';
import { Container, Text } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { canvasTexture, paintTexture } from './vrIcons';
import type { VrMenu } from './vrMenu';
import { Button, Label, Segmented } from './vrKit';
import { AMBER, AMBER_INK, AMBER_RAIL, AMBER_SOFT, GREEN, GREEN_SOFT, INK, INK_2, NIGHT_RAIL, PAPER, TRACK, plain } from './vrTokens';

const ARC_W = 288;
const ARC_H = 96;
/** Canvas pixels per millimetre of card. */
const DENSITY = 2;

const clockOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The day as an arc: amber from rise to set, the sun on it now, grey when it is down. */
function useSunArc(minutes: number, sunrise: number | null, sunset: number | null, railStart: number, railEnd: number) {
  // Made once; the canvas is drawn into for as long as the card lives.
  const [texture] = useState(() => canvasTexture(ARC_W * DENSITY, ARC_H * DENSITY, true));
  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    paintTexture(texture, (ctx) => drawArc(ctx, minutes, sunrise, sunset, railStart, railEnd));
  }, [texture, minutes, sunrise, sunset, railStart, railEnd]);

  return texture;
}

/*
 * Rise and set are null when the sun does not cross the horizon inside the
 * hours the time covers (a December evening runs past its last hour). The
 * arc then runs from the first hour, or to the last, and the sun is up across
 * it — what the card draws is the hours the reader can reach.
 */
function drawArc(ctx: CanvasRenderingContext2D, minutes: number, sunrise: number | null, sunset: number | null, railStart: number, railEnd: number) {
  ctx.setTransform(DENSITY, 0, 0, DENSITY, 0, 0);
  ctx.clearRect(0, 0, ARC_W, ARC_H);
  const cx = ARC_W / 2, cy = ARC_H - 24, r = Math.min(90, cy - 10);
  ctx.lineCap = 'round';
  ctx.strokeStyle = NIGHT_RAIL;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx - r - 14, cy);
  ctx.lineTo(cx + r + 14, cy);
  ctx.stroke();
  ctx.strokeStyle = AMBER_RAIL;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.stroke();
  const rise = sunrise ?? railStart;
  const set = sunset ?? railEnd;
  const up = minutes > rise && minutes < set;
  const share = (minutes - rise) / Math.max(1, set - rise);
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, share)));
  const sx = up ? cx + r * Math.cos(angle) : share < 0.5 ? cx - r : cx + r;
  const sy = up ? cy - r * Math.sin(angle) : cy;
  ctx.beginPath();
  ctx.arc(sx, sy, up ? 14 : 11, 0, Math.PI * 2);
  ctx.fillStyle = up ? AMBER : '#7a8087';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.font = `600 14px system-ui, "Segoe UI", sans-serif`;
  ctx.fillStyle = INK_2;
  ctx.textBaseline = 'alphabetic';
  if (sunrise !== null) {
    ctx.textAlign = 'left';
    ctx.fillText(`Sunrise ${clockOf(sunrise)}`, 2, ARC_H - 3);
  }
  if (sunset !== null) {
    ctx.textAlign = 'right';
    ctx.fillText(`Sunset ${clockOf(sunset)}`, ARC_W - 2, ARC_H - 3);
  }
}

/** The hours the time covers, daylight marked, and where the hour is. */
function DayRail({ menu }: { menu: VrMenu }) {
  const span = Math.max(1, menu.railEnd - menu.railStart);
  const at = (minutes: number) => Math.min(100, Math.max(0, ((minutes - menu.railStart) / span) * 100));
  const rise = at(menu.sunrise ?? menu.railStart);
  const set = at(menu.sunset ?? menu.railEnd);
  return (
    <Container flexDirection="column" gap={6} flexShrink={0}>
      <Container height={28} positionType="relative">
        <Container positionType="absolute" positionLeft={0} positionRight={0} positionTop={11} height={6} borderRadius={3} backgroundColor={TRACK} />
        <Container positionType="absolute" positionLeft={`${rise}%`} width={`${set - rise}%`} positionTop={11} height={6} borderRadius={3} backgroundColor={AMBER_RAIL} />
        <Container positionType="absolute" positionLeft={`${at(menu.minutes)}%`} marginLeft={-13} positionTop={1} width={26} height={26} borderRadius={13} borderWidth={3} borderColor={INK} backgroundColor={PAPER} />
      </Container>
      <Container flexDirection="row" justifyContent="space-between">
        <Label size={14} color={INK_2} weight="semi-bold">
          {clockOf(menu.railStart)}
        </Label>
        <Label size={14} color={INK_2} weight="semi-bold">
          {clockOf(menu.railEnd)}
        </Label>
      </Container>
    </Container>
  );
}

export function TimeCard({ menu }: { menu: VrMenu }) {
  const arc = useSunArc(menu.minutes, menu.sunrise, menu.sunset, menu.railStart, menu.railEnd);
  return (
    <>
      <Text fontSize={30} fontWeight="bold" color={INK}>
        Sun & time
      </Text>
      {/* Now, or another moment: said in words, with the colour only as a second sign. */}
      <Container flexDirection="row" flexShrink={0}>
        <Container flexDirection="row" alignItems="center" gap={6} height={30} paddingX={12} borderRadius={15} backgroundColor={menu.isNow ? GREEN_SOFT : AMBER_SOFT}>
          <Container width={8} height={8} borderRadius={4} backgroundColor={menu.isNow ? GREEN : AMBER_INK} />
          <Text fontSize={14} fontWeight="bold" color={menu.isNow ? GREEN : AMBER_INK}>
            {menu.isNow ? 'Now' : 'Preview'}
          </Text>
        </Container>
      </Container>
      <Container flexDirection="column" alignItems="center" gap={4} flexShrink={0}>
        <Text fontSize={54} fontWeight="bold" color={INK}>
          {plain(menu.timeLabel)}
        </Text>
        <Label size={17} color={INK_2}>
          {menu.dateLabel}
        </Label>
      </Container>
      {menu.note ? (
        <Container padding={10} borderRadius={16} backgroundColor={AMBER_SOFT} flexShrink={0}>
          <Label size={14} color={AMBER_INK} weight="semi-bold">
            {menu.note}
          </Label>
        </Container>
      ) : (
        <Container alignSelf="center" flexShrink={0}>
          <Picture texture={arc} width={ARC_W} height={ARC_H} />
        </Container>
      )}
      <DayRail menu={menu} />
      <Container flexDirection="row" gap={10} flexShrink={0}>
        <Button label="-10 min" tone="amber" grow onClick={() => menu.onNudgeMinutes(-10)} />
        <Button label="+10 min" tone="amber" grow onClick={() => menu.onNudgeMinutes(10)} />
      </Container>
      <Label size={15} color={INK_2} weight="semi-bold">
        Season
      </Label>
      {[menu.seasons.slice(0, 2), menu.seasons.slice(2)].map((pair, row) => (
        <Segmented
          key={row}
          fixed
          options={pair.map((season) => ({ value: season.key, label: season.label }))}
          value={menu.season}
          onChange={menu.onSeason}
        />
      ))}
      <Container flexGrow={1} />
      <Button label="Reset to now" icon="reset" onClick={menu.onNow} />
    </>
  );
}
