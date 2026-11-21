import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type {
  RecurringFrequency,
  RecurringItem,
  RecurringKind,
} from '../store/types';

@Injectable()
export class RecurringService {
  constructor(private readonly store: StoreService) {}

  list(userId: string) {
    return this.store.listRecurring(userId);
  }

  async summary(userId: string) {
    const items = await this.list(userId);
    const active = items.filter((i) => i.active);
    const toMonthly = (item: RecurringItem) =>
      item.frequency === 'yearly' ? item.amount / 12 : item.amount;

    const monthlyIncome = active
      .filter((i) => i.kind === 'income')
      .reduce((s, i) => s + toMonthly(i), 0);
    const monthlyExpenses = active
      .filter((i) => i.kind === 'expense')
      .reduce((s, i) => s + toMonthly(i), 0);

    return {
      items,
      monthlyIncome,
      monthlyExpenses,
      monthlySurplus: monthlyIncome - monthlyExpenses,
    };
  }

  async create(
    userId: string,
    body: {
      kind: RecurringKind;
      name: string;
      amount: number;
      category?: string;
      frequency?: RecurringFrequency;
      dayOfMonth?: number;
      notes?: string;
      active?: boolean;
    },
  ) {
    const now = new Date().toISOString();
    const item: RecurringItem = {
      id: uuid(),
      userId,
      kind: body.kind,
      name: body.name.trim(),
      category: (body.category || 'general').trim() || 'general',
      amount: Math.abs(Number(body.amount) || 0),
      frequency: body.frequency || 'monthly',
      dayOfMonth: body.dayOfMonth,
      notes: body.notes,
      active: body.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    return this.store.createRecurring(item);
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<{
      kind: RecurringKind;
      name: string;
      amount: number;
      category: string;
      frequency: RecurringFrequency;
      dayOfMonth: number;
      notes: string;
      active: boolean;
    }>,
  ) {
    const next: Partial<Omit<RecurringItem, 'id' | 'userId' | 'createdAt'>> = {
      ...patch,
    };
    if (patch.amount !== undefined) {
      next.amount = Math.abs(Number(patch.amount) || 0);
    }
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.category !== undefined) {
      next.category = patch.category.trim() || 'general';
    }
    const item = await this.store.updateRecurring(userId, id, next);
    if (!item) throw new NotFoundException('Recurring item not found');
    return item;
  }

  async remove(userId: string, id: string) {
    const ok = await this.store.deleteRecurring(userId, id);
    if (!ok) throw new NotFoundException('Recurring item not found');
    return { ok: true };
  }
}
