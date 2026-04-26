import { describe, it, expect } from 'vitest';
import { preArrivalSmsTemplate } from '../pre-arrival-sms';

describe('preArrivalSmsTemplate', () => {
  it('substitutes guest first name, property, days, and deep-link', () => {
    const { text } = preArrivalSmsTemplate.render({
      firstName: 'Pat',
      propertyName: 'Namotu Island Fiji',
      daysUntilCheckIn: 3,
      deepLink: 'https://koncie.app/c/abc123',
    });
    expect(text).toContain('Pat');
    expect(text).toContain('3 days to go');
    expect(text).toContain('Namotu Island Fiji');
    expect(text).toContain('https://koncie.app/c/abc123');
  });

  it('uses singular "day" copy when only 1 day out', () => {
    const { text } = preArrivalSmsTemplate.render({
      firstName: 'Pat',
      propertyName: 'Namotu',
      daysUntilCheckIn: 1,
      deepLink: 'https://koncie.app/c/x',
    });
    expect(text).toContain('1 day to go');
  });

  it('id is stable for log/admin filters', () => {
    expect(preArrivalSmsTemplate.id).toBe('pre-arrival-sms-v1');
  });
});
