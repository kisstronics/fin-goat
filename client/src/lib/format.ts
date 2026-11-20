export function formatInr(value: number, compact = false) {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (compact) {
    if (abs >= 1_00_00_000) {
      return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
    }
    if (abs >= 1_00_000) {
      return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
    }
  }
  return (
    sign +
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(abs)
  );
}

export function formatPct(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function assetLabel(type: string) {
  const map: Record<string, string> = {
    stock: 'Stocks',
    mutual_fund: 'Mutual Funds',
    epfo: 'EPFO',
    fd: 'Fixed Deposits',
    gold: 'Gold',
    real_estate: 'Real Estate',
    cash_lending: 'Cash lending (money you lent)',
    ppf: 'PPF',
    nps: 'NPS',
    loan: 'Loan (money you owe)',
  };
  return map[type] || type;
}

export function loanTypeLabel(type: string) {
  const map: Record<string, string> = {
    home: 'Home loan',
    car: 'Car / vehicle loan',
    personal: 'Personal loan',
    education: 'Education loan',
    gold: 'Gold loan',
    business: 'Business loan',
    credit_card: 'Credit card outstanding',
    other: 'Other loan',
  };
  return map[type] || type;
}

export function isLiabilityHolding(holding: {
  assetType: string;
  currentValue: number;
}) {
  return holding.assetType === 'loan' || holding.currentValue < 0;
}
