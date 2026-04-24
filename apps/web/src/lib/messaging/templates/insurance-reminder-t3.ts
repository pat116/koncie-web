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

export type InsuranceReminderT3Vars = {
  firstName: string;
  propertyName: string;
  checkInDate: string;
  offerUrl: string;
};

const id = 'insurance-reminder-t3-v1';

function subject(vars: InsuranceReminderT3Vars): string {
  return `Protect your trip to ${vars.propertyName} before you fly`;
}

function Email({
  firstName,
  propertyName,
  checkInDate,
  offerUrl,
}: InsuranceReminderT3Vars) {
  return React.createElement(
    Html,
    null,
    React.createElement(
      Preview,
      null,
      `Three days until ${propertyName} — add CoverMore travel insurance`,
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
          `Hi ${firstName}, three days to go.`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          `You’re flying into ${propertyName} on ${checkInDate} without travel insurance. A CoverMore policy covers cancellations, medical, and lost luggage — locked in before you board.`,
        ),
        React.createElement(
          Section,
          { style: { textAlign: 'center' as const, margin: '24px 0' } },
          React.createElement(
            Link,
            {
              href: offerUrl,
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
            'See my CoverMore options',
          ),
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', opacity: 0.6, fontSize: '12px' } },
          'Powered by CoverMore. Koncie is the merchant of record (MCC 4722).',
        ),
      ),
    ),
  );
}

export const insuranceReminderT3Template: MessageTemplate<InsuranceReminderT3Vars> = {
  id,
  subject,
  async render(vars) {
    const html = await render(Email(vars));
    const text = `Three days until ${vars.propertyName}. Add CoverMore travel insurance: ${vars.offerUrl}`;
    return { html, text };
  },
};
