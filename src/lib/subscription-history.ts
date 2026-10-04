import type { Database } from 'bun:sqlite';
import { currencyCode, money } from './money';
import { monthlySubscriptionCost } from './subscription-costs';
import type { Subscription } from './types';

export interface SubscriptionPayment {
	id: string;
	subscriptionId: string;
	date: string;
	amount: number;
	currency: string;
}
export interface PriceRecord {
	id: number;
	subscriptionId: string;
	amount: number;
	currency: string;
	billingFrequency: Subscription['billingFrequency'];
	customFrequencyDays?: number;
	recordedAt: string;
	source: 'baseline' | 'created' | 'edited';
}
export function percentChange(current: number | null, previous: number | null) {
	return current === null || previous === null || previous === 0
		? null
		: money(((current - previous) / previous) * 100);
}
/** Completed calendar months avoid comparing a partial current month with a whole month. */
export function paymentTrends(payments: SubscriptionPayment[], currency: string, now = new Date()) {
	const period = (offset: number) =>
		new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
			.toISOString()
			.slice(0, 7);
	const monthly = new Map<string, number>();
	for (const payment of payments) {
		if (currencyCode(payment.currency) !== currency) continue;
		const month = payment.date.slice(0, 7);
		monthly.set(month, money((monthly.get(month) ?? 0) + Math.abs(payment.amount)));
	}
	const latestMonth = period(-1),
		previousMonth = period(-2),
		yearAgoMonth = period(-13);
	const latest = monthly.get(latestMonth) ?? null,
		previous = monthly.get(previousMonth) ?? null,
		yearAgo = monthly.get(yearAgoMonth) ?? null;
	return {
		latestMonth,
		previousMonth,
		yearAgoMonth,
		latest,
		previous,
		yearAgo,
		monthlyGrowth: percentChange(latest, previous),
		yearOverYearChange: percentChange(latest, yearAgo),
		history: Array.from(monthly, ([month, amount]) => ({ month, amount })).sort((a, b) =>
			a.month.localeCompare(b.month),
		),
		note: 'Recorded linked payments only. Missing payment history is unknown, not zero. Imports may be incomplete.',
	};
}
export function usageStatus(
	subscription: Subscription,
	now = new Date(),
): 'unknown' | 'stale' | 'recent' {
	if (!subscription.lastUsedDate) return 'unknown';
	return new Date(subscription.lastUsedDate).getTime() < now.getTime() - 90 * 86400000
		? 'stale'
		: 'recent';
}
export function readSubscriptionHistory(db: Database) {
	const payments = db
		.query(
			`SELECT id,subscription_id AS subscriptionId,date,amount,COALESCE(currency,'UNKNOWN') AS currency
  FROM transactions WHERE subscription_id IS NOT NULL AND type='expense' AND amount<0 ORDER BY date,id`,
		)
		.all() as SubscriptionPayment[];
	const prices = db
		.query(
			`SELECT id,subscription_id AS subscriptionId,amount,currency,billing_frequency AS billingFrequency,
  custom_frequency_days AS customFrequencyDays,recorded_at AS recordedAt,source FROM subscription_price_history ORDER BY id`,
		)
		.all() as PriceRecord[];
	return { payments, prices };
}
export function subscriptionInsights(
	subscriptions: Subscription[],
	payments: SubscriptionPayment[],
	prices: PriceRecord[],
	now = new Date(),
) {
	const currencies = [
		...new Set([
			...subscriptions.map((s) => currencyCode(s.currency)),
			...payments.map((p) => currencyCode(p.currency)),
		]),
	].sort();
	return currencies.map((currency) => {
		const all = subscriptions.filter((s) => currencyCode(s.currency) === currency);
		const active = all.filter((s) => s.isActive);
		const monthlyTotal = money(active.reduce((sum, s) => sum + monthlySubscriptionCost(s), 0));
		const details = all.map((s) => {
			const priceHistory = prices.filter((p) => p.subscriptionId === s.id);
			const latest = priceHistory.at(-1),
				prior = priceHistory.at(-2);
			const priceChange =
				latest && prior && latest.currency === prior.currency
					? percentChange(monthlySubscriptionCost(latest), monthlySubscriptionCost(prior))
					: null;
			const paymentHistory = payments.filter((p) => p.subscriptionId === s.id);
			const sameCurrencyPayments = paymentHistory.filter(
				(p) => currencyCode(p.currency) === currency,
			);
			const lastPayment = sameCurrencyPayments.at(-1),
				priorPayment = sameCurrencyPayments.at(-2);
			const paymentChange =
				lastPayment && priorPayment
					? percentChange(Math.abs(lastPayment.amount), Math.abs(priorPayment.amount))
					: null;
			return {
				id: s.id,
				name: s.name,
				isActive: s.isActive,
				amount: s.amount,
				monthlyAmount: money(monthlySubscriptionCost(s)),
				usage: usageStatus(s, now),
				priceChange,
				paymentChange,
				priceHistory,
				paymentHistory,
			};
		});
		return {
			currency,
			monthlyTotal,
			annualTotal: money(monthlyTotal * 12),
			activeCount: active.length,
			unknownUsage: active.filter((s) => usageStatus(s, now) === 'unknown').length,
			staleUsage: active.filter((s) => usageStatus(s, now) === 'stale').length,
			trends: paymentTrends(payments, currency, now),
			subscriptions: details,
		};
	});
}
