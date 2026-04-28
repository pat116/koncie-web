/**
 * TimestampDivider — centered timestamp between message groups.
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.5.
 *
 * Inserted by MessageList between two consecutive messages whose
 * `sentAt` differs by more than 5 minutes. Label resolution:
 *
 *   < 1 min                → "Just now"
 *   < 1 hour               → "5 min", "12 min" (no "ago")
 *   today                  → "Today 4:30 PM"
 *   yesterday              → "Yesterday 9:15 AM"
 *   older                  → "Mar 12, 4:30 PM"
 *
 * Pure render — `now` is exposed as a prop so tests can pin time without
 * patching Date.now globally.
 */

import * as React from 'react';
import { format, isSameDay } from 'date-fns';

/**
 * Pure label resolver — split out so the test suite can branch-cover
 * the time ranges without mounting React. Exported for tests.
 *
 * The 1-59min branch computes the duration directly off `now` rather than
 * delegating to date-fns' `formatDistanceToNowStrict` (which ignores any
 * injected `now` and uses the real system clock — would make tests
 * non-deterministic).
 */
export function resolveDividerLabel(at: Date, now: Date): string {
  const ageMs = now.getTime() - at.getTime();
  if (ageMs < 60_000) {
    return 'Just now';
  }
  if (ageMs < 3_600_000) {
    const minutes = Math.floor(ageMs / 60_000);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  if (isSameDay(at, now)) {
    return `Today ${format(at, 'h:mm a')}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(at, yesterday)) {
    return `Yesterday ${format(at, 'h:mm a')}`;
  }
  return format(at, 'MMM d, h:mm a');
}

export function TimestampDivider({
  at,
  now = new Date(),
}: {
  at: Date;
  now?: Date;
}) {
  const label = resolveDividerLabel(at, now);

  return (
    <div className="flex items-center justify-center py-2">
      <span
        className="
          text-[var(--chat-text-meta-divider)]
          font-medium uppercase tracking-wider
          text-[var(--chat-meta-text)]
        "
      >
        {label}
      </span>
    </div>
  );
}
