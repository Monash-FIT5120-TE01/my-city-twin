/*
 * ─────────────────────────────────────────────────────────────────────────
 * A TEMPORARY LOG FOR THE HEADSET — ONLY WITH ?vrdebug IN THE ADDRESS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   Some failures happen only on the headset: the emulator on a desktop runs
 *   the same code and is fine, the headset shows black from the moment the
 *   session starts, and inside a headset there is no console to read. This
 *   writes down what the headset did — errors, the WebGL context going, the
 *   session starting and ending, whether frames were drawn — and shows it on
 *   the page once the reader is back out of VR.
 *
 *   It is how the black screen of 2026-09-28 was found (an SVG component
 *   that threw only on the headset), and it is meant to be removed again once
 *   the cause is known — it is not a feature.
 *
 * HOW
 *   Loaded by main.tsx only when the address has ?vrdebug. Keeps the last
 *   entries in this browser's storage as well, so leaving VR through the
 *   headset's own menu, or the page reloading, does not lose them.
 */

import { xrStore } from './scene/xrStore';

const KEY = 'vrdebug-log';
const MAX = 400;
let lines: string[] = [];
let box: HTMLPreElement | null = null;
const started = performance.now();

function stamp() {
  return `${((performance.now() - started) / 1000).toFixed(2)}s`;
}

function show() {
  if (box) box.textContent = lines.join('\n');
}

export function log(text: string) {
  lines.push(`${stamp()}  ${text}`);
  if (lines.length > MAX) lines = lines.slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Storage may be unavailable; the page still shows what it has.
  }
  show();
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}${value.stack ? `\n    ${value.stack.split('\n').slice(1, 16).join('\n    ')}` : ''}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function overlay() {
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:2147483647;width:min(720px,calc(100vw - 16px));max-height:45vh;display:flex;flex-direction:column;' +
    'background:#16181a;color:#f3f5f2;border-radius:10px;font:12px/1.4 ui-monospace,Consolas,monospace;box-shadow:0 8px 24px rgba(0,0,0,.4)';
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid #444';
  const title = document.createElement('strong');
  title.textContent = 'VR debug log';
  title.style.flex = '1';
  const button = (label: string, act: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:inherit;padding:4px 10px;border-radius:6px;border:1px solid #888;background:#2a2e33;color:#fff;cursor:pointer';
    b.onclick = act;
    return b;
  };
  const copy = button('Copy', () => {
    void navigator.clipboard?.writeText(lines.join('\n')).then(() => (copy.textContent = 'Copied'));
  });
  const clear = button('Clear', () => {
    lines = [];
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
    show();
  });
  bar.append(title, copy, clear);
  box = document.createElement('pre');
  box.style.cssText = 'margin:0;padding:8px 10px;overflow:auto;white-space:pre-wrap;word-break:break-word';
  panel.append(bar, box);
  document.body.append(panel);
  show();
}

/** Watch every canvas the page makes for its WebGL context being lost. */
function watchCanvases() {
  const seen = new WeakSet<HTMLCanvasElement>();
  const attach = () => {
    document.querySelectorAll('canvas').forEach((canvas) => {
      if (seen.has(canvas)) return;
      seen.add(canvas);
      canvas.addEventListener('webglcontextlost', (event) => log(`WEBGL CONTEXT LOST on a ${canvas.width}x${canvas.height} canvas (${(event as WebGLContextEvent).statusMessage || 'no message'})`));
      canvas.addEventListener('webglcontextrestored', () => log('webgl context restored'));
    });
  };
  attach();
  new MutationObserver(attach).observe(document.body, { childList: true, subtree: true });
}

const attached = new WeakSet<XRSession>();

/** How a session is set up, whether frames are drawn, and how it ends. */
function attachSession(session: XRSession, how: string) {
  if (attached.has(session)) return;
  attached.add(session);
  const state = session.renderState as XRRenderState & { layers?: unknown[] };
  log(`session started (${how}): blend=${session.environmentBlendMode ?? '?'} depthNear=${state.depthNear} depthFar=${state.depthFar} baseLayer=${Boolean(state.baseLayer)} layers=${state.layers?.length ?? 0}`);
  const rates = (session as XRSession & { supportedFrameRates?: Float32Array; frameRate?: number }).supportedFrameRates;
  log(`frame rates offered: ${rates ? Array.from(rates).join(', ') : 'not reported'}`);
  session.addEventListener('frameratechange', () => log(`frame rate now: ${(session as XRSession & { frameRate?: number }).frameRate}`));
  session.addEventListener('end', () => log('session ended'));
  session.addEventListener('visibilitychange', () => log(`session visibility: ${session.visibilityState}`));
  let frames = 0;
  const tick = (_time: number, frame: XRFrame) => {
    frames += 1;
    if (frames === 1) {
      const rs = frame.session.renderState as XRRenderState & { layers?: unknown[] };
      log(`first XR frame: depthFar=${rs.depthFar} baseLayer=${Boolean(rs.baseLayer)} layers=${rs.layers?.length ?? 0}`);
    }
    if (frames === 30 || frames % 600 === 0) log(`XR frames so far: ${frames}`);
    frame.session.requestAnimationFrame(tick);
  };
  session.requestAnimationFrame(tick);
}

/** Note each XR session, whichever way it is reached first. */
function watchSessions() {
  // Through the app's own store, which holds the session it is using.
  xrStore().subscribe((state, previous) => {
    if (state.session && state.session !== previous.session) attachSession(state.session, 'store');
  });
  const xr = (navigator as Navigator & { xr?: { requestSession?: (...args: unknown[]) => Promise<XRSession> } }).xr;
  if (!xr?.requestSession) {
    log('navigator.xr.requestSession is not available');
    return;
  }
  const original = xr.requestSession.bind(xr);
  xr.requestSession = async (...args: unknown[]) => {
    log(`requestSession(${describe(args)})`);
    try {
      const session = await original(...args);
      attachSession(session, 'requestSession');
      return session;
    } catch (error) {
      log(`requestSession failed: ${describe(error)}`);
      throw error;
    }
  };
}

export function installVrDebug() {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
    if (kept.length) lines = [...kept, '— page loaded again —'];
  } catch {
    // Nothing kept, or storage unavailable.
  }
  log(`vrdebug on: ${navigator.userAgent}`);
  window.addEventListener('error', (event) => log(`ERROR: ${describe(event.error ?? event.message)}`));
  window.addEventListener('unhandledrejection', (event) => log(`UNHANDLED: ${describe(event.reason)}`));
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      log(`console.${level}: ${args.map(describe).join(' ').slice(0, 1200)}`);
      original(...args);
    };
  }
  const start = () => {
    overlay();
    watchCanvases();
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start);
  watchSessions();
}
