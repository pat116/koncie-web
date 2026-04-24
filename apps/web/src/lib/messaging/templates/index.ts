/**
 * Template registry. `sendMessage` looks up the template by `templateId`
 * string — the key must match the template's `id` field.
 *
 * Adding a new template: author the file under `./templates`, export the
 * `MessageTemplate` object, then register it here keyed by its `id`.
 */
import type { MessageTemplate } from './types';
import { magicLinkTemplate } from './magic-link';
import { upsellReminderT7Template } from './upsell-reminder-t7';
import { insuranceReminderT3Template } from './insurance-reminder-t3';
import { insuranceReceiptTemplate } from './insurance-receipt';

// The registry holds heterogeneous var shapes; the caller narrows at send-time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: Record<string, MessageTemplate<any>> = {
  [magicLinkTemplate.id]: magicLinkTemplate,
  [upsellReminderT7Template.id]: upsellReminderT7Template,
  [insuranceReminderT3Template.id]: insuranceReminderT3Template,
  [insuranceReceiptTemplate.id]: insuranceReceiptTemplate,
};

export function getTemplate(templateId: string): MessageTemplate<unknown> {
  const tpl = registry[templateId];
  if (!tpl) {
    throw new Error(`Unknown message template: ${templateId}`);
  }
  return tpl as MessageTemplate<unknown>;
}

export { magicLinkTemplate } from './magic-link';
export { upsellReminderT7Template } from './upsell-reminder-t7';
export { insuranceReminderT3Template } from './insurance-reminder-t3';
export { insuranceReceiptTemplate } from './insurance-receipt';
export type { MessageTemplate } from './types';
