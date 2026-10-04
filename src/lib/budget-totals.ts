import { currencyCode, money } from './money';
import type { Budget } from './types';
export interface BudgetTotal {
	currency: string;
	period: Budget['period'];
	amount: number;
}
/** Currency and period are separate units: an annual allowance cannot be added to a monthly one. */
export function budgetTotals(budgets: Budget[]): BudgetTotal[] {
	const totals = new Map<string, BudgetTotal>();
	for (const budget of budgets) {
		const currency = currencyCode(budget.currency),
			key = `${currency}:${budget.period}`;
		const total = totals.get(key) ?? { currency, period: budget.period, amount: 0 };
		total.amount = money(total.amount + budget.amount);
		totals.set(key, total);
	}
	return [...totals.values()].sort(
		(a, b) => a.currency.localeCompare(b.currency) || a.period.localeCompare(b.period),
	);
}
export function comparableBudgetTotal(budgets: Budget[]): number {
	const totals = budgetTotals(budgets);
	return totals.length === 1 ? totals[0].amount : 0;
}
