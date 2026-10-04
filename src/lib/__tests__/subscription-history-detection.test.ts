import { SubscriptionPatternEngine } from '../subscription-pattern-engine';
import type { Transaction } from '../types';
import { createRepositoryMock } from './repository-mock';

const series = (dates: string[], options: Partial<Transaction> = {}): Transaction[] =>
	dates.map((date, i) => ({
		id: `charge-${i}`,
		date: new Date(date),
		description: 'Example Gym AS',
		amount: -450,
		type: 'expense',
		currency: 'NOK',
		...options,
	}));

describe('historical subscription evidence', () => {
	const repository = createRepositoryMock();
	let engine: SubscriptionPatternEngine;
	beforeEach(() => {
		jest.useFakeTimers({ now: new Date('2026-10-05T12:00:00Z') });
		repository.findActiveSubscriptions.mockResolvedValue([]);
		engine = new SubscriptionPatternEngine(repository);
	});
	afterEach(() => jest.useRealTimers());

	it('retains four regular gym payments after billing has stopped', async () => {
		const rows = series(['2026-01-12', '2026-02-12', '2026-03-12', '2026-04-12']);
		const [candidate] = await engine.detectSubscriptions(rows);
		expect(candidate).toMatchObject({
			name: 'Example Gym',
			activity: 'no_recent_payment',
			lastPaymentDate: '2026-04-12',
			billingFrequency: 'monthly',
			amount: 450,
			currency: 'NOK',
		});
		expect(candidate.matchingTransactions).toHaveLength(4);
		expect(candidate.confidence).toBeGreaterThan(0.8);
	});
	it('marks missing recent payments as evidence rather than asserting cancellation', async () => {
		const [candidate] = await engine.detectSubscriptions(
			series(['2026-05-12', '2026-06-12', '2026-07-12']),
		);
		expect(candidate.activity).toBe('no_recent_payment');
		expect(candidate.reason).not.toMatch(/cancelled|canceled/i);
	});
	it('keeps recent recurrence separate from payment inactivity', async () => {
		const [candidate] = await engine.detectSubscriptions(
			series(['2026-07-12', '2026-08-12', '2026-09-12']),
		);
		expect(candidate.activity).toBe('recent');
	});
	it('uses the billing frequency when assessing annual recency', async () => {
		const [candidate] = await engine.detectSubscriptions(series(['2025-01-12', '2026-01-12']));
		expect(candidate).toMatchObject({ activity: 'recent', billingFrequency: 'annually' });
	});
	it('retains all charges across a modest price increase and suggests the latest price', async () => {
		const rows = series(['2026-01-12', '2026-02-12', '2026-03-12']);
		rows[2].amount = -475;
		const [candidate] = await engine.detectSubscriptions(rows.reverse());
		expect(candidate.amount).toBe(475);
		expect(candidate.matchingTransactions).toHaveLength(3);
	});
	it('does not manufacture recurrence from irregular purchases or refunds', async () => {
		expect(
			await engine.detectSubscriptions(series(['2026-01-12', '2026-01-15', '2026-04-12'])),
		).toHaveLength(0);
		expect(
			await engine.detectSubscriptions(series(['2026-01-12', '2026-02-12'], { amount: 450 })),
		).toHaveLength(0);
	});
	it('does not collapse different currencies or distinct prices into one candidate', async () => {
		const dates = ['2026-01-12', '2026-02-12', '2026-03-12'];
		const candidates = await engine.detectSubscriptions([
			...series(dates),
			...series(dates, { amount: -20, currency: 'USD' }),
			...series(dates, { amount: -950 }),
		]);
		expect(candidates).toHaveLength(3);
		expect(candidates.map((c) => [c.currency, c.amount])).toEqual(
			expect.arrayContaining([
				['NOK', 450],
				['USD', 20],
				['NOK', 950],
			]),
		);
	});
	it('does not hide a candidate because a same-priced subscription exists in another currency', async () => {
		repository.findActiveSubscriptions.mockResolvedValue([
			{ id: 'existing', name: 'Example Gym', amount: 450, currency: 'USD' } as never,
		]);
		expect(await engine.detectSubscriptions(series(['2026-01-12', '2026-02-12']))).toHaveLength(1);
	});
	it('does not rediscover transactions already linked to inactive history', async () => {
		expect(
			await engine.detectSubscriptions(
				series(['2026-01-12', '2026-02-12'], {
					isSubscription: true,
					subscriptionId: 'inactive-history',
				}),
			),
		).toHaveLength(0);
	});
});
