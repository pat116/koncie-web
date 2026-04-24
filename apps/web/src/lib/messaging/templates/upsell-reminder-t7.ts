import * as React from 'react';
import {
  Body,
  Container,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import type { MessageTemplate } from './types';

export type UpsellReminderVars = {
  firstName: string;
  propertyName: string;
  checkInDate: string; // pre-formatted "Tue 14 Jul 2026"
  hubUrl: string;
};

const id = 'upsell-reminder-t7-v1';

function subject(vars: UpsellReminderVars): string {
  return `Your trip to ${vars.propertyName} is 7 days away`;
}

function Email({ firstName, propertyName, checkInDate, hubUrl }: UpsellReminderVars) {
  return React.createElement(
    Html,
    null,
    React.createElement(
      Preview,
      null,
      `Seven days until ${propertyName} — plan your activities now`,
    ),
    React.createElement(
      Body,
      { style: { backgroundColor: '#F7F3E9', fontFamily: 'Poppins, system-ui, sans-serif' } },
      React.createElement(
        Container,
        {
          style: {
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '32px',
            margin: '24px auto',
            maxWidth: '560px',
          },
        },
        React.createElement(
          Heading,
          { style: { color: '#001F3D', margin: 0, fontSize: '24px' } },
          `Seven days to go, ${firstName}`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          `Your stay at ${propertyName} starts on ${checkInDate}. The resort has a handful of spots left for snorkel, spa, and sunset-sail — book them from your Koncie hub so you’re not scrambling on arrival.`,
        ),
        React.createElement(
          Section,
          { style: { textAlign: 'center' as const, margin: '24px 0' } },
          React.createElement(
            Link,
            {
              href: hubUrl,
              style: {
                backgroundColor: '#2DC86E',
                color: '#FFFFFF',
                padding: '14px 28px',
                borderRadius: '999px',
                textDecoration: 'none',
                fontWeight: 600,
                display: 'inline-block',
              },
            },
            'See what’s on offer',
          ),
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', opacity: 0.6, fontSize: '12px' } },
          'Powered by Koncie. Activities and upsells are processed by Koncie as merchant of record.',
        ),
      ),
    ),
  );
}

export const upsellReminderT7Template: MessageTemplate<UpsellReminderVars> = {
  id,
  subject,
  async render(vars) {
    const html = await render(Email(vars));
    const text = `Seven days until ${vars.propertyName} (${vars.checkInDate}). Plan activities: ${vars.hubUrl}`;
    return { html, text };
  },
};
