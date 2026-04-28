/**
 * Canned-response config for the chat surface (Sprint-6 completion §3.S6-06).
 *
 * Three of the six default chips have hard-coded responses (surf,
 * nearby_food, airport_pickup). The remaining three (activities, spa,
 * weather) intentionally fall through to a generic reply for MVP — they're
 * a quality-bar upgrade for Phase 2's live LLM.
 */

export type CannedAttachment =
  | { kind: 'download_card' }
  | { kind: 'register_cta'; reason: string };

export type CannedResponse = {
  triggerChipSlug: string;
  body: string; // may contain {firstName} or {propertyName} substitutions
  attachments?: CannedAttachment[];
};

export const CANNED_RESPONSES: CannedResponse[] = [
  {
    triggerChipSlug: 'surf',
    body:
      "Surf at {propertyName} is firing today, {firstName} — clean 4ft waves with light offshore winds. " +
      'The Koncie app gives you live forecasts and lets you book a coaching session straight from your phone.',
    attachments: [{ kind: 'download_card' }],
  },
  {
    triggerChipSlug: 'nearby_food',
    body:
      "{propertyName}'s restaurant runs all-inclusive plus optional private dining. " +
      'To browse the dining packages and add them to your trip, create a Koncie account — it takes 30 seconds.',
    attachments: [{ kind: 'register_cta', reason: 'dining_package_browse' }],
  },
  {
    triggerChipSlug: 'airport_pickup',
    body:
      'Yes — boat transfer from Nadi airport is included in every {propertyName} stay, ' +
      "and we'll confirm pickup details closer to your check-in. Get the app for live transfer status.",
    attachments: [{ kind: 'download_card' }],
  },
];

export const GENERIC_FALLBACK_BODY =
  "Thanks {firstName} — let me get a human teammate to help with that one. " +
  "They'll reach out shortly.";
