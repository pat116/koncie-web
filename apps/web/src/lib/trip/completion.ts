/**
 * Sprint 7 — Trip completion percent (S7-10).
 *
 * Pure function. Spec doc §4.3 weighting.
 */

const PREP_STEP_KEYS = [
  'documents',
  'health',
  'weather',
  'currency',
  'customs',
] as const;
type PrepKey = (typeof PREP_STEP_KEYS)[number];

const ANCILLARY_KINDS = ['ACTIVITY', 'TRANSFER', 'DINING'] as const;

export interface CompletionInput {
  trip: {
    flightBookingId: string | null;
    preparationStatus: unknown; // Json — { [key]: { status: PreparationStepStatus } }
  };
  cart: {
    items: Array<{ kind: string }>;
  } | null;
}

/**
 * Returns 0-100. Round-half-to-even per `Math.round` default.
 */
export function computeCompletionPercent(input: CompletionInput): number {
  const prep = computePrepCompletion(input.trip.preparationStatus);
  const cartC = computeCartCompletion(input.cart);
  const flight = computeFlightCompletion(input.trip.flightBookingId, input.cart);
  return Math.round(100 * (0.5 * prep + 0.3 * cartC + 0.2 * flight));
}

/** Exported for testing. count(steps in {COMPLETE, NA}) / 5. */
export function computePrepCompletion(rawStatus: unknown): number {
  if (!rawStatus || typeof rawStatus !== 'object') return 0;
  const status = rawStatus as Record<string, { status?: string } | undefined>;
  let done = 0;
  for (const key of PREP_STEP_KEYS) {
    const slot = status[key as PrepKey];
    if (slot && (slot.status === 'COMPLETE' || slot.status === 'NA')) {
      done += 1;
    }
  }
  return done / PREP_STEP_KEYS.length;
}

/** min(1, distinct_kinds_with_≥1_item / 3) over ANCILLARY_KINDS. */
export function computeCartCompletion(
  cart: { items: Array<{ kind: string }> } | null,
): number {
  if (!cart) return 0;
  const distinct = new Set<string>();
  for (const item of cart.items) {
    if (ANCILLARY_KINDS.includes(item.kind as never)) {
      distinct.add(item.kind);
    }
  }
  return Math.min(1, distinct.size / ANCILLARY_KINDS.length);
}

/** Trip.flightBookingId set OR any cart line of kind=FLIGHT → 1, else 0. */
export function computeFlightCompletion(
  flightBookingId: string | null,
  cart: { items: Array<{ kind: string }> } | null,
): number {
  if (flightBookingId) return 1;
  if (cart && cart.items.some((i) => i.kind === 'FLIGHT')) return 1;
  return 0;
}
