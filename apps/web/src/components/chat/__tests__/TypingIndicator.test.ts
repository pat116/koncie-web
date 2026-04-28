import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { TypingIndicator } from '../TypingIndicator';

describe('TypingIndicator', () => {
  const html = renderToStaticMarkup(React.createElement(TypingIndicator));

  it('renders three animated dot spans (one per keyframe-delay variant)', () => {
    expect(html).toContain('animate-chat-typing-dot-1');
    expect(html).toContain('animate-chat-typing-dot-2');
    expect(html).toContain('animate-chat-typing-dot-3');
  });

  it('exposes an aria-label so screen readers announce the typing state', () => {
    expect(html).toContain('aria-label="Concierge is typing"');
  });

  it('uses the AI bubble token surface (white bg + tail bottom-left)', () => {
    expect(html).toContain('bg-[var(--chat-bubble-ai)]');
    expect(html).toContain('rounded-bl-[var(--chat-bubble-tail-radius)]');
  });
});
