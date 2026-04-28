import { describe, it, expect } from 'vitest';
import { landingPathForOrigin } from './route';

describe('landingPathForOrigin', () => {
  it('routes activity to /hub/activities and embeds modal state', () => {
    const path = landingPathForOrigin({
      originCardKind: 'activity',
      originModalState: { upsellId: 'u9', step: 2 },
    });
    expect(path.startsWith('/hub/activities?st=')).toBe(true);
    const stateBlob = path.split('st=')[1]!;
    const decoded = JSON.parse(
      Buffer.from(stateBlob, 'base64url').toString('utf-8'),
    );
    expect(decoded).toEqual({ upsellId: 'u9', step: 2 });
  });

  it('routes flight/transfer/dining to /hub?modal=… with state appended', () => {
    expect(
      landingPathForOrigin({
        originCardKind: 'flight',
        originModalState: { destination: 'NAN' },
      }),
    ).toMatch(/^\/hub\?modal=flight&st=/);
    expect(
      landingPathForOrigin({
        originCardKind: 'transfer',
        originModalState: {},
      }),
    ).toMatch(/^\/hub\?modal=transfer&st=/);
    expect(
      landingPathForOrigin({
        originCardKind: 'dining',
        originModalState: {},
      }),
    ).toMatch(/^\/hub\?modal=dining&st=/);
  });
});
