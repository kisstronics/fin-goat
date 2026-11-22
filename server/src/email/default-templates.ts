import type { EmailTemplateKey } from '../store/types';

export const DEFAULT_EMAIL_TEMPLATES: Array<{
  key: EmailTemplateKey;
  name: string;
  description: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}> = [
  {
    key: 'screener_digest',
    name: 'Screener digest',
    description:
      'Sent when screener matches are found (cron / daily digest). Variables: {{userName}}, {{title}}, {{body}}, {{appName}}',
    subject: '{{title}}',
    bodyHtml: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi {{userName}},</p>
  <p><strong>{{title}}</strong></p>
  <pre style="white-space:pre-wrap;font-family:inherit;background:#f6f6f6;padding:12px;border-radius:8px">{{body}}</pre>
  <p style="color:#666;font-size:13px">— {{appName}}</p>
</div>`,
    bodyText: `Hi {{userName}},

{{title}}

{{body}}

— {{appName}}`,
  },
  {
    key: 'nse_announcement',
    name: 'NSE announcement',
    description:
      'Corporate filing alerts for watched stocks. Variables: {{userName}}, {{title}}, {{body}}, {{symbol}}, {{appName}}',
    subject: '{{title}}',
    bodyHtml: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi {{userName}},</p>
  <p>New NSE filing for <strong>{{symbol}}</strong></p>
  <p><strong>{{title}}</strong></p>
  <pre style="white-space:pre-wrap;font-family:inherit;background:#f6f6f6;padding:12px;border-radius:8px">{{body}}</pre>
  <p style="color:#666;font-size:13px">— {{appName}}</p>
</div>`,
    bodyText: `Hi {{userName}},

New NSE filing for {{symbol}}

{{title}}

{{body}}

— {{appName}}`,
  },
  {
    key: 'expense_reminder',
    name: 'Expense reminder',
    description:
      'Recurring expense deduction reminders. Variables: {{userName}}, {{title}}, {{body}}, {{appName}}',
    subject: '{{title}}',
    bodyHtml: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi {{userName}},</p>
  <p><strong>{{title}}</strong></p>
  <pre style="white-space:pre-wrap;font-family:inherit;background:#f6f6f6;padding:12px;border-radius:8px">{{body}}</pre>
  <p style="color:#666;font-size:13px">— {{appName}}</p>
</div>`,
    bodyText: `Hi {{userName}},

{{title}}

{{body}}

— {{appName}}`,
  },
  {
    key: 'test_email',
    name: 'Test email',
    description:
      'Admin SMTP test message. Variables: {{userName}}, {{title}}, {{body}}, {{appName}}',
    subject: '{{title}}',
    bodyHtml: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">
  <p>Hi {{userName}},</p>
  <p><strong>{{title}}</strong></p>
  <p>{{body}}</p>
  <p style="color:#666;font-size:13px">— {{appName}}</p>
</div>`,
    bodyText: `Hi {{userName}},

{{title}}

{{body}}

— {{appName}}`,
  },
];
