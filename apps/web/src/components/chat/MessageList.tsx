/**
 * Server-rendered chat message list (Sprint-6 + 2026-04-28 polish).
 * Source: Planning/2026-04-28-chat-ui-polish-brief.md §2.2.
 *
 * Sender-grouping rules (mirror the brief; tracked here so a future
 * tweak doesn't drift from the spec):
 *  - Same sender within 60s = tight gap (--chat-bubble-gap).
 *  - Sender changes / >60s gap = group gap (--chat-bubble-group-gap).
 *  - Tail (asymmetric corner radius) appears ONLY on the last bubble in
 *    a same-sender streak. Earlier bubbles in the streak use full radius
 *    on all four corners — keeps "the tail points at the speaker once".
 *  - When two consecutive messages span >5 min, a TimestampDivider is
 *    inserted between them.
 *  - Under the LAST guest bubble in a streak, when followed by an AI
 *    message, a small "Delivered" caption renders right-aligned.
 *
 * The list is a Server Component — no `pending` state lives here. The
 * typing indicator is rendered separately by MessageInput per option (b)
 * in brief §6.
 */

import * as React from 'react';
import { EmbeddedDownloadCard } from './EmbeddedDownloadCard';
import { EmbeddedRegisterCard } from './EmbeddedRegisterCard';
import { TimestampDivider } from './TimestampDivider';
import type { OriginCardKind } from '@/lib/chat/tokens';

const SAME_SENDER_GROUP_MS = 60_000;
const TIMESTAMP_DIVIDER_GAP_MS = 5 * 60_000;

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

type Decoration = {
  isLastInStreak: boolean;
  isStartOfStreak: boolean;
  showTail: boolean;
  showDivider: boolean;
  showDeliveredCaption: boolean;
};

function decorate(messages: MessageView[]): Decoration[] {
  return messages.map((msg, i) => {
    const next = messages[i + 1] ?? null;
    const prev = messages[i - 1] ?? null;

    const sameSenderAsNext =
      next != null &&
      next.sender === msg.sender &&
      next.sentAt.getTime() - msg.sentAt.getTime() <= SAME_SENDER_GROUP_MS;
    const sameSenderAsPrev =
      prev != null &&
      prev.sender === msg.sender &&
      msg.sentAt.getTime() - prev.sentAt.getTime() <= SAME_SENDER_GROUP_MS;

    const isLastInStreak = !sameSenderAsNext;
    const isStartOfStreak = !sameSenderAsPrev;

    const showTail = isLastInStreak;
    const showDivider =
      prev != null &&
      msg.sentAt.getTime() - prev.sentAt.getTime() > TIMESTAMP_DIVIDER_GAP_MS;
    const showDeliveredCaption =
      msg.sender === 'guest' && isLastInStreak && next?.sender === 'ai';

    return {
      isLastInStreak,
      isStartOfStreak,
      showTail,
      showDivider,
      showDeliveredCaption,
    };
  });
}

export function MessageList({
  messages,
  context,
}: {
  messages: MessageView[];
  context: MessageListContext;
}) {
  const decorations = decorate(messages);
  return (
    <div className="flex flex-col px-4 py-4">
      {messages.map((m, i) => {
        const d = decorations[i]!;
        return (
          <React.Fragment key={m.id}>
            {d.showDivider ? <TimestampDivider at={m.sentAt} /> : null}
            <MessageBubble
              message={m}
              context={context}
              decoration={d}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MessageBubble({
  message,
  context,
  decoration,
}: {
  message: MessageView;
  context: MessageListContext;
  decoration: Decoration;
}) {
  const isAi = message.sender === 'ai';
  const { showTail, isLastInStreak, showDeliveredCaption } = decoration;

  const containerSpacing = isLastInStreak
    ? 'mt-0 mb-[var(--chat-bubble-group-gap)]'
    : 'mt-0 mb-[var(--chat-bubble-gap)]';

  const radiusClasses = [
    'rounded-[var(--chat-bubble-radius)]',
    showTail
      ? isAi
        ? 'rounded-bl-[var(--chat-bubble-tail-radius)]'
        : 'rounded-br-[var(--chat-bubble-tail-radius)]'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const surfaceClasses = isAi
    ? 'bg-[var(--chat-bubble-ai)] text-[var(--chat-bubble-ai-text)] shadow-[var(--chat-bubble-ai-shadow)]'
    : 'bg-[var(--chat-bubble-guest)] text-[var(--chat-bubble-guest-text)]';

  return (
    <div
      className={`flex flex-col ${isAi ? 'items-start' : 'items-end'} ${containerSpacing}`}
    >
      <div
        className={`
          max-w-[78%]
          px-[var(--chat-bubble-padding-x)] py-[var(--chat-bubble-padding-y)]
          text-[length:var(--chat-text-body)] leading-snug
          ${radiusClasses}
          ${surfaceClasses}
        `}
      >
        {message.body}
      </div>

      {showDeliveredCaption ? (
        <p
          className="
            mt-1 mr-1
            text-[var(--chat-text-meta)]
            text-[var(--chat-meta-text)]
          "
        >
          Delivered
        </p>
      ) : null}

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
