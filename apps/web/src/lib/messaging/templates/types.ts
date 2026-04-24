/**
 * Shared contract for every Koncie email template.
 *
 * Each template is a pure render of `vars` → `{ subject, html, text }`. The
 * template itself does not talk to Resend or the DB — `sendMessage` does.
 * That separation keeps templates trivially unit-testable (render without
 * throwing, subject non-empty, critical variables substituted).
 *
 * `render` is async because `@react-email/render` returns a Promise in v1.x.
 */
export type MessageTemplate<Vars> = {
  id: string;
  subject(vars: Vars): string;
  render(vars: Vars): Promise<{ html: string; text: string }> | { html: string; text: string };
};
