import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { PlanId, User } from '../store/types';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly store: StoreService,
    private readonly telegram: TelegramService,
  ) {}

  async getSettings(userId: string) {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundException();
    const [plan, plans, telegram] = await Promise.all([
      this.store.findPlan(user.planId),
      this.store.listPlans(),
      this.telegram.publicStatus(),
    ]);
    return {
      user,
      plan: plan || undefined,
      plans,
      telegram: {
        ...telegram,
        linked: Boolean(user.telegramChatId),
      },
    };
  }

  async updateSettings(
    userId: string,
    patch: Partial<
      Pick<
        User,
        'name' | 'phone' | 'notifyEmail' | 'notifyTelegram' | 'planId'
      >
    >,
  ) {
    const next: Partial<
      Pick<
        User,
        | 'name'
        | 'phone'
        | 'telegramChatId'
        | 'notifyEmail'
        | 'notifyTelegram'
        | 'planId'
      >
    > = {
      name: patch.name,
      notifyEmail: patch.notifyEmail,
      notifyTelegram: patch.notifyTelegram,
      planId: patch.planId as PlanId | undefined,
    };

    if (patch.phone !== undefined) {
      const raw = String(patch.phone || '').trim();
      if (!raw) {
        next.phone = '';
        next.telegramChatId = '';
      } else {
        let phone: string;
        try {
          phone = this.telegram.normalizePhone(raw);
        } catch (err) {
          throw new BadRequestException(
            err instanceof Error ? err.message : 'Invalid phone number',
          );
        }
        const owner = await this.store.findUserByPhone(phone);
        if (owner && owner.id !== userId) {
          throw new BadRequestException(
            'That phone number is already linked to another account.',
          );
        }
        const current = await this.store.findUserById(userId);
        const currentDigits = (current?.phone || '').replace(/\D/g, '');
        next.phone = phone;
        if (currentDigits && currentDigits !== phone) {
          next.telegramChatId = '';
        }
      }
    }

    const user = await this.store.updateUser(userId, next);
    if (!user) throw new NotFoundException();
    return this.getSettings(userId);
  }

  alerts(userId: string) {
    return this.store.listAlerts(userId, 50);
  }

  async sendTestTelegram(userId: string) {
    const result = await this.telegram.sendTestForUser(userId);
    if (!result.ok) {
      throw new BadRequestException(result.error || 'Could not send test message');
    }
    return {
      ok: true,
      chatId: result.chatId,
      phone: result.phone,
      message: 'Test message sent on Telegram',
    };
  }
}
