import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { TelegramSettings } from '../store/types';

type TelegramApiResult = {
  ok: boolean;
  result?: Record<string, unknown>;
  description?: string;
  error?: string;
};

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(private readonly store: StoreService) {}

  async onModuleInit() {
    try {
      await this.configureWebhook();
    } catch (err) {
      this.logger.warn(
        `Telegram webhook setup skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  getSettings() {
    return this.store.getTelegramSettings();
  }

  async updateSettings(
    patch: Partial<{
      botToken: string;
      webhookUrl: string;
      webhookSecret: string;
      enabled: boolean;
    }>,
  ): Promise<TelegramSettings> {
    await this.store.updateTelegramSettings(patch);
    if (
      patch.botToken !== undefined ||
      patch.webhookUrl !== undefined ||
      patch.enabled !== undefined
    ) {
      await this.refreshBotUsername();
      await this.configureWebhook();
    }
    return this.store.getTelegramSettings();
  }

  async publicStatus() {
    const settings = await this.store.getTelegramSettings();
    return {
      enabled: settings.enabled && Boolean(settings.botToken),
      botUsername: settings.botUsername || '',
    };
  }

  async configureWebhook(): Promise<TelegramApiResult> {
    const settings = await this.store.getTelegramSettings();
    if (!settings.enabled || !settings.botToken) {
      return { ok: false, error: 'Telegram bot token is not configured' };
    }
    if (!settings.webhookUrl) {
      this.logger.warn(
        'telegram_webhook_url is empty — inbound linking will not work until set',
      );
      return { ok: false, error: 'Telegram webhook URL is not configured' };
    }
    const result = await this.apiCall('setWebhook', {
      url: settings.webhookUrl,
      secret_token: settings.webhookSecret || undefined,
      drop_pending_updates: false,
      allowed_updates: JSON.stringify(['message']),
    });
    if (result.ok) {
      this.logger.log(`Telegram webhook registered → ${settings.webhookUrl}`);
      await this.refreshBotUsername();
    } else {
      this.logger.error(
        `Telegram setWebhook failed: ${result.error || result.description}`,
      );
    }
    return result;
  }

  async sendMessage(
    chatId: string,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<TelegramApiResult> {
    if (!chatId.trim()) {
      return { ok: false, error: 'Missing chat id' };
    }
    return this.apiCall('sendMessage', {
      chat_id: chatId,
      text: text.slice(0, 4000),
      reply_markup: replyMarkup ? JSON.stringify(replyMarkup) : undefined,
    });
  }

  /**
   * Send only when DB has both phone and telegram_chat_id for the target.
   * Looks up by phone (and optional chat_id match).
   */
  async sendToLinkedPhone(
    phone: string,
    text: string,
    expectedChatId?: string,
  ): Promise<
    TelegramApiResult & {
      userId?: string;
      chatId?: string;
      phone?: string;
    }
  > {
    let digits: string;
    try {
      digits = this.normalizePhone(phone);
    } catch {
      return { ok: false, error: 'Invalid phone number' };
    }

    const user = await this.store.findUserByPhoneAndChatId(
      digits,
      expectedChatId,
    );
    if (!user?.telegramChatId || !user.phone) {
      return {
        ok: false,
        error:
          'No user found with both that phone and a linked Telegram chat_id',
      };
    }

    const sent = await this.sendMessage(user.telegramChatId, text);
    return {
      ...sent,
      userId: user.id,
      chatId: user.telegramChatId,
      phone: user.phone,
    };
  }

  async sendTestForUser(userId: string): Promise<
    TelegramApiResult & {
      userId?: string;
      chatId?: string;
      phone?: string;
    }
  > {
    const user = await this.store.findUserById(userId);
    if (!user) return { ok: false, error: 'User not found' };
    if (!user.phone || !user.telegramChatId) {
      return {
        ok: false,
        error:
          'Link Telegram first: save your phone in Settings, send hi to the bot, then share that phone',
      };
    }
    return this.sendToLinkedPhone(
      user.phone,
      `Fin Goat test message ✅\n\nHello ${user.name}. Your Telegram link is working.`,
      user.telegramChatId,
    );
  }

  async verifyWebhookSecret(headerValue: string | undefined): Promise<boolean> {
    const settings = await this.store.getTelegramSettings();
    const secret = settings.webhookSecret;
    if (!secret) return true;
    const got = headerValue || '';
    if (got.length !== secret.length) return false;
    let mismatch = 0;
    for (let i = 0; i < secret.length; i += 1) {
      mismatch |= secret.charCodeAt(i) ^ got.charCodeAt(i);
    }
    return mismatch === 0;
  }

  async handleUpdate(update: Record<string, unknown>): Promise<void> {
    const message = (update.message || {}) as Record<string, unknown>;
    if (!message || typeof message !== 'object') return;

    const chat = (message.chat || {}) as Record<string, unknown>;
    const chatId = String(chat.id || '');
    if (!chatId) return;
    const privateChat = chat.type === 'private';

    const contact =
      message.contact && typeof message.contact === 'object'
        ? (message.contact as Record<string, unknown>)
        : null;
    const text = String(message.text || '').trim();

    if (contact) {
      await this.linkByPhone(
        chatId,
        String(contact.phone_number || ''),
        privateChat,
      );
      return;
    }

    if (!text) return;

    const typedPhone = this.phoneFromText(text);
    if (typedPhone && privateChat) {
      await this.linkByPhone(chatId, typedPhone, privateChat);
      return;
    }

    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    if (command === 'hi' || command === '/start' || command === '/help') {
      const existing = await this.store.findUserByTelegramChatId(chatId);
      if (existing) {
        await this.sendMessage(
          chatId,
          `You are already linked to Fin Goat as ${existing.name}. Alerts will arrive here.`,
        );
        return;
      }
      await this.sendMessage(
        chatId,
        [
          'Welcome to Fin Goat.',
          '',
          'To link notifications:',
          '1. Save your Telegram phone number in Fin Goat → Settings',
          '2. Share that same number here (button below) or type it with country code',
        ].join('\n'),
        {
          keyboard: [[{ text: 'Share phone number', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      );
      return;
    }

    await this.sendMessage(
      chatId,
      'Send hi to start linking, or share the phone number you saved in Fin Goat Settings.',
    );
  }

  normalizePhone(phone: string): string {
    let digits = (phone || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length < 8 || digits.length > 15) {
      throw new Error('Enter the phone number with country code.');
    }
    return digits;
  }

  phoneFromText(text: string): string {
    const stripped = (text || '').trim();
    if (!stripped || /[A-Za-z]/.test(stripped)) return '';
    try {
      return this.normalizePhone(stripped);
    } catch {
      return '';
    }
  }

  private async linkByPhone(
    chatId: string,
    rawPhone: string,
    privateChat: boolean,
  ) {
    if (!privateChat) {
      await this.sendMessage(
        chatId,
        'Linking only works in a private chat with the bot.',
      );
      return;
    }
    let phone: string;
    try {
      phone = this.normalizePhone(rawPhone);
    } catch {
      await this.sendMessage(
        chatId,
        'Could not read that phone number. Use country code, e.g. +9198XXXXXXXX.',
      );
      return;
    }

    const user = await this.store.findUserByPhone(phone);
    if (!user) {
      await this.sendMessage(
        chatId,
        'No Fin Goat account has that phone yet. Save it under Settings, then share it here again.',
        { remove_keyboard: true },
      );
      return;
    }

    await this.store.updateUser(user.id, {
      phone,
      telegramChatId: chatId,
      notifyTelegram: true,
    });

    await this.sendMessage(
      chatId,
      `Linked to Fin Goat (${user.name}). You will receive screener alerts here.`,
      { remove_keyboard: true },
    );
  }

  private async refreshBotUsername() {
    const me = await this.apiCall('getMe');
    if (!me.ok || !me.result) return;
    const username = String(me.result.username || '').trim();
    if (username) {
      await this.store.setSetting('telegram_bot_username', username);
    }
  }

  private async apiCall(
    method: string,
    fields: Record<string, string | boolean | undefined> = {},
  ): Promise<TelegramApiResult> {
    const settings = await this.store.getTelegramSettings();
    if (!settings.botToken) {
      return { ok: false, error: 'Set telegram bot token in Admin → Telegram' };
    }

    const url = `https://api.telegram.org/bot${settings.botToken}/${method}`;
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === '') continue;
      body.set(
        key,
        typeof value === 'boolean' ? (value ? 'true' : 'false') : value,
      );
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = (await res.json()) as TelegramApiResult & {
        description?: string;
      };
      if (!data.ok) {
        return {
          ok: false,
          error: data.description || `HTTP ${res.status}`,
          description: data.description,
        };
      }
      return data;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
