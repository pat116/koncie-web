/**
 * SMS template contract — the SMS-side parallel of MessageTemplate<Vars>
 * (which is email-only and returns `{ html, text }`). SMS templates render
 * to `{ text }` only. The two contracts intentionally don't share a base
 * type — SMS bodies are plain strings; email bodies are React Email.
 */
export type SmsTemplate<Vars> = {
  id: string;
  render(vars: Vars): { text: string };
};

export type SmsSendResult =
  | {
      ok: true;
      messageLogId: string;
      sandboxed: boolean;
      providerMessageId?: string;
    }
  | {
      ok: false;
      reason: 'not_allowlisted' | 'send_failed' | 'config_missing';
      messageLogId?: string;
      detail?: string;
    };

export type TwilioMode = 'live' | 'sandbox';

export function getTwilioMode(): TwilioMode {
  return process.env.KONCIE_TWILIO_MODE === 'live' ? 'live' : 'sandbox';
}
