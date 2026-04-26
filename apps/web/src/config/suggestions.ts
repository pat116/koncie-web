/**
 * Default 6-chip suggestion set for the /c/[token] chat surface (Sprint-6
 * completion §3.S6-06). Per-resort overrides are deferred — the schema
 * accepts an optional `resortId` field so the migration path stays clean,
 * but the resolver only reads the `default` set for MVP.
 */

export type SuggestionChip = {
  slug: string;
  label: string;
  /// MVP: ignored. Phase-2 resolver will scope by resort.
  resortId?: string;
};

export const DEFAULT_SUGGESTIONS: SuggestionChip[] = [
  { slug: 'surf', label: "How's the surf today?" },
  { slug: 'nearby_food', label: "What's a good place to eat nearby?" },
  { slug: 'airport_pickup', label: 'Can you arrange airport pickup?' },
  { slug: 'activities', label: 'What activities do you recommend?' },
  { slug: 'spa', label: 'Can I book a spa treatment?' },
  { slug: 'weather', label: "What's the weather like tomorrow?" },
];
