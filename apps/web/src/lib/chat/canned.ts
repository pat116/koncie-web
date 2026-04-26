/**
 * Canned-response selector (Sprint-6 completion §3.S6-06).
 *
 * Keyword-matched on the literal chip-text the user sent (auto-send
 * populates the input verbatim). Free-typed messages fall through to the
 * generic reply.
 */

import { DEFAULT_SUGGESTIONS } from '@/config/suggestions';
import {
  CANNED_RESPONSES,
  GENERIC_FALLBACK_BODY,
  type CannedAttachment,
  type CannedResponse,
} from '@/config/canned';

export type ResolvedCannedReply = {
  body: string;
  attachments: CannedAttachment[];
  /// `true` when we matched a chip-keyed canned response. `false` when we
  /// fell through to the generic reply (which is still a valid reply, just
  /// not chip-targeted).
  matched: boolean;
};

function chipSlugForLabel(label: string): string | null {
  const hit = DEFAULT_SUGGESTIONS.find((s) => s.label === label);
  return hit?.slug ?? null;
}

function substitute(template: string, vars: { firstName: string; propertyName: string }): string {
  return template
    .replaceAll('{firstName}', vars.firstName)
    .replaceAll('{propertyName}', vars.propertyName);
}

export function resolveCannedReply(input: {
  guestMessage: string;
  firstName: string;
  propertyName: string;
}): ResolvedCannedReply {
  const slug = chipSlugForLabel(input.guestMessage.trim());
  let canned: CannedResponse | undefined;
  if (slug) {
    canned = CANNED_RESPONSES.find((c) => c.triggerChipSlug === slug);
  }
  if (canned) {
    return {
      body: substitute(canned.body, input),
      attachments: canned.attachments ?? [],
      matched: true,
    };
  }
  return {
    body: substitute(GENERIC_FALLBACK_BODY, input),
    attachments: [],
    matched: false,
  };
}
