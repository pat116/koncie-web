/**
 * Minimal IATA airport code → city label lookup. Used by the contextual-offer
 * resolver to produce destination-aware copy ("covers your flight to Nadi").
 *
 * Keep this list short and pilot-scoped. Extending requires product input on
 * which cities we're willing to surface in offer copy. Sprint-N either
 * replaces this with a proper reference table or imports from a maintained
 * package (e.g. iata-tz-map).
 */
export const IATA_TO_CITY: Record<string, string> = {
  NAN: 'Nadi',
  SUV: 'Suva',
  SYD: 'Sydney',
};

export function cityFromIata(code: string): string | undefined {
  return IATA_TO_CITY[code];
}
