import { describe, it, expect, vi } from 'vitest';
import {
  kebabCase,
  scrubProfanity,
  generateTripSlug,
} from '../slug';
import { isProfaneToken, profanityStubFor } from '../profanity';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mockTx(takenSlugs: ReadonlySet<string>) {
  return {
    trip: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
        return takenSlugs.has(where.slug) ? { id: 'existing' } : null;
      }),
    },
  } as any;
}

describe('kebabCase', () => {
  it('lowercases, slugifies, collapses, and trims', () => {
    expect(kebabCase('Namotu Island Fiji')).toBe('namotu-island-fiji');
    expect(kebabCase("D'Aguilar's Inn  & Spa")).toBe('d-aguilar-s-inn-spa');
    expect(kebabCase('---trim me---')).toBe('trim-me');
    expect(kebabCase('Multi   space')).toBe('multi-space');
  });

  it('truncates to 60 chars', () => {
    const long = 'A'.repeat(120);
    const slug = kebabCase(long);
    expect(slug).toHaveLength(60);
    expect(slug).toBe('a'.repeat(60));
  });

  it('strips diacritics so accented letters fold to ASCII', () => {
    expect(kebabCase('Café Crème')).toBe('cafe-creme');
  });
});

describe('profanity filter', () => {
  it('matches deny-list tokens case-insensitively', () => {
    expect(isProfaneToken('shit')).toBe(true);
    expect(isProfaneToken('SHIT')).toBe(true);
    expect(isProfaneToken('Shit')).toBe(true);
  });

  it('does not match common geographic / brand tokens', () => {
    expect(isProfaneToken('namotu')).toBe(false);
    expect(isProfaneToken('island')).toBe(false);
    expect(isProfaneToken('fiji')).toBe(false);
    expect(isProfaneToken('koncie')).toBe(false);
  });

  it('produces deterministic 4-char hex stubs', () => {
    const stub = profanityStubFor('shit');
    expect(stub).toMatch(/^[0-9a-f]{4}$/);
    expect(profanityStubFor('shit')).toBe(stub); // stable
    expect(profanityStubFor('Shit')).not.toBe(stub); // case-sensitive in stub
  });
});

describe('scrubProfanity', () => {
  it('replaces profane tokens with hex stubs, keeps the rest', () => {
    const out = scrubProfanity('shit-island-resort');
    expect(out).toMatch(/^[0-9a-f]{4}-island-resort$/);
  });

  it('passes a clean slug through unchanged', () => {
    expect(scrubProfanity('namotu-island-fiji')).toBe('namotu-island-fiji');
  });
});

describe('generateTripSlug', () => {
  it('returns the bare base when free', async () => {
    const tx = mockTx(new Set());
    const slug = await generateTripSlug({
      propertyName: 'Namotu Island Fiji',
      tx,
    });
    expect(slug).toBe('namotu-island-fiji');
    expect(tx.trip.findUnique).toHaveBeenCalledTimes(1);
  });

  it('appends -2 when the base is taken', async () => {
    const tx = mockTx(new Set(['namotu-island-fiji']));
    const slug = await generateTripSlug({
      propertyName: 'Namotu Island Fiji',
      tx,
    });
    expect(slug).toBe('namotu-island-fiji-2');
    expect(tx.trip.findUnique).toHaveBeenCalledTimes(2);
  });

  it('appends -3 when the base and -2 are taken', async () => {
    const tx = mockTx(
      new Set(['namotu-island-fiji', 'namotu-island-fiji-2']),
    );
    const slug = await generateTripSlug({
      propertyName: 'Namotu Island Fiji',
      tx,
    });
    expect(slug).toBe('namotu-island-fiji-3');
  });

  it('replaces profane tokens with hex stubs in the final slug', async () => {
    const tx = mockTx(new Set());
    const slug = await generateTripSlug({
      propertyName: 'Shit Beach Resort',
      tx,
    });
    expect(slug).toMatch(/^[0-9a-f]{4}-beach-resort$/);
    expect(slug.startsWith('shit-')).toBe(false);
  });

  it('truncates input >60 chars before scrubbing', async () => {
    const tx = mockTx(new Set());
    const slug = await generateTripSlug({
      propertyName: 'A'.repeat(120),
      tx,
    });
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toBe('a'.repeat(60));
  });

  it('throws on empty input — silent UUID fallback would mask bugs', async () => {
    const tx = mockTx(new Set());
    await expect(
      generateTripSlug({ propertyName: '   ', tx }),
    ).rejects.toThrow(/empty/);
  });

  it('throws after 1000 exhausted suffixes — implausible at pilot scale', async () => {
    const taken = new Set<string>();
    taken.add('namotu-island-fiji');
    for (let n = 2; n < 1001; n += 1) taken.add(`namotu-island-fiji-${n}`);
    const tx = mockTx(taken);
    await expect(
      generateTripSlug({ propertyName: 'Namotu Island Fiji', tx }),
    ).rejects.toThrow(/exhausted/);
  });
});
