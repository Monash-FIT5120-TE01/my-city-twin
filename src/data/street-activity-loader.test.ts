import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStreetActivityLoader, type StreetActivityData } from './useStreetActivity';

/*
 * The snapshot and the live call finishing in every order that matters.
 * Each call is a promise the test settles by hand.
 */
const snapshot = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/street-activity.json'), 'utf-8'));
const live = { ...snapshot, takenAt: undefined, sensors: snapshot.sensors.slice(0, 5) };

function deferred() {
  let resolve!: (v: unknown) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setUp() {
  const snapshotCall = deferred();
  const liveCalls: ReturnType<typeof deferred>[] = [];
  const states: StreetActivityData[] = [];
  const loader = createStreetActivityLoader(
    {
      loadSnapshot: () => snapshotCall.promise,
      loadLive: () => {
        const call = deferred();
        liveCalls.push(call);
        return call.promise;
      },
    },
    (s) => states.push(s),
  );
  return { loader, snapshotCall, liveCalls, states };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('street activity loader', () => {
  it('shows the snapshot, then the live answer over it', async () => {
    const { loader, snapshotCall, liveCalls } = setUp();
    const started = loader.start();
    snapshotCall.resolve(snapshot);
    await flush();
    expect(loader.state.source).toBe('snapshot');
    expect(loader.state.takenAt).toBe(Date.parse(snapshot.takenAt));
    liveCalls[0].resolve(live);
    await started;
    expect(loader.state.source).toBe('live');
    expect(loader.state.activity?.sensors).toHaveLength(5);
    expect(loader.state.takenAt).toBeNull();
    expect(loader.state.refreshing).toBe(false);
  });

  it('never puts the older snapshot over a live answer that came first', async () => {
    const { loader, snapshotCall, liveCalls } = setUp();
    const started = loader.start();
    loader.refresh();
    liveCalls[0].resolve(live);
    await flush();
    expect(loader.state.source).toBe('live');
    snapshotCall.resolve(snapshot);
    await flush();
    expect(loader.state.source).toBe('live');
    // The start's own live call is the one already made, or a fresh one.
    liveCalls.at(-1)?.resolve(live);
    await started;
    expect(loader.state.source).toBe('live');
  });

  it('does not call it failed when a refresh fails before the snapshot arrives', async () => {
    const { loader, snapshotCall, liveCalls } = setUp();
    const started = loader.start();
    const refreshed = loader.refresh();
    liveCalls[0].reject(new Error('offline'));
    await refreshed;
    expect(loader.state.failed).toBe(false);
    snapshotCall.resolve(snapshot);
    await flush();
    expect(loader.state.source).toBe('snapshot');
    expect(loader.state.failed).toBe(false);
    liveCalls.at(-1)?.reject(new Error('offline'));
    await started;
    expect(loader.state.source).toBe('snapshot');
    expect(loader.state.failed).toBe(false);
  });

  it('calls it failed only when both have finished with nothing', async () => {
    const { loader, snapshotCall, liveCalls } = setUp();
    const started = loader.start();
    snapshotCall.reject(new Error('missing'));
    await flush();
    expect(loader.state.failed).toBe(false);
    liveCalls[0].reject(new Error('offline'));
    await started;
    expect(loader.state.failed).toBe(true);
    expect(loader.state.activity).toBeNull();
  });

  it('makes one live call however often refresh is pressed', async () => {
    const { loader, liveCalls } = setUp();
    loader.refresh();
    loader.refresh();
    loader.refresh();
    expect(liveCalls).toHaveLength(1);
  });

  it('ignores a live answer of the wrong shape', async () => {
    const { loader, snapshotCall, liveCalls } = setUp();
    const started = loader.start();
    snapshotCall.resolve(snapshot);
    await flush();
    liveCalls[0].resolve({ sensors: 'nope' });
    await started;
    expect(loader.state.source).toBe('snapshot');
  });
});
