/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PARTS EVERY HEADSET PANEL IS MADE OF
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Three cards stand in front of the reader in a headset — what the tab is
 * about on the left, the map in the middle, the time on the right (VrPanel)
 * — and they are built from one set of parts, so they read as one thing.
 *
 * THE LOOK
 *   A light glass slab: the product's white, large rounded corners, controls
 *   shaped as capsules and circles, the green for the one action that moves
 *   the reader on and amber for the sun. On a headset the slab is opaque —
 *   the UI library has no backdrop blur, and the city behind a see-through
 *   panel is what makes text hard to read.
 *
 * SIZES, IN ANGLES
 *   One pixel of layout is one millimetre in the room; the menu stands a
 *   metre away (MENU_DISTANCE_M in VrPanel). Body text is 18 mm (about 1
 *   degree), titles 30 mm (1.7 degrees), and nothing is smaller than 18 mm.
 *   Anything pressed with the laser is at least 60 mm on its short side —
 *   about 3.4 degrees, which a laser held in a hand that is never perfectly
 *   still can land on first time.
 *
 * WHAT THE LASER IS ON
 *   Says so with a dark outline and a change of fill, not by colour alone and
 *   not by lifting the control towards the reader (a lifted control on a
 *   panel drawn without a depth test once stopped being drawn at all).
 *
 * TEXT
 *   The bundled font carries plain ASCII and little else; every string goes
 *   through `plain`.
 */

import type { ReactNode } from 'react';
import { Container, Text } from '@react-three/uikit';
import { iconTexture, type IconName } from './vrIcons';
import { Picture } from './vrPicture';
import {
  PAPER,
  SUNKEN,
  TRACK,
  PRESSED,
  INK,
  INK_2,
  GLASS_EDGE,
  GREEN,
  GREEN_HOVER,
  GREEN_PRESSED,
  GREEN_SOFT,
  AMBER_SOFT,
  AMBER_INK,
  PANEL_ORDER,
  CONTROL_ORDER,
  TARGET_MM,
  plain,
} from './vrTokens';

type Weight = 'normal' | 'medium' | 'semi-bold' | 'bold';

export function Label({
  children,
  size = 18,
  color = INK,
  weight = 'normal',
  spacing,
}: {
  children: string;
  size?: number;
  color?: string;
  weight?: Weight;
  spacing?: number;
}) {
  return (
    <Text fontSize={size} color={color} fontWeight={weight} lineHeight="140%" letterSpacing={spacing} wordBreak="break-word">
      {plain(children)}
    </Text>
  );
}

/** The small capitals over each panel's title: what this panel is. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Label size={18} color={INK_2} weight="bold" spacing={1}>
      {children.toUpperCase()}
    </Label>
  );
}

/** A picture of a few strokes, drawn into a texture (see vrIcons.ts). */
export function Icon({ name, color = INK, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Picture texture={iconTexture(name, color)} width={size} height={size} />;
}

export type Tone = 'primary' | 'secondary' | 'amber' | 'quiet' | 'outline';

/**
 * A capsule. Primary is the product's green, for the one action that moves
 * the reader on; amber is for the sun; secondary is the sunken fill; quiet
 * is words on the glass.
 */
export function Button({
  label,
  onClick,
  tone = 'secondary',
  icon,
  grow = false,
  height = TARGET_MM,
  order = CONTROL_ORDER,
}: {
  label: string;
  onClick: () => void;
  tone?: Tone;
  icon?: IconName;
  grow?: boolean;
  height?: number;
  /** Who wins the laser where things overlap: a dialog's buttons outrank what is under the dialog. */
  order?: number;
}) {
  // outline: white with a green edge and green words, for a second action that must still read as a button on white
  const fill = { primary: GREEN, secondary: SUNKEN, amber: AMBER_SOFT, quiet: PAPER, outline: PAPER }[tone];
  const ink = { primary: PAPER, secondary: INK, amber: AMBER_INK, quiet: INK, outline: GREEN }[tone];
  const edge = tone === 'outline' ? GREEN : fill;
  return (
    <Container
      onClick={(event) => {
        // The panel is in front of the city; a press on it is for it alone.
        event.stopPropagation();
        onClick();
      }}
      cursor="pointer"
      pointerEventsOrder={order}
      height={height}
      minWidth={height}
      // Sharing a row, a little narrower, so "+10 min" stays on one line.
      // An icon alone is a circle, as wide as it is tall.
      paddingX={!label ? 0 : grow ? 8 : tone === 'quiet' ? 14 : 22}
      gap={10}
      flexDirection="row"
      flexGrow={grow ? 1 : 0}
      flexBasis={grow ? 0 : undefined}
      flexShrink={grow ? 1 : 0}
      alignItems="center"
      justifyContent="center"
      borderRadius={height / 2}
      borderWidth={3}
      borderColor={edge}
      backgroundColor={fill}
      hover={{ borderColor: tone === 'primary' || tone === 'outline' ? GREEN_PRESSED : tone === 'amber' ? AMBER_INK : INK, backgroundColor: tone === 'primary' ? GREEN_HOVER : tone === 'quiet' ? SUNKEN : tone === 'outline' ? GREEN_SOFT : fill }}
      active={{ backgroundColor: tone === 'primary' ? GREEN_PRESSED : PRESSED }}
    >
      {icon && <Icon name={icon} color={ink} size={22} />}
      {label && (
        <Text fontSize={20} fontWeight={tone === 'secondary' || tone === 'quiet' ? 'semi-bold' : 'bold'} color={ink}>
          {plain(label)}
        </Text>
      )}
    </Container>
  );
}

/**
 * A strip of choices, one of which is on. The chosen face is white with a
 * dark outline on a grey track — found by lightness and by line, not by hue.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  column = false,
  fixed = false,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  column?: boolean;
  /** Never squeezed by a crowded panel — a squeezed track overlaps the next one. */
  fixed?: boolean;
}) {
  return (
    <Container flexDirection={column ? 'column' : 'row'} gap={4} padding={5} borderRadius={column ? 30 : 34} backgroundColor={TRACK} flexShrink={fixed ? 0 : 1}>
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
            flexBasis={column ? undefined : 0}
            height={56}
            alignItems="center"
            justifyContent="center"
            borderRadius={26}
            borderWidth={2}
            borderColor={on ? INK : TRACK}
            backgroundColor={on ? PAPER : TRACK}
            hover={{ borderColor: INK, backgroundColor: PAPER }}
            active={{ backgroundColor: PRESSED }}
          >
            <Text fontSize={19} fontWeight={on ? 'bold' : 'semi-bold'} color={on ? INK : INK_2}>
              {plain(option.label)}
            </Text>
          </Container>
        );
      })}
    </Container>
  );
}

