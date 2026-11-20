import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import type { PlanId, User } from '../store/types';

@Injectable()
export class UsersService {
  constructor(private readonly store: StoreService) {}

  async getSettings(userId: string) {
    const user = await this.store.findUserById(userId);
    if (!user) throw new NotFoundException();
    const plan = await this.store.findPlan(user.planId);
    const plans = await this.store.listPlans();
    return { user, plan: plan || undefined, plans };
  }

  async updateSettings(
    userId: string,
    patch: Partial<
      Pick<
        User,
        | 'name'
        | 'phone'
        | 'telegramChatId'
        | 'notifyEmail'
        | 'notifyTelegram'
        | 'planId'
      >
    >,
  ) {
    const user = await this.store.updateUser(userId, {
      ...patch,
      planId: patch.planId as PlanId | undefined,
    });
    if (!user) throw new NotFoundException();
    return this.getSettings(userId);
  }

  alerts(userId: string) {
    return this.store.listAlerts(userId, 50);
  }
}
