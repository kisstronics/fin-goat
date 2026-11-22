import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type {
  RecurringFrequency,
  RecurringItem,
  RecurringKind,
} from '../store/types';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    private readonly store: StoreService,
    private readonly telegram: TelegramService,
  ) {}

  list(userId: string) {
    return this.store.listRecurring(userId);
  }

  private toMonthly(item: RecurringItem) {
    if (item.frequency === 'yearly') return item.amount / 12;
    if (item.frequency === 'quarterly') return item.amount / 3;
    return item.amount;
  }

  private normalizeDayOfMonth(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      throw new BadRequestException('Day of month must be between 1 and 31');
    }
    return day;
  }

  private assertExpenseSchedule(
    kind: RecurringKind,
    frequency: RecurringFrequency,
    dayOfMonth?: number,
  ) {
    if (kind === 'expense' && frequency === 'monthly' && dayOfMonth == null) {
      throw new BadRequestException(
        'Monthly expenses require a deduction date (day of month)',
      );
    }
  }

  /** Whether an expense should remind on the given calendar day. */
  isExpenseDueOn(
    item: RecurringItem,
    today: Date = new Date(),
  ): boolean {
    if (!item.active || item.kind !== 'expense' || item.dayOfMonth == null) {
      return false;
    }
    const day = today.getDate();
    const monthIndex = today.getMonth(); // 0–11
    const daysInMonth = new Date(
      today.getFullYear(),
      monthIndex + 1,
      0,
    ).getDate();
    const dueDay = Math.min(item.dayOfMonth, daysInMonth);
    if (day !== dueDay) return false;

    if (item.frequency === 'monthly') return true;
    if (item.frequency === 'quarterly') {
      // Calendar quarters: Jan / Apr / Jul / Oct
      return [0, 3, 6, 9].includes(monthIndex);
    }
    if (item.frequency === 'yearly') {
      const created = new Date(item.createdAt);
      return created.getMonth() === monthIndex;
    }
    return false;
  }

  async summary(userId: string) {
    const items = await this.list(userId);
    const active = items.filter((i) => i.active);

    const monthlyIncome = active
      .filter((i) => i.kind === 'income')
      .reduce((s, i) => s + this.toMonthly(i), 0);
    const monthlyExpenses = active
      .filter((i) => i.kind === 'expense')
      .reduce((s, i) => s + this.toMonthly(i), 0);

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
    const frequency = body.frequency || 'monthly';
    const dayOfMonth = this.normalizeDayOfMonth(body.dayOfMonth);
    this.assertExpenseSchedule(body.kind, frequency, dayOfMonth);

    const now = new Date().toISOString();
    const item: RecurringItem = {
      id: uuid(),
      userId,
      kind: body.kind,
      name: body.name.trim(),
      category: (body.category || 'general').trim() || 'general',
      amount: Math.abs(Number(body.amount) || 0),
      frequency,
      dayOfMonth,
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
      dayOfMonth: number | null;
      notes: string;
      active: boolean;
    }>,
  ) {
    const current = await this.store.findRecurring(userId, id);
    if (!current) throw new NotFoundException('Recurring item not found');

    const next: Partial<Omit<RecurringItem, 'id' | 'userId' | 'createdAt'>> = {};
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.frequency !== undefined) next.frequency = patch.frequency;
    if (patch.notes !== undefined) next.notes = patch.notes;
    if (patch.active !== undefined) next.active = patch.active;
    if (patch.amount !== undefined) {
      next.amount = Math.abs(Number(patch.amount) || 0);
    }
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.category !== undefined) {
      next.category = patch.category.trim() || 'general';
    }
    if (patch.dayOfMonth !== undefined) {
      next.dayOfMonth =
        patch.dayOfMonth === null
          ? undefined
          : this.normalizeDayOfMonth(patch.dayOfMonth);
    }

    const kind = (next.kind ?? current.kind) as RecurringKind;
    const frequency = (next.frequency ?? current.frequency) as RecurringFrequency;
    const dayOfMonth =
      patch.dayOfMonth !== undefined
        ? next.dayOfMonth
        : current.dayOfMonth;
    this.assertExpenseSchedule(kind, frequency, dayOfMonth);

    // Persist cleared day as null in DB when caller sent null.
    const persist = {
      ...next,
      ...(patch.dayOfMonth === null ? { dayOfMonth: undefined } : {}),
    };
    const item = await this.store.updateRecurring(userId, id, persist);
    if (!item) throw new NotFoundException('Recurring item not found');
    return item;
  }

  async remove(userId: string, id: string) {
    const ok = await this.store.deleteRecurring(userId, id);
    if (!ok) throw new NotFoundException('Recurring item not found');
    return { ok: true };
  }

  /** Daily cron: remind users about expense deductions due today. */
  async sendExpenseReminders(today: Date = new Date()) {
    const expenses = await this.store.listActiveRecurringExpenses();
    const due = expenses.filter((e) => this.isExpenseDueOn(e, today));
    if (!due.length) {
      return { checked: expenses.length, due: 0, notified: 0 };
    }

    const byUser = new Map<string, RecurringItem[]>();
    for (const item of due) {
      const list = byUser.get(item.userId) || [];
      list.push(item);
      byUser.set(item.userId, list);
    }

    const stamp = today.toISOString();
    let notified = 0;
    for (const [userId, items] of byUser) {
      const user = await this.store.findUserById(userId);
      if (!user) continue;
      if (!user.notifyEmail && !user.notifyTelegram) continue;

      const body = items
        .map(
          (i) =>
            `${i.name}: ₹${Math.round(i.amount).toLocaleString('en-IN')} (${i.frequency}${i.dayOfMonth ? `, day ${i.dayOfMonth}` : ''})`,
        )
        .join('\n');
      const title = 'Fin Goat expense deduction reminder';

      if (user.notifyEmail) {
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'email',
          title,
          body,
          createdAt: stamp,
          status: 'sent',
        });
      }
      if (user.notifyTelegram && user.telegramChatId) {
        const message = `${title}\n\n${body}`;
        const sent = await this.telegram.sendMessage(
          user.telegramChatId,
          message,
        );
        if (!sent.ok) {
          this.logger.warn(
            `Expense reminder Telegram failed for ${user.id}: ${sent.error}`,
          );
        }
        await this.store.createAlert({
          id: uuid(),
          userId: user.id,
          channel: 'telegram',
          title,
          body,
          createdAt: stamp,
          status: sent.ok ? 'sent' : 'failed',
        });
      }
      notified += 1;
    }

    return { checked: expenses.length, due: due.length, notified };
  }
}