/** A status pill: a dot and a few words. */
export function Chip({ label, dot = GREEN }: { label: string; dot?: string }) {
  return (
    <Container flexDirection="row" alignItems="center" gap={8} height={40} paddingX={16} borderRadius={20} backgroundColor={SUNKEN} flexShrink={0}>
      <Container width={10} height={10} borderRadius={5} backgroundColor={dot} />
      <Text fontSize={18} fontWeight="semi-bold" color={INK}>
        {plain(label)}
      </Text>
    </Container>
  );
}

/** A button name in a legend, on the amber the tutorial pictures light it in. */
export function KeyChip({ name, width = 120 }: { name: string; width?: number }) {
  return (
    <Container flexShrink={0} width={width} height={38} paddingX={10} alignItems="center" justifyContent="center" borderRadius={19} backgroundColor={AMBER_SOFT}>
      <Text fontSize={18} fontWeight="bold" color={AMBER_INK}>
        {plain(name)}
      </Text>
    </Container>
  );
}

/** A rounded inset on the glass, holding a group of related things. */
export function Card({ children, tone = 'sunken', gap = 10 }: { children: ReactNode; tone?: 'sunken' | 'amber' | 'green'; gap?: number }) {
  const fill = { sunken: SUNKEN, amber: AMBER_SOFT, green: GREEN_SOFT }[tone];
  return (
    <Container flexDirection="column" gap={gap} padding={20} borderRadius={28} backgroundColor={fill}>
      {children}
    </Container>
  );
}

/**
 * The glass slab itself: every panel's body. The root of a panel is drawn
 * over the city whatever is nearer (no depth test) and is AIMED first, for
 * the same reason — see PANEL_ORDER.
 */
export function Glass({
  width,
  height,
  children,
  padding = 28,
  gap = 14,
}: {
  width: number;
  height: number;
  children: ReactNode;
  padding?: number;
  gap?: number;
}) {
  return (
    <Container
      width={width}
      height={height}
      flexDirection="column"
      gap={gap}
      padding={padding}
      borderRadius={46}
      borderWidth={2}
      borderColor={GLASS_EDGE}
      backgroundColor={PAPER}
      pointerEventsOrder={PANEL_ORDER}
    >
      {children}
    </Container>
  );
}

/**
 * The white bar under a panel. Pointed at with the trigger held, it carries
 * the panel with the beam (see vrRig.ts) — the way a window is moved.
 */
export function Grabber({ width = 150, onGrab }: { width?: number; onGrab: () => void }) {
  return (
    <Container
      onPointerDown={(event) => {
        event.stopPropagation();
        onGrab();
      }}
      cursor="grab"
      pointerEventsOrder={CONTROL_ORDER}
      // The bar is drawn thin; what the laser can land on is taller.
      height={TARGET_MM / 2 + 10}
      width={width + 40}
      alignItems="center"
      justifyContent="center"
    >
      <Container
        width={width}
        height={16}
        borderRadius={8}
        backgroundColor={PAPER}
        borderWidth={3}
        borderColor={GLASS_EDGE}
        hover={{ borderColor: INK }}
      />
    </Container>
  );
}
