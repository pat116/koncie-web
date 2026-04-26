import type { SmsTemplate } from '@/lib/messaging/sms/types';

export type PreArrivalSmsVars = {
  firstName: string;
  propertyName: string;
  daysUntilCheckIn: number; // 3 for the T-3 cron path
  deepLink: string;
};

const id = 'pre-arrival-sms-v1';

/**
 * Pre-arrival SMS body.
 *
 * Lands at T-3 by default (one channel per cron window: T-7 = upsell email,
 * T-3 = insurance email + pre-arrival SMS). The SMS leads with a
 * conversational hook to the chat surface — it intentionally does NOT
 * duplicate the insurance reminder copy. SMS is the deep-link to chat;
 * email is the payment CTA.
 *
 * Body length target ≤160 GSM-7 chars (cost doubles past that). With the
 * deep link at ~50 chars and the hook copy at ~80, we comfortably fit.
 */
function render(vars: PreArrivalSmsVars): { text: string } {
  const { firstName, propertyName, daysUntilCheckIn, deepLink } = vars;
  const dayLabel =
    daysUntilCheckIn === 1
      ? '1 day to go'
      : `${daysUntilCheckIn} days to go`;
  const text =
    `Hi ${firstName}, ${dayLabel} until ${propertyName}! ` +
    `Tap your Koncie concierge for surf, dining and pickup info: ${deepLink}`;
  return { text };
}

export const preArrivalSmsTemplate: SmsTemplate<PreArrivalSmsVars> = {
  id,
  render,
};
