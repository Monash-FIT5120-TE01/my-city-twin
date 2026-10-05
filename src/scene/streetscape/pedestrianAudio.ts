/*
 * PUSH-BUTTON SOUNDS — the Australian audio-tactile pedestrian detector (AS 2353).
 *
 * Values from an Australian supplier's data sheet (Traffic Ltd, "Audio Tactile Pedestrian Detector"):
 *   don't walk  locating tone ~1000 Hz, repetition 0.52 Hz
 *   walk        change tone (a burst at 2 kHz falling to 500 Hz), then a ~50 Hz pulse tone repeated at 8.3 Hz
 *
 * Heard only near a button: four positional sources are moved to the four nearest buttons within 25 m of
 * the camera, checked twice a second; beyond that nothing plays. Browsers allow audio only after a user
 * gesture, so the context starts on the first click or key press on the page.
 */
import { AudioListener, PositionalAudio, type Camera, type Group, type Vector3 } from 'three';

const POOL = 4, RANGE_M = 25;

export class PedestrianAudio {
  private listener: AudioListener | null = null;
  private sources: { pa: PositionalAudio; button: number; state: string | null; timer: number }[] = [];
  private buffers: Record<string, AudioBuffer> = {};
  private armed = false;
  private camera: Camera;
  private parent: Group;
  private readonly arm = () => { this.armed = true; this.unlisten(); };
  private unlisten(): void { window.removeEventListener('pointerdown', this.arm); window.removeEventListener('keydown', this.arm); }
  constructor(camera: Camera, parent: Group) {
    this.camera = camera; this.parent = parent;
    window.addEventListener('pointerdown', this.arm); window.addEventListener('keydown', this.arm);
  }
  private init(): void {
    const listener = new AudioListener(); this.camera.add(listener); this.listener = listener;
    const ctx = listener.context, sr = ctx.sampleRate;
    const buf = (secs: number, fill: (a: Float32Array) => void) => { const b = ctx.createBuffer(1, Math.round(secs * sr), sr); fill(b.getChannelData(0)); return b; };
    this.buffers.locate = buf(1 / 0.52, (a) => { const n = 0.03 * sr; for (let i = 0; i < n; i++) a[i] = Math.sin(2 * Math.PI * 1000 * i / sr) * Math.exp(-i / (0.008 * sr)) * 0.9; });
    this.buffers.pulse = buf(1 / 8.3, (a) => { const n = 0.045 * sr; for (let i = 0; i < n; i++) { const t = i / sr; a[i] = (Math.sign(Math.sin(2 * Math.PI * 50 * t)) * 0.6 + Math.sin(2 * Math.PI * 450 * t) * 0.35) * Math.min(1, i / (0.002 * sr)) * Math.exp(-i / (0.02 * sr)); } });
    this.buffers.change = buf(0.32, (a) => { let ph = 0; for (let i = 0; i < a.length; i++) { const t = i / sr, f = 500 + 1500 * Math.exp(-t / 0.07); ph += 2 * Math.PI * f / sr; a[i] = Math.sin(ph) * Math.exp(-t / 0.15) * 0.9; } });
    for (let k = 0; k < POOL; k++) {
      const pa = new PositionalAudio(listener); pa.setRefDistance(1.5); pa.setRolloffFactor(1.6); pa.setDistanceModel('exponential'); pa.setMaxDistance(RANGE_M);
      this.parent.add(pa); this.sources.push({ pa, button: -1, state: null, timer: 0 });
    }
  }
  /**
   * @param camLocal camera position in the streetscape's own frame (east, north, up from the ground)
   * @param buttons  button positions in the same frame
   * @param walkOf   whether button i currently shows walk
   */
  update(camLocal: Vector3, buttons: { pos: Vector3 }[], walkOf: (i: number) => boolean): void {
    if (!this.armed) return;
    if (!this.listener) this.init();
    const near = buttons.map((b, i) => [b.pos.distanceTo(camLocal), i] as [number, number]).filter(([d]) => d < RANGE_M).sort((a, b) => a[0] - b[0]).slice(0, POOL).map(([, i]) => i);
    // keep sources already on a near button; free the rest
    for (const s of this.sources) if (s.button >= 0 && !near.includes(s.button)) { if (s.pa.isPlaying) s.pa.stop(); s.button = -1; s.state = null; }
    for (const i of near) if (!this.sources.some((s) => s.button === i)) { const s = this.sources.find((q) => q.button < 0); if (s) { s.button = i; s.pa.position.copy(buttons[i].pos); s.state = null; } }
    for (const s of this.sources) {
      if (s.button < 0) continue;
      const want = walkOf(s.button) ? 'walk' : 'locate'; if (s.state === want) continue;
      if (s.pa.isPlaying) s.pa.stop(); window.clearTimeout(s.timer);
      if (want === 'walk' && s.state !== null) {   // change tone, then the rapid pulse
        s.pa.setBuffer(this.buffers.change); s.pa.setLoop(false); s.pa.play();
        s.timer = window.setTimeout(() => { if (s.state === 'walk') { if (s.pa.isPlaying) s.pa.stop(); s.pa.setBuffer(this.buffers.pulse); s.pa.setLoop(true); s.pa.play(); } }, 320);
      } else { s.pa.setBuffer(want === 'walk' ? this.buffers.pulse : this.buffers.locate); s.pa.setLoop(true); s.pa.play(); }
      s.state = want;
    }
  }
  dispose(): void {
    this.unlisten();   // unmounted before the first click or key: the listeners would outlive it
    for (const s of this.sources) { window.clearTimeout(s.timer); if (s.pa.isPlaying) s.pa.stop(); s.pa.removeFromParent(); }
    // three shares one AudioContext across the page: leave it open, just take the listener off the camera
    if (this.listener) this.listener.removeFromParent();
  }
}
