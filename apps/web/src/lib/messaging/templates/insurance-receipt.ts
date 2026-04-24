import * as React from 'react';
import {
  Body,
  Container,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';
import type { MessageTemplate } from './types';

export type InsuranceReceiptVars = {
  firstName: string;
  policyNumber: string;
  tier: string; // "Essentials" | "Comprehensive" | "Comprehensive+"
  premiumDisplay: string; // "A$149.00"
  propertyName: string;
};

const id = 'insurance-receipt-v1';

function subject(vars: InsuranceReceiptVars): string {
  return `Your CoverMore policy ${vars.policyNumber}`;
}

function Email({
  firstName,
  policyNumber,
  tier,
  premiumDisplay,
  propertyName,
}: InsuranceReceiptVars) {
  return React.createElement(
    Html,
    null,
    React.createElement(
      Preview,
      null,
      `CoverMore policy ${policyNumber} confirmed`,
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
          `You’re covered, ${firstName}.`,
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', fontSize: '15px', lineHeight: 1.6 } },
          `Your CoverMore policy for ${propertyName} is now active.`,
        ),
        React.createElement(
          Section,
          {
            style: {
              backgroundColor: '#F7F3E9',
              borderRadius: '12px',
              padding: '20px',
              margin: '16px 0',
            },
          },
          React.createElement(
            Text,
            { style: { color: '#333333', margin: '4px 0', fontSize: '14px' } },
            `Policy number: ${policyNumber}`,
          ),
          React.createElement(
            Text,
            { style: { color: '#333333', margin: '4px 0', fontSize: '14px' } },
            `Tier: ${tier}`,
          ),
          React.createElement(
            Text,
            { style: { color: '#333333', margin: '4px 0', fontSize: '14px' } },
            `Premium: ${premiumDisplay}`,
          ),
        ),
        React.createElement(
          Text,
          { style: { color: '#333333', opacity: 0.6, fontSize: '12px' } },
          'Powered by CoverMore. Koncie is the merchant of record (MCC 4722). Claims go direct to CoverMore.',
        ),
      ),
    ),
  );
}

export const insuranceReceiptTemplate: MessageTemplate<InsuranceReceiptVars> = {
  id,
  subject,
  async render(vars) {
    const html = await render(Email(vars));
    const text = `Your CoverMore policy ${vars.policyNumber} (${vars.tier}, ${vars.premiumDisplay}) is active for ${vars.propertyName}.`;
    return { html, text };
  },
};
