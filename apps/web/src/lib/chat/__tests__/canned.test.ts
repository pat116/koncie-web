import { describe, it, expect } from 'vitest';
import { resolveCannedReply } from '../canned';

describe('resolveCannedReply', () => {
  it('matches the surf chip and returns a download_card attachment', () => {
    const r = resolveCannedReply({
      guestMessage: "How's the surf today?",
      firstName: 'Pat',
      propertyName: 'Namotu',
    });
    expect(r.matched).toBe(true);
    expect(r.body).toContain('Pat');
    expect(r.body).toContain('Namotu');
    expect(r.attachments).toEqual([{ kind: 'download_card' }]);
  });

  it('matches the nearby_food chip and returns a register_cta attachment', () => {
    const r = resolveCannedReply({
      guestMessage: "What's a good place to eat nearby?",
      firstName: 'Pat',
      propertyName: 'Namotu',
    });
    expect(r.matched).toBe(true);
    expect(r.attachments).toEqual([
      { kind: 'register_cta', reason: 'dining_package_browse' },
    ]);
  });

  it('matches the airport_pickup chip with a download_card', () => {
    const r = resolveCannedReply({
      guestMessage: 'Can you arrange airport pickup?',
      firstName: 'Pat',
      propertyName: 'Namotu',
    });
    expect(r.matched).toBe(true);
    expect(r.attachments).toEqual([{ kind: 'download_card' }]);
  });

  it('falls through to the generic reply for activities/spa/weather chips (Phase-2)', () => {
    for (const label of [
      'What activities do you recommend?',
      'Can I book a spa treatment?',
      "What's the weather like tomorrow?",
    ]) {
      const r = resolveCannedReply({
        guestMessage: label,
        firstName: 'Pat',
        propertyName: 'Namotu',
      });
      expect(r.matched).toBe(false);
      expect(r.attachments).toEqual([]);
      expect(r.body).toContain('Pat');
    }
  });

  it('falls through for free-typed messages that do not exactly match a chip label', () => {
    const r = resolveCannedReply({
      guestMessage: 'is the surf good',
      firstName: 'Pat',
      propertyName: 'Namotu',
    });
    expect(r.matched).toBe(false);
    expect(r.body).toContain('human teammate');
  });

  it('substitutes propertyName when present in the canned body', () => {
    const r = resolveCannedReply({
      guestMessage: "How's the surf today?",
      firstName: 'Jane',
      propertyName: 'Likuliku',
    });
    expect(r.body).toContain('Likuliku');
    expect(r.body).not.toContain('{propertyName}');
  });
});
