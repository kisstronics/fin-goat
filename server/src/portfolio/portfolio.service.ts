import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { StoreService } from '../store/store.service';
import type { AssetType, Holding } from '../store/types';

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
    const holding = await this.store.updateHolding(userId, id, patch);
    if (!holding) throw new NotFoundException('Holding not found');
    return holding;
  }

  async remove(userId: string, id: string) {
    const ok = await this.store.deleteHolding(userId, id);
    if (!ok) throw new NotFoundException('Holding not found');
    return { ok: true };
  }
}
