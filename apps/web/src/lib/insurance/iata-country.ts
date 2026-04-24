/**
 * Minimal IATA airport code → ISO-3166 alpha-2 country lookup for the insurance
 * quote input. Distinct from @/lib/flights/iata which maps to city labels —
 * insurance sizing cares about country-of-travel (risk class), not city copy.
 *
 * Keep this list pilot-scoped. Extend when a new destination enters the pilot.
 */
export const IATA_TO_COUNTRY: Record<string, string> = {
  NAN: 'FJ', // Fiji — pilot
  SUV: 'FJ', // Fiji — pilot
  SYD: 'AU', // Used only as origin; unlikely to be destination in pilot
};

export function countryFromIata(code: string): string | undefined {
  return IATA_TO_COUNTRY[code];
}
