'use client';

/**
 * Bell-icon dropdown for the Non-User Hub top nav (Sprint-6 completion
 * §3.S6-10). Polls /api/notifications?bookingId=… at 60s when open and
 * 5min when idle. Click-outside / Escape close. "Mark all read" footer.
 *
 * `initialNotifications` is server-rendered with the page so the dropdown
 * has data on first paint without a poll.
 */

import * as React from 'react';
import {
  NotificationItem,
  type NotificationView,
} from './NotificationItem';

const POLL_OPEN_MS = 60_000;
const POLL_IDLE_MS = 5 * 60_000;

export function BellDropdown({
  bookingId,
  initialNotifications,
}: {
  bookingId: string;
  initialNotifications: NotificationView[];
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationView[]>(initialNotifications);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const unreadCount = items.filter((n) => !n.read).length;

  // Click-outside / Escape close.
  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Poll. Cadence depends on dropdown open-state.
  React.useEffect(() => {
    let cancelled = false;
    async function fetchOnce() {
      try {
        const r = await fetch(`/api/notifications?bookingId=${bookingId}`);
        if (!r.ok) return;
        const data = (await r.json()) as { notifications: NotificationView[] };
        if (!cancelled) setItems(data.notifications);
      } catch {
        // Network blip — skip this tick.
      }
    }
    const cadence = open ? POLL_OPEN_MS : POLL_IDLE_MS;
    const handle = setInterval(fetchOnce, cadence);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [open, bookingId]);

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    try {
      await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    } catch {
      // Optimistic — leave the local state read; the next poll reconciles.
    }
  }

  async function markAllRead() {
    const unread = items.filter((n) => !n.read).map((n) => n.id);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(
      unread.map((id) =>
        fetch(`/api/notifications/${id}`, { method: 'PATCH' }).catch(() => null),
      ),
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-koncie-navy/40 text-white"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span
            aria-label={`${unreadCount} unread`}
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white"
          >
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-11 z-50 max-h-[80vh] w-[min(360px,90vw)] overflow-hidden rounded-2xl border border-koncie-border bg-white shadow-lg"
        >
          <header className="flex items-center justify-between border-b border-koncie-border bg-koncie-sand px-4 py-2">
            <p className="text-sm font-semibold text-koncie-navy">
              Notifications
            </p>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-koncie-navy underline"
              >
                Mark all read
              </button>
            ) : null}
          </header>
          <ul className="max-h-[70vh] overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-koncie-charcoal/60">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={markRead}
                />
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
