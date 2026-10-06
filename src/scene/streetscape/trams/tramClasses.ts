/*
 * MELBOURNE TRAM CLASSES — size, shape and how each moves.
 *
 * Size (length, width, roof height, floor height, bogie centres, door count): Yarra Trams CE-019-ST-0006
 * (2023) appendix "Tram Class", Vicsig and Wikipedia. Section lengths, door positions and widths, window
 * layout and nose shape: EST from photos (ProjectDoc/streetscape/11-trams-rolling-stock.md).
 * Acceleration and service braking: Yarra Trams, Infrastructure - Tram Track Design (2019), appendix C.
 * G (in service 2026) and W8 publish neither: EST.
 */

export type ClassKey = 'W8' | 'Z3' | 'A' | 'B2' | 'C1' | 'C2' | 'D1' | 'D2' | 'E' | 'G';

export interface TramClass {
  name: string;
  /** Length, width, roof height, floor height above rail, metres. */
  L: number; W: number; H: number; floor: number;
  /** Body sections, front to back, metres (articulated classes bend between them). */
  secs: number[];
  nose: 'w' | 'rake' | 'round' | 'flat';
  /** Bogie centres from the middle, metres. */
  bogies: number[];
  /** Doors: [fraction of the length from the back, width m, kind]. */
  doors: [number, number, 'drop'?][];
  windows: 'single' | 'band' | 'big';
  livery: 'ptv' | 'w8';
  /** m/s2: acceleration, and service braking. */
  accel: number; brake: number;
}

export const TRAM_CLASSES: Record<ClassKey, TramClass> = {
  W8: { name: 'W8 (heritage, City Circle)', L: 14.17, W: 2.74, H: 3.149, floor: 0.95, secs: [14.17], nose: 'w', bogies: [-4.267, 4.267],
    doors: [[0.33, 1.0, 'drop'], [0.67, 1.0, 'drop']], windows: 'single', livery: 'w8', accel: 0.8, brake: 1.2 },
  Z3: { name: 'Z3', L: 16.64, W: 2.67, H: 3.45, floor: 0.9, secs: [16.64], nose: 'rake', bogies: [-4.25, 4.25],
    doors: [[0.17, 1.3], [0.52, 1.3], [0.86, 0.7]], windows: 'single', livery: 'ptv', accel: 1.5, brake: 1.6 },
  A: { name: 'A1 / A2', L: 15.01, W: 2.67, H: 3.346, floor: 0.9, secs: [15.01], nose: 'rake', bogies: [-4.25, 4.25],
    doors: [[0.16, 1.2], [0.5, 1.2], [0.84, 1.2]], windows: 'single', livery: 'ptv', accel: 1.35, brake: 1.6 },
  B2: { name: 'B2', L: 23.63, W: 2.67, H: 3.65, floor: 0.9, secs: [11.7, 11.7], nose: 'rake', bogies: [-8.5, 0, 8.5],
    doors: [[0.12, 1.2], [0.43, 1.2], [0.88, 1.2]], windows: 'single', livery: 'ptv', accel: 1.35, brake: 1.55 },
  C1: { name: 'C1 (Citadis 202)', L: 22.99, W: 2.65, H: 3.36, floor: 0.35, secs: [8.1, 6.6, 8.1], nose: 'round', bogies: [-6.4, 6.4],
    doors: [[0.2, 1.3], [0.5, 1.3], [0.8, 1.3]], windows: 'band', livery: 'ptv', accel: 1.57, brake: 1.2 },
  C2: { name: 'C2 (Citadis 302, "Bumblebee")', L: 32.52, W: 2.65, H: 3.27, floor: 0.35, secs: [7.6, 5.2, 6.9, 5.2, 7.6], nose: 'round', bogies: [-11.14, 0, 11.14],
    doors: [[0.08, 0.8], [0.25, 1.3], [0.42, 1.3], [0.58, 1.3], [0.75, 1.3], [0.92, 0.8]], windows: 'band', livery: 'ptv', accel: 1.03, brake: 1.39 },
  D1: { name: 'D1 (Combino, 3 modules)', L: 20.04, W: 2.65, H: 3.635, floor: 0.3, secs: [7.6, 4.8, 7.6], nose: 'flat', bogies: [-5.72, 5.72],
    doors: [[0.12, 0.8], [0.5, 1.3], [0.85, 1.3]], windows: 'big', livery: 'ptv', accel: 0.95, brake: 1.35 },
  D2: { name: 'D2 (Combino, 5 modules)', L: 29.85, W: 2.65, H: 3.635, floor: 0.3, secs: [7.6, 4.6, 5.45, 4.6, 7.6], nose: 'flat', bogies: [-10.6, 0, 10.6],
    doors: [[0.08, 0.8], [0.32, 1.3], [0.55, 1.3], [0.86, 1.3]], windows: 'big', livery: 'ptv', accel: 0.86, brake: 1.25 },
  E: { name: 'E (Flexity Swift)', L: 33.45, W: 2.65, H: 3.65, floor: 0.305, secs: [12.0, 9.45, 12.0], nose: 'round', bogies: [-12.405, -2.755, 2.765, 12.405],
    doors: [[0.08, 1.3], [0.29, 1.3], [0.5, 1.3], [0.71, 1.3], [0.92, 1.3]], windows: 'band', livery: 'ptv', accel: 1.3, brake: 1.5 },
  G: { name: 'G (Flexity 2, NGT)', L: 25.0, W: 2.65, H: 3.6, floor: 0.3, secs: [9.6, 5.8, 9.6], nose: 'round', bogies: [-7.7, 0, 7.7],
    doors: [[0.1, 0.8], [0.32, 1.3], [0.68, 1.3], [0.9, 0.8]], windows: 'band', livery: 'ptv', accel: 1.2, brake: 1.4 },
};
