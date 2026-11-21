import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type {
  AssetType,
  Holding,
  NetWorthProjection,
  RecurringItem,
} from '../store/types';

@Injectable()
export class PortfolioService {
  constructor(private readonly store: StoreService) {}

  list(userId: string) {
    return this.store.listHoldings(userId);
  }

  private isLiability(h: Holding) {
    // Loans you owe are always liabilities. Cash lending stays an investment.
    return h.assetType === 'loan' || h.currentValue < 0;
  }

  private monthlyAmount(item: RecurringItem) {
    return item.frequency === 'yearly' ? item.amount / 12 : item.amount;
  }

  async dashboard(userId: string) {
    const holdings = await this.list(userId);
    const assets = holdings.filter((h) => !this.isLiability(h));
    const liabilities = holdings.filter((h) => this.isLiability(h));

    const totalAssets = assets.reduce((s, h) => s + Math.max(h.currentValue, 0), 0);
    const totalLiabilities = liabilities.reduce(
      (s, h) => s + Math.abs(h.currentValue),
      0,
    );
    const invested = assets.reduce((s, h) => s + h.investedValue, 0);
    const netWorth = totalAssets - totalLiabilities;
    const absoluteReturn = totalAssets - invested;
    const returnPct = invested > 0 ? (absoluteReturn / invested) * 100 : 0;

    const allocationMap = new Map<string, number>();
    for (const h of assets) {
      allocationMap.set(
        h.assetType,
        (allocationMap.get(h.assetType) || 0) + h.currentValue,
      );
    }

    const allocation = [...allocationMap.entries()]
      .map(([type, value]) => ({
        type,
        value,
        pct: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    const loanBreakdownMap = new Map<string, number>();
    for (const h of liabilities) {
      const key =
        typeof h.meta?.loanType === 'string' ? String(h.meta.loanType) : 'other';
      loanBreakdownMap.set(
        key,
        (loanBreakdownMap.get(key) || 0) + Math.abs(h.currentValue),
      );
    }
    const loanBreakdown = [...loanBreakdownMap.entries()]
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value);

    const actions: string[] = [];
    const fd = holdings.find((h) => h.assetType === 'fd');
    if (fd?.meta?.maturity) {
      actions.push(`FD “${fd.name}” matures on ${String(fd.meta.maturity)}.`);
    }
    const mf = holdings.find((h) => h.assetType === 'mutual_fund' && h.meta?.sip);
    if (mf) {
      actions.push(`SIP of ₹${mf.meta?.sip} due for ${mf.name}.`);
    }
    const lending = assets.find((h) => h.assetType === 'cash_lending');
    if (lending) {
      actions.push(
        `Cash lending receivable: ${lending.name} · ${Math.round(lending.currentValue).toLocaleString('en-IN')}`,
      );
    }
    if (liabilities[0]) {
      const loanLabel =
        typeof liabilities[0].meta?.loanType === 'string'
          ? String(liabilities[0].meta.loanType)
          : 'loan';
      actions.push(
        `${loanLabel} EMI reminder: ${liabilities[0].meta?.emi ? `₹${liabilities[0].meta.emi}` : liabilities[0].name}.`,
      );
    }

    return {
      netWorth,
      totalAssets,
      totalLiabilities,
      invested,
      absoluteReturn,
      returnPct,
      allocation,
      loanBreakdown,
      investments: assets,
      loans: liabilities,
      holdings,
      actions,
      updatedAt: new Date().toISOString(),
    };
  }

  async create(
    userId: string,
    body: {
      assetType: AssetType;
      name: string;
      currentValue: number;
      investedValue: number;
      quantity?: number;
      avgCost?: number;
      tickerId?: string;
      notes?: string;
      meta?: Record<string, string | number | boolean>;
    },
  ): Promise<Holding> {
    const isLoan = body.assetType === 'loan';
    // Normalize loans to negative outstanding so net-worth math stays consistent.
    const currentValue = isLoan
      ? -Math.abs(body.currentValue)
      : body.currentValue;

    const holding: Holding = {
      id: uuid(),
      userId,
      assetType: body.assetType,
      name: body.name,
      currentValue,
      investedValue: isLoan ? body.investedValue || 0 : body.investedValue,
      quantity: body.quantity,
      avgCost: body.avgCost,
      tickerId: body.tickerId,
      notes: body.notes || (isLoan ? 'Liability' : undefined),
      meta: body.meta,
      updatedAt: new Date().toISOString(),
    };
    return this.store.createHolding(holding);
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Omit<Holding, 'id' | 'userId'>>,
  ) {
    const current = await this.store.findHolding(userId, id);
    if (!current) throw new NotFoundException('Holding not found');

    const nextPatch = { ...patch };
    const assetType = nextPatch.assetType ?? current.assetType;
    const isLoan = assetType === 'loan';
    if (isLoan && nextPatch.currentValue !== undefined) {
      nextPatch.currentValue = -Math.abs(Number(nextPatch.currentValue) || 0);
      nextPatch.notes = nextPatch.notes ?? current.notes ?? 'Liability';
    }

    const holding = await this.store.updateHolding(userId, id, nextPatch);
    if (!holding) throw new NotFoundException('Holding not found');
    return holding;
  }

  async projectNetWorth(
    userId: string,
    targetMonth: number,
    targetYear: number,
  ): Promise<NetWorthProjection> {
    if (
      !Number.isInteger(targetMonth) ||
      targetMonth < 1 ||
      targetMonth > 12 ||
      !Number.isInteger(targetYear) ||
      targetYear < 2000 ||
      targetYear > 2100
    ) {
      throw new BadRequestException('Provide a valid future month (1–12) and year');
    }

    const now = new Date();
    const target = new Date(targetYear, targetMonth - 1, 1);
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthsAhead =
      (target.getFullYear() - start.getFullYear()) * 12 +
      (target.getMonth() - start.getMonth());
    if (monthsAhead < 0) {
      throw new BadRequestException('Target month/year must be current or future');
    }

    const [dash, recurring] = await Promise.all([
      this.dashboard(userId),
      this.store.listRecurring(userId),
    ]);

    const active = recurring.filter((r) => r.active);
    const monthlyIncome = active
      .filter((r) => r.kind === 'income')
      .reduce((s, r) => s + this.monthlyAmount(r), 0);
    const monthlyExpenses = active
      .filter((r) => r.kind === 'expense')
      .reduce((s, r) => s + this.monthlyAmount(r), 0);

    const monthlyEmi = dash.loans.reduce((s, h) => {
      const emi = Number(h.meta?.emi);
      return s + (Number.isFinite(emi) ? emi : 0);
    }, 0);
    const monthlySip = dash.investments.reduce((s, h) => {
      const sip = Number(h.meta?.sip);
      return s + (Number.isFinite(sip) ? sip : 0);
    }, 0);

    const monthlySurplus = monthlyIncome - monthlyExpenses;
    // Cash left after living costs, EMIs, and SIPs (can be negative).
    const cashFlow = monthlySurplus - monthlyEmi - monthlySip;

    const assetAdd = monthsAhead * monthlySip + monthsAhead * Math.max(cashFlow, 0);
    const cashBurn = monthsAhead * Math.max(-cashFlow, 0);
    const liabilityReduce = Math.min(
      dash.totalLiabilities,
      monthsAhead * monthlyEmi,
    );

    const projectedAssets = Math.max(
      0,
      dash.totalAssets + assetAdd - Math.min(dash.totalAssets * 0.05, cashBurn),
    );
    const projectedLiabilities = Math.max(
      0,
      dash.totalLiabilities - liabilityReduce,
    );
    const projectedNetWorth = projectedAssets - projectedLiabilities;

    return {
      asOf: now.toISOString(),
      targetMonth,
      targetYear,
      monthsAhead,
      currentNetWorth: dash.netWorth,
      projectedNetWorth,
      projectedAssets,
      projectedLiabilities,
      monthlyIncome,
      monthlyExpenses,
      monthlyEmi,
      monthlySip,
      monthlySurplus,
      breakdown: [
        { label: 'Current net worth', amount: dash.netWorth },
        { label: `SIP contributions (${monthsAhead} mo)`, amount: monthsAhead * monthlySip },
        {
          label: `Net cash after EMI/SIP (${monthsAhead} mo)`,
          amount: monthsAhead * cashFlow,
        },
        {
          label: `Loan paydown estimate (${monthsAhead} mo)`,
          amount: liabilityReduce,
        },
        { label: 'Projected net worth', amount: projectedNetWorth },
      ],
    };
  }

  async remove(userId: string, id: string) {
    const ok = await this.store.deleteHolding(userId, id);
    if (!ok) throw new NotFoundException('Holding not found');
    return { ok: true };
  }
}
