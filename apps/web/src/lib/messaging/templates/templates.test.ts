import { describe, it, expect } from 'vitest';
import {
  magicLinkTemplate,
  upsellReminderT7Template,
  insuranceReminderT3Template,
  insuranceReceiptTemplate,
} from './index';
import { getTemplate } from './index';

describe('magicLinkTemplate', () => {
  it('renders with non-empty subject + html containing the magic-link URL', async () => {
    const vars = {
      firstName: 'Jane',
      propertyName: 'Namotu Island Fiji',
      magicLinkUrl: 'https://koncie.app/welcome?token=abc',
    };
    expect(magicLinkTemplate.subject(vars)).toContain('Namotu Island Fiji');
    const out = await magicLinkTemplate.render(vars);
    expect(out.html.length).toBeGreaterThan(0);
    expect(out.html).toContain('https://koncie.app/welcome?token=abc');
    expect(out.text).toContain('Jane');
  });
});

describe('upsellReminderT7Template', () => {
  it('renders with 7-day messaging + hub CTA URL', async () => {
    const vars = {
      firstName: 'Jane',
      propertyName: 'Namotu Island Fiji',
      checkInDate: 'Tue 14 Jul 2026',
      hubUrl: 'https://koncie.app/hub',
    };
    expect(upsellReminderT7Template.subject(vars)).toMatch(/7 days/);
    const out = await upsellReminderT7Template.render(vars);
    expect(out.html).toContain('https://koncie.app/hub');
    expect(out.text).toContain('Namotu Island Fiji');
  });
});

describe('insuranceReminderT3Template', () => {
  it('renders with CoverMore provenance + offer URL', async () => {
    const vars = {
      firstName: 'Jane',
      propertyName: 'Namotu Island Fiji',
      checkInDate: 'Tue 14 Jul 2026',
      offerUrl: 'https://koncie.app/hub',
    };
    expect(insuranceReminderT3Template.subject(vars)).toMatch(/Protect/i);
    const out = await insuranceReminderT3Template.render(vars);
    expect(out.html).toContain('CoverMore');
    expect(out.html).toContain('https://koncie.app/hub');
  });
});

describe('insuranceReceiptTemplate', () => {
  it('includes the policy number, tier, and premium in subject + body', async () => {
    const vars = {
      firstName: 'Jane',
      policyNumber: 'CMP-42-42',
      tier: 'Comprehensive',
      premiumDisplay: 'A$149.00',
      propertyName: 'Namotu Island Fiji',
    };
    expect(insuranceReceiptTemplate.subject(vars)).toContain('CMP-42-42');
    const out = await insuranceReceiptTemplate.render(vars);
    expect(out.html).toContain('CMP-42-42');
    expect(out.html).toContain('Comprehensive');
    expect(out.html).toContain('A$149.00');
    expect(out.text).toContain('CMP-42-42');
  });
});

describe('getTemplate registry', () => {
  it('returns the registered template by id', () => {
    expect(getTemplate('magic-link-v1')).toBe(magicLinkTemplate);
    expect(getTemplate('upsell-reminder-t7-v1')).toBe(upsellReminderT7Template);
  });

  it('throws on unknown id', () => {
    expect(() => getTemplate('nope')).toThrow(/Unknown message template/);
  });
});
