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

export type MagicLinkVars = {
  firstName: string;
  propertyName: string;
  magicLinkUrl: string;
};

const id = 'magic-link-v1';

function subject(vars: MagicLinkVars): string {
  return `Your Koncie account for ${vars.propertyName} is ready`;
}

function Email({ firstName, propertyName, magicLinkUrl }: MagicLinkVars) {
  return React.createElement(
    Html,
    null,
    React.createElement(Preview, null, `Your Koncie account for ${propertyName}`),
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
          `Hi ${firstName},`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          `Your Koncie account for your stay at ${propertyName} is ready. Claim it to see your itinerary, add activities, and protect your trip.`,
        ),
        React.createElement(
          Section,
          { style: { textAlign: 'center' as const, margin: '24px 0' } },
          React.createElement(
            Link,
            {
              href: magicLinkUrl,
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
            'Open my Koncie',
          ),
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', opacity: 0.6, fontSize: '12px' } },
          'Link expires in 7 days. If you didn’t book this trip, ignore this email.',
        ),
      ),
    ),
  );
}

export const magicLinkTemplate: MessageTemplate<MagicLinkVars> = {
  id,
  subject,
  async render(vars) {
    const html = await render(Email(vars));
    const text = `Hi ${vars.firstName}, open your Koncie account for ${vars.propertyName}: ${vars.magicLinkUrl}`;
    return { html, text };
  },
};
