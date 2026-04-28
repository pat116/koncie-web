import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { EmbeddedCardShell } from '../EmbeddedCardShell';

function render(props: {
  eyebrow: string;
  title: string;
  body: React.ReactNode;
  children: React.ReactNode;
}) {
  return renderToStaticMarkup(React.createElement(EmbeddedCardShell, props));
}

describe('EmbeddedCardShell', () => {
  it('wires eyebrow, title, body, and children into the shell', () => {
    const html = render({
      eyebrow: 'Get the app',
      title: 'Koncie in your pocket',
      body: 'Live forecasts and bookings.',
      children: React.createElement('a', { href: '#dl' }, 'App Store'),
    });
    expect(html).toContain('Get the app');
    expect(html).toContain('Koncie in your pocket');
    expect(html).toContain('Live forecasts and bookings.');
    expect(html).toContain('href="#dl"');
    expect(html).toContain('App Store');
  });

  it('aligns left at max-w-[78%] (matches AI bubble alignment)', () => {
    const html = render({
      eyebrow: 'x',
      title: 'y',
      body: 'z',
      children: null,
    });
    expect(html).toContain('max-w-[78%]');
  });

  it('uses card-shape tokens (smaller radius than bubbles)', () => {
    const html = render({
      eyebrow: 'x',
      title: 'y',
      body: 'z',
      children: null,
    });
    expect(html).toContain('rounded-[var(--chat-card-radius)]');
    expect(html).toContain('bg-[var(--chat-card-bg)]');
    expect(html).toContain('border-[var(--chat-card-border)]');
  });

  it('renders children inside the CTA row', () => {
    const html = render({
      eyebrow: 'x',
      title: 'y',
      body: 'z',
      children: [
        React.createElement('button', { key: 'a' }, 'One'),
        React.createElement('button', { key: 'b' }, 'Two'),
      ],
    });
    expect(html).toContain('One');
    expect(html).toContain('Two');
  });
});
