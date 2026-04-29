/**
 * Sprint 7 — Trip origin airport inference (S7-12).
 *
 * Maps a guest home address → IATA. Sprint 7 ships AU-only coverage; per
 * kickoff §6 #2 lock the mapping lives as in-repo JSON. Promoted to a DB
 * table in Sprint 9 if coverage grows beyond AU.
 *
 * Failure mode is benign — `null` return means "couldn't infer", and
 * Trip.originAirportIata is nullable in the schema.
 */

import postcodeToAirport from './postcodeToAirport.json';

export interface AddressInput {
  country?: string | null;
  stateOrRegion?: string | null;
  city?: string | null;
  postcode?: string | null;
  line1?: string | null;
  line2?: string | null;
}

/**
 * Infer the IATA code of the airport closest to the guest's home, given
 * a parsed address. Returns null when:
 *   - country is not AU (no mapping for non-AU pilot guests yet)
 *   - postcode is missing or doesn't match the prefix table
 *   - address itself is null/undefined
 *
 * Match is on the FIRST TWO digits of the postcode — AU postcodes are
 * 4 digits and the major-airport mapping is two-digit-prefix coarse.
 */
export function inferOriginAirportIata(
  address: AddressInput | null | undefined,
): string | null {
  if (!address) return null;
  const country = address.country?.toUpperCase().trim() ?? '';
  if (country !== 'AU' && country !== 'AUSTRALIA') return null;
  const postcode = address.postcode?.trim() ?? '';
  if (!/^\d{4}$/.test(postcode)) return null;
  const prefix = postcode.slice(0, 2);
  const map = postcodeToAirport as Record<string, string>;
  const iata = map[prefix];
  return iata ?? null;
}
