/**
 * Server-rendered chat message list (Sprint-6 completion §3.S6-06).
 * Reads ChatMessage rows already loaded on the server — the chat surface
 * doesn't poll mid-session for MVP; it re-renders on form submission.
 */

import * as React from 'react';
import { EmbeddedDownloadCard } from './EmbeddedDownloadCard';
import { EmbeddedRegisterCard } from './EmbeddedRegisterCard';
import type { OriginCardKind } from '@/lib/chat/tokens';

export type MessageView = {
  id: string;
  sender: 'guest' | 'ai';
  body: string;
  attachments: Array<
    | { kind: 'download_card' }
    | { kind: 'register_cta'; reason: string }
  >;
  sentAt: Date;
};

export type MessageListContext = {
  /// Origin context that EmbeddedRegisterCard cards in this thread should
  /// carry on the bridge token. Sourced from whichever upstream surface
  /// linked into the chat (most often: a default "register-from-chat" intent
  /// because the chat-token path itself doesn't carry origin).
  defaultRegisterOrigin: {
    originCardKind: OriginCardKind;
    originModalState: Record<string, unknown>;
  };
};

export function MessageList({
  messages,
  context,
}: {
  messages: MessageView[];
  context: MessageListContext;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} context={context} />
      ))}
    </div>
  );
}

function MessageBubble({
  message,
  context,
}: {
  message: MessageView;
  context: MessageListContext;
}) {
  const isAi = message.sender === 'ai';
  return (
    <div className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
          isAi
            ? 'bg-white text-koncie-charcoal'
            : 'bg-koncie-navy text-white'
        }`}
      >
        {message.body}
      </div>
      {isAi
        ? message.attachments.map((a, i) => {
            if (a.kind === 'download_card') {
              return <EmbeddedDownloadCard key={i} />;
            }
            if (a.kind === 'register_cta') {
              return (
                <EmbeddedRegisterCard
                  key={i}
                  reason={a.reason}
                  originCardKind={context.defaultRegisterOrigin.originCardKind}
                  originModalState={
                    context.defaultRegisterOrigin.originModalState
                  }
                />
              );
            }
            return null;
          })
        : null}
    </div>
  );
}
