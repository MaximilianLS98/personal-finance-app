import type { Transaction, FinancialSummary } from './types';
import { currencyCode, money } from './money';
export function currencySummaries(
	transactions: Transaction[],
): (FinancialSummary & { currency: string })[] {
	const groups = new Map<string, FinancialSummary & { currency: string }>();
	for (const t of transactions) {
		const currency = currencyCode(t.currency);
		const g = groups.get(currency) || {
			currency,
			totalIncome: 0,
			totalExpenses: 0,
			netAmount: 0,
			transactionCount: 0,
		};
		if (t.type === 'income') g.totalIncome += t.amount;
		if (t.type === 'expense') g.totalExpenses -= t.amount;
		g.transactionCount++;
		groups.set(currency, g);
	}
	return [...groups.values()]
		.sort((a, b) => a.currency.localeCompare(b.currency))
		.map((g) => ({
			...g,
			totalIncome: money(g.totalIncome),
			totalExpenses: money(g.totalExpenses),
			netAmount: money(g.totalIncome - g.totalExpenses),
		}));
}
