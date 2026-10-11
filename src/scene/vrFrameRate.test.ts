import { describe, expect, it, vi } from 'vitest';
import { preferFrameRate } from './vrFrameRate';

const session = (rates: number[] | undefined) => {
  const updateTargetFrameRate = vi.fn(() => Promise.resolve());
  return { session: { supportedFrameRates: rates ? new Float32Array(rates) : undefined, updateTargetFrameRate } as unknown as XRSession, updateTargetFrameRate };
};

describe('the headset frame rate', () => {
  it('asks for 72 Hz when the headset offers it', () => {
    const { session: s, updateTargetFrameRate } = session([72, 80, 90, 120]);
    preferFrameRate(s);
    expect(updateTargetFrameRate).toHaveBeenCalledWith(72);
  });

  it('otherwise takes the lowest rate that is still smooth', () => {
    const { session: s, updateTargetFrameRate } = session([30, 90, 120]);
    preferFrameRate(s);
    expect(updateTargetFrameRate).toHaveBeenCalledWith(90);
  });

  it('leaves a headset that reports no rates alone', () => {
    const { session: s, updateTargetFrameRate } = session(undefined);
    preferFrameRate(s);
    expect(updateTargetFrameRate).not.toHaveBeenCalled();
  });
});
