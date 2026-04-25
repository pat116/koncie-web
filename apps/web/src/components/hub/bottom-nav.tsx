'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/hub', label: 'Home', enabled: true },
  { href: '/hub/trip', label: 'Trip', enabled: true },
  { href: '/hub/messages', label: 'Messages', enabled: false },
  { href: '/hub/profile', label: 'Profile', enabled: true },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hub primary navigation"
      className="fixed inset-x-0 bottom-0 flex border-t border-koncie-border bg-white"
    >
      {ITEMS.map((item) => {
        const active = pathname === item.href;
        const cls = `flex-1 py-3 text-center text-xs ${
          active ? 'font-semibold text-koncie-green-cta' : 'text-koncie-charcoal/70'
        } ${!item.enabled ? 'opacity-50' : ''}`;
        return item.enabled ? (
          <Link
            key={item.href}
            href={item.href}
            className={cls}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.href}
            className={cls}
            aria-disabled="true"
            title="Available closer to your trip"
          >
            {item.label}
          </span>
        );
      })}
    </nav>
  );
}
