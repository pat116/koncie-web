'use client';

/**
 * One row in the bell-dropdown (Sprint-6 completion §3.S6-10).
 * Title, body, optional inline CTA ("View Itinerary"), unread blue dot,
 * relative timestamp ("2h ago"). Marking-read triggers an optimistic
 * update by calling the parent.
 */

import * as React from 'react';

export type NotificationViewKind =
  | 'BOOKING_CONFIRMED'
  | 'FLIGHT_TIME_CHANGED'
  | 'WELCOME_TO_RESORT';

export type NotificationView = {
  id: string;
  kind: NotificationViewKind;
  title: string;
  body: string;
  inlineCta: { label: string; href: string } | null;
  read: boolean;
  createdAt: string; // ISO
};

const KIND_ICON: Record<NotificationViewKind, string> = {
  BOOKING_CONFIRMED: 'check',
  FLIGHT_TIME_CHANGED: 'plane',
  WELCOME_TO_RESORT: 'wave',
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(1, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: NotificationView;
  onMarkRead: (id: string) => void;
}) {
  const icon = KIND_ICON[notification.kind];
  return (
    <li
      className={`flex gap-3 border-b border-koncie-border/60 px-4 py-3 ${
        notification.read ? '' : 'bg-koncie-sand'
      }`}
    >
      <div
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-koncie-navy/10 text-xs text-koncie-navy"
      >
        {icon[0]?.toUpperCase()}
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-koncie-charcoal">
            {notification.title}
          </p>
          {!notification.read ? (
            <span
              aria-label="Unread"
              className="inline-block h-2 w-2 rounded-full bg-koncie-green-cta"
            />
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-koncie-charcoal/80">
          {notification.body}
        </p>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[11px] text-koncie-charcoal/50">
            {relativeTime(notification.createdAt)}
          </span>
          {notification.inlineCta ? (
            <a
              href={notification.inlineCta.href}
              className="text-[11px] font-medium text-koncie-navy underline"
              onClick={() => {
                if (!notification.read) onMarkRead(notification.id);
              }}
            >
              {notification.inlineCta.label}
            </a>
          ) : !notification.read ? (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="text-[11px] font-medium text-koncie-navy underline"
            >
              Mark read
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
