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

/**
 * Sprint 7 "account ready" template.
 *
 * Fires on successful HotelLink booking ingest. The CTA lands the guest
 * on /welcome with a 7-day signed magic-link token so they're pre-auth'd
 * against their specific booking.
 *
 * `checkIn` / `checkOut` are ISO-8601 strings — formatted inside
 * `render` so callers pass the same shape the wire payload uses.
 */
export type HotelBookingConfirmedVars = {
  firstName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  claimLink: string;
};

const id = 'hotel-booking-confirmed-v1';

function formatStayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function subject(vars: HotelBookingConfirmedVars): string {
  return `Your Koncie account is ready for ${vars.propertyName}`;
}

function Email({
  firstName,
  propertyName,
  checkIn,
  checkOut,
  claimLink,
}: HotelBookingConfirmedVars) {
  const stayDates = `${formatStayDate(checkIn)} → ${formatStayDate(checkOut)}`;
  return React.createElement(
    Html,
    null,
    React.createElement(
      Preview,
      null,
      `Your Koncie account for ${propertyName} is ready`,
    ),
    React.createElement(
      Body,
      {
        style: {
          backgroundColor: '#F7F3E9',
          fontFamily: 'Poppins, system-ui, sans-serif',
        },
      },
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
          `Welcome to Koncie, ${firstName}`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          `Your booking at ${propertyName} is confirmed for ${stayDates}. We’ve set up a Koncie account so you can see your itinerary, plan activities, and add travel insurance in one place.`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          'Open your trip hub with the button below — no password needed, the link is valid for 7 days.',
        ),
        React.createElement(
          Section,
          { style: { textAlign: 'center' as const, margin: '24px 0' } },
          React.createElement(
            Link,
            {
              href: claimLink,
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
            'Open your trip hub',
          ),
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', opacity: 0.6, fontSize: '12px' } },
          'Powered by Koncie. Your hotel booking is managed by the property; Koncie handles your trip hub and any ancillaries as merchant of record.',
        ),
      ),
    ),
  );
}

export const hotelBookingConfirmedTemplate: MessageTemplate<HotelBookingConfirmedVars> =
  {
    id,
    subject,
    async render(vars) {
      const html = await render(Email(vars));
      const text = `Hi ${vars.firstName}, your Koncie account for ${vars.propertyName} (${formatStayDate(vars.checkIn)} → ${formatStayDate(vars.checkOut)}) is ready. Open your trip hub: ${vars.claimLink}`;
      return { html, text };
    },
  };
