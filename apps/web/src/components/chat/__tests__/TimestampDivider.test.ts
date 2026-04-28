import { describe, it, expect } from 'vitest';
import { resolveDividerLabel } from '../TimestampDivider';

const NOW = new Date('2026-04-28T12:00:00');

describe('resolveDividerLabel', () => {
  it('returns "Just now" for messages < 60s old', () => {
    const at = new Date(NOW.getTime() - 30 * 1000);
    expect(resolveDividerLabel(at, NOW)).toBe('Just now');
  });

  it('returns a relative duration for 1-59 minute gaps', () => {
    const at = new Date(NOW.getTime() - 12 * 60 * 1000);
    expect(resolveDividerLabel(at, NOW)).toMatch(/12 minutes?/);
  });

  it('formats today timestamps as "Today h:mm a"', () => {
    const at = new Date('2026-04-28T08:30:00');
    expect(resolveDividerLabel(at, NOW)).toMatch(/^Today /);
    expect(resolveDividerLabel(at, NOW)).toContain('8:30');
  });

  it('formats yesterday timestamps as "Yesterday h:mm a"', () => {
    const at = new Date('2026-04-27T18:15:00');
    expect(resolveDividerLabel(at, NOW)).toMatch(/^Yesterday /);
    expect(resolveDividerLabel(at, NOW)).toContain('6:15');
  });

  it('formats older timestamps as "MMM d, h:mm a"', () => {
    const at = new Date('2026-03-12T09:45:00');
    expect(resolveDividerLabel(at, NOW)).toMatch(/^Mar 12, /);
    expect(resolveDividerLabel(at, NOW)).toContain('9:45');
  });
});
