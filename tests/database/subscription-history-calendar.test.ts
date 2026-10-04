import { SubscriptionPatternEngine } from '../../src/lib/subscription-pattern-engine';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SQLiteConnectionManager } from '../../src/lib/database/connection';
import { SQLiteTransactionRepository } from '../../src/lib/database/repository';
import {
	billEvents,
	calendarICS,
	reminderPreferences,
	saveReminder,
} from '../../src/lib/subscription-calendar';
import {
	paymentTrends,
	readSubscriptionHistory,
	subscriptionInsights,
	usageStatus,
} from '../../src/lib/subscription-history';
import type { Subscription } from '../../src/lib/types';

let manager: SQLiteConnectionManager, repo: SQLiteTransactionRepository;
beforeEach(async () => {
	manager = new SQLiteConnectionManager({ filename: ':memory:' });
	repo = new SQLiteTransactionRepository(manager);
	await repo.initialize();
});
afterEach(async () => {
	await manager.close();
});
async function subscription(overrides: Partial<Subscription> = {}) {
	const category = await repo.createCategory({
		name: `Test ${crypto.randomUUID()}`,
		icon: 'Wallet',
		color: '#123456',
	});
	return repo.createSubscription({
		name: 'Service',
		amount: 100,
		currency: 'NOK',
		billingFrequency: 'monthly',
		nextPaymentDate: new Date('2026-01-31'),
		categoryId: category.id,
		isActive: true,
		startDate: new Date('2025-01-01'),
		...overrides,
	});
}
describe('subscription history', () => {
	it('rejects mixed-currency scalar totals and never matches a different currency', async () => {
		const sub = await subscription();
		await subscription({ currency: 'USD' });
		await expect(repo.calculateTotalMonthlyCost()).rejects.toThrow('single currency');
		await repo.createSubscriptionPattern({
			subscriptionId: sub.id,
			pattern: 'Service',
			patternType: 'contains',
			confidenceScore: 1,
			createdBy: 'user',
			isActive: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		const engine = new SubscriptionPatternEngine(repo);
		const tx = await repo.create({
			date: new Date('2026-01-01'),
			description: 'Service',
			amount: -100,
			currency: 'USD',
			type: 'expense',
		});
		expect(await engine.matchExistingSubscriptions([tx])).toHaveLength(0);
		const groups = await engine.analyzeRecurringPatterns([
			{ ...tx, id: 'n', currency: 'NOK' },
			{ ...tx, id: 'u', date: new Date('2026-02-01') },
		]);
		expect(groups).toHaveLength(0);
	});

	it('retains initial prices and only material price edits with currency and billing basis', async () => {
		const sub = await subscription();
		await repo.updateSubscription(sub.id, { notes: 'Changed description' });
		await repo.updateSubscription(sub.id, { amount: 120 });
		await repo.updateSubscription(sub.id, { currency: 'USD', billingFrequency: 'annually' });
		const history = readSubscriptionHistory(manager.getConnection()).prices;
		expect(history.map((p) => [p.amount, p.currency, p.billingFrequency, p.source])).toEqual([
			[100, 'NOK', 'monthly', 'created'],
			[120, 'NOK', 'monthly', 'edited'],
			[120, 'USD', 'annually', 'edited'],
		]);
		const updated = await repo.findAllSubscriptions();
		const insights = subscriptionInsights(updated, [], history);
		expect(insights[0].subscriptions[0].priceChange).toBeNull(); // no cross-currency percentage
		await repo.deleteSubscription(sub.id);
		expect(readSubscriptionHistory(manager.getConnection()).prices).toHaveLength(0);
	});
	it('calculates completed-month and year-over-year recorded spending without currency mixing', () => {
		const payments = [
			['2026-09-02', -120, 'NOK'],
			['2026-08-02', -100, 'NOK'],
			['2025-09-02', -80, 'NOK'],
			['2026-10-02', -1000, 'NOK'],
			['2026-09-03', -999, 'USD'],
		].map(([date, amount, currency], i) => ({
			id: String(i),
			subscriptionId: 'test',
			date: String(date),
			amount: Number(amount),
			currency: String(currency),
		}));
		const trends = paymentTrends(payments, 'NOK', new Date('2026-10-04'));
		expect(trends.latest).toBe(120);
		expect(trends.monthlyGrowth).toBe(20);
		expect(trends.yearOverYearChange).toBe(50);
		expect(paymentTrends(payments, 'USD', new Date('2026-10-04')).monthlyGrowth).toBeNull();
		expect(paymentTrends([], 'NOK', new Date('2026-10-04')).latest).toBeNull();
	});
	it('separates unknown usage from confirmed stale usage', async () => {
		const unknown = await subscription();
		const stale = await subscription({ lastUsedDate: new Date('2020-01-01') });
		expect(usageStatus(unknown)).toBe('unknown');
		expect(usageStatus(stale)).toBe('stale');
		expect((await repo.findUnusedSubscriptions(90)).map((s) => s.id)).toEqual([stale.id]);
	});
	it('groups scheduled totals by currency and exposes linked payment changes separately', async () => {
		const nok = await subscription();
		await subscription({ currency: 'USD', amount: 10 });
		for (const [date, amount] of [
			['2026-08-01', -100],
			['2026-09-01', -120],
		] as const) {
			const tx = await repo.create({
				date: new Date(date),
				amount,
				description: 'Service bill',
				currency: 'NOK',
				type: 'expense',
			});
			await repo.flagTransactionAsSubscription(tx.id, nok.id);
		}
		const { payments, prices } = readSubscriptionHistory(manager.getConnection());
		const result = subscriptionInsights(
			await repo.findAllSubscriptions(),
			payments,
			prices,
			new Date('2026-10-04'),
		);
		expect(result.map((g) => [g.currency, g.monthlyTotal])).toEqual([
			['NOK', 100],
			['USD', 10],
		]);
		expect(result[0].subscriptions[0].paymentChange).toBe(20);
	});
});
describe('bill calendar', () => {
	it('keeps month-end anchor across February and leap years', async () => {
		const sub = await subscription();
		expect(billEvents([sub], [], '2026-01-01', '2026-03-31').map((e) => e.date)).toEqual([
			'2026-01-31',
			'2026-02-28',
			'2026-03-31',
		]);
		sub.nextPaymentDate = new Date('2028-01-31');
		expect(billEvents([sub], [], '2028-02-01', '2028-02-29')[0].date).toBe('2028-02-29');
	});
	it('includes cancellation deadlines whose renewal is outside the visible month', async () => {
		const sub = await subscription({ nextPaymentDate: new Date('2026-11-05') });
		const events = billEvents(
			[sub],
			[{ subscriptionId: sub.id, reminderDays: 3, cancellationNoticeDays: 7, enabled: true }],
			'2026-10-01',
			'2026-10-31',
		);
		expect(events).toHaveLength(1);
		expect(events[0].cancellationDate).toBe('2026-10-29');
		const ics = calendarICS(events, '2026-10-01', '2026-10-31');
		expect(ics).toContain('DTSTART;VALUE=DATE:20261029');
		expect(ics).not.toContain('DTSTART;VALUE=DATE:20261105');
		expect(ics).toContain('TRIGGER:-P3D');
	});
	it('respects quarterly, annual, custom schedules, inactive and ended subscriptions', async () => {
		const sub = await subscription({ billingFrequency: 'quarterly' });
		expect(billEvents([sub], [], '2026-01-01', '2026-05-31').map((e) => e.date)).toEqual([
			'2026-01-31',
			'2026-04-30',
		]);
		sub.billingFrequency = 'annually';
		expect(billEvents([sub], [], '2026-01-01', '2026-12-31')).toHaveLength(1);
		sub.billingFrequency = 'custom';
		sub.customFrequencyDays = 7;
		sub.endDate = new Date('2026-02-14');
		expect(billEvents([sub], [], '2026-02-01', '2026-02-28').map((e) => e.date)).toEqual([
			'2026-02-07',
			'2026-02-14',
		]);
		sub.isActive = false;
		expect(billEvents([sub], [], '2026-02-01', '2026-02-28')).toHaveLength(0);
	});
	it('exports all-day events with stable IDs, escaped text and UTF-8 folding', async () => {
		const sub = await subscription({ name: 'æ'.repeat(80) + ', semicolon; newline\nEND:VEVENT' });
		const events = billEvents([sub], [], '2026-01-01', '2026-01-31');
		const ics = calendarICS(events, '2026-01-01', '2026-01-31', new Date('2026-01-01'));
		expect(ics).toContain('DTEND;VALUE=DATE:20260201');
		expect(ics.replace(/\r\n /g, '')).toContain(
			`UID:${sub.id}-2026-01-31-payment@personal-finance.local`,
		);
		expect(ics.replace(/\r\n /g, '')).toContain('\\, semicolon\\; newline\\nEND:VEVENT');
		expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
			true,
		);
	});
	it('persists validated preferences and can disable alarms', async () => {
		const sub = await subscription();
		const db = manager.getConnection();
		saveReminder(db, {
			subscriptionId: sub.id,
			reminderDays: 0,
			cancellationNoticeDays: 14,
			enabled: false,
		});
		const preferences = reminderPreferences(db);
		expect(preferences[0].enabled).toBe(false);
		expect(
			calendarICS(
				billEvents([sub], preferences, '2026-01-01', '2026-01-31'),
				'2026-01-01',
				'2026-01-31',
			),
		).not.toContain('VALARM');
		expect(() => saveReminder(db, { ...preferences[0], reminderDays: -1 })).toThrow();
		expect(() => saveReminder(db, { ...preferences[0], cancellationNoticeDays: 0.5 })).toThrow();
		expect(() => saveReminder(db, { ...preferences[0], subscriptionId: 'missing' })).toThrow();
	});
	it('rejects malformed and unbounded date ranges', () => {
		expect(() => billEvents([], [], '2026-02-30', '2026-03-01')).toThrow();
		expect(() => billEvents([], [], '2026-01-01', '2028-01-01')).toThrow();
		expect(() => billEvents([], [], 'bad', '2026-03-01')).toThrow();
	});
});
