/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

import {
  getOrCreateConversation,
  appendMessage,
  getMessages,
  markGreetingSent,
} from '../store';
import { prisma } from '@/lib/db/prisma';

beforeEach(() => {
  vi.clearAllMocks();
  (prisma as any).conversation = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  (prisma as any).chatMessage = {
    create: vi.fn().mockResolvedValue({ id: 'msg-1' }),
    findMany: vi.fn().mockResolvedValue([]),
  };
});

describe('getOrCreateConversation', () => {
  it('returns the existing row when one exists for the booking', async () => {
    (prisma as any).conversation.findUnique.mockResolvedValue({
      id: 'conv-existing',
      bookingId: 'b1',
      greetingSentAt: null,
    });
    const r = await getOrCreateConversation('b1');
    expect(r.id).toBe('conv-existing');
    expect((prisma as any).conversation.create).not.toHaveBeenCalled();
  });

  it('creates a new row when none exists, idempotently', async () => {
    (prisma as any).conversation.findUnique.mockResolvedValue(null);
    (prisma as any).conversation.create.mockResolvedValue({
      id: 'conv-new',
      bookingId: 'b1',
      greetingSentAt: null,
    });
    const r = await getOrCreateConversation('b1');
    expect(r.id).toBe('conv-new');
    expect((prisma as any).conversation.create).toHaveBeenCalledWith({
      data: { bookingId: 'b1' },
      select: { id: true, bookingId: true, greetingSentAt: true },
    });
  });
});

describe('appendMessage', () => {
  it('writes a guest message with no attachments', async () => {
    await appendMessage({
      conversationId: 'c1',
      sender: 'guest',
      body: 'Hi there',
    });
    const data = (prisma as any).chatMessage.create.mock.calls[0][0].data;
    expect(data.sender).toBe('guest');
    expect(data.body).toBe('Hi there');
    expect(data.attachments).toEqual([]);
  });

  it('writes an AI message with attachments', async () => {
    await appendMessage({
      conversationId: 'c1',
      sender: 'ai',
      body: 'Surf is firing',
      attachments: [{ kind: 'download_card' }],
    });
    const data = (prisma as any).chatMessage.create.mock.calls[0][0].data;
    expect(data.sender).toBe('ai');
    expect(data.attachments).toEqual([{ kind: 'download_card' }]);
  });
});

describe('getMessages', () => {
  it('orders by sentAt ascending and uses default limit 50', async () => {
    await getMessages('c1');
    const args = (prisma as any).chatMessage.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ sentAt: 'asc' });
    expect(args.take).toBe(50);
    expect(args.where).toEqual({ conversationId: 'c1' });
  });
});

describe('markGreetingSent', () => {
  it('sets greetingSentAt to a Date', async () => {
    (prisma as any).conversation.update.mockResolvedValue({});
    await markGreetingSent('c1');
    const args = (prisma as any).conversation.update.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'c1' });
    expect(args.data.greetingSentAt).toBeInstanceOf(Date);
  });
});
