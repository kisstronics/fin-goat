import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { StoreService } from '../store/store.service';
import type {
  EmailTemplateKey,
  SmtpSettings,
  User,
} from '../store/types';

export type MailResult = {
  ok: boolean;
  error?: string;
  messageId?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private transporterKey = '';

  constructor(private readonly store: StoreService) {}

  getSettings() {
    return this.store.getSmtpSettings();
  }

  async updateSettings(
    patch: Partial<{
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromName: string;
      fromEmail: string;
      enabled: boolean;
    }>,
  ): Promise<SmtpSettings> {
    await this.store.updateSmtpSettings(patch);
    this.transporter = null;
    this.transporterKey = '';
    return this.store.getSmtpSettings();
  }

  private render(
    template: string,
    vars: Record<string, string>,
  ): string {
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      return vars[key] ?? '';
    });
  }

  private async getTransporter(settings: SmtpSettings): Promise<Transporter> {
    const key = [
      settings.host,
      settings.port,
      settings.secure,
      settings.user,
      settings.pass,
    ].join('|');
    if (this.transporter && this.transporterKey === key) {
      return this.transporter;
    }
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth:
        settings.user || settings.pass
          ? { user: settings.user, pass: settings.pass }
          : undefined,
    });
    this.transporterKey = key;
    return this.transporter;
  }

  async sendTemplate(opts: {
    to: string;
    templateKey: EmailTemplateKey;
    vars?: Record<string, string>;
    userName?: string;
    /** Skip the smtp_enabled gate (admin test send). */
    force?: boolean;
  }): Promise<MailResult> {
    const settings = await this.store.getSmtpSettings();
    if (!opts.force && !settings.enabled) {
      return { ok: false, error: 'SMTP email is disabled' };
    }
    if (!settings.host || !settings.fromEmail) {
      return { ok: false, error: 'SMTP host / from email not configured' };
    }

    const template = await this.store.getEmailTemplate(opts.templateKey);
    if (!template) {
      return { ok: false, error: `Unknown template: ${opts.templateKey}` };
    }
    if (!template.enabled) {
      return { ok: false, error: `Template ${opts.templateKey} is disabled` };
    }

    const vars: Record<string, string> = {
      appName: 'Fin Goat',
      userName: opts.userName || 'there',
      title: '',
      body: '',
      symbol: '',
      ...(opts.vars || {}),
    };

    const subject = this.render(template.subject, vars);
    const html = this.render(template.bodyHtml, vars);
    const text = this.render(template.bodyText, vars);
    const from = settings.fromName
      ? `"${settings.fromName}" <${settings.fromEmail}>`
      : settings.fromEmail;

    try {
      const transport = await this.getTransporter(settings);
      const info = await transport.sendMail({
        from,
        to: opts.to,
        subject,
        html,
        text,
      });
      return { ok: true, messageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  async notifyUser(opts: {
    user: User;
    templateKey: EmailTemplateKey;
    title: string;
    body: string;
    extraVars?: Record<string, string>;
  }): Promise<MailResult> {
    if (!opts.user.email?.trim()) {
      return { ok: false, error: 'User has no email' };
    }
    return this.sendTemplate({
      to: opts.user.email,
      templateKey: opts.templateKey,
      userName: opts.user.name,
      vars: {
        title: opts.title,
        body: opts.body,
        ...(opts.extraVars || {}),
      },
    });
  }

  async sendTestEmail(to: string): Promise<MailResult> {
    const address = String(to || '').trim();
    if (!address) {
      throw new BadRequestException('Recipient email is required');
    }
    const settings = await this.store.getSmtpSettings();
    if (!settings.host || !settings.fromEmail) {
      throw new BadRequestException(
        'Configure SMTP host and from email before sending a test',
      );
    }
    const result = await this.sendTemplate({
      to: address,
      templateKey: 'test_email',
      userName: 'Admin',
      force: true,
      vars: {
        title: 'Fin Goat SMTP test',
        body: 'Your SMTP configuration is working. Email notifications can be delivered.',
      },
    });
    if (!result.ok) {
      throw new BadRequestException(result.error || 'Test email failed');
    }
    return result;
  }
}
