import type { Database } from 'bun:sqlite';
import { currencyCode } from './money';
import type { Subscription } from './types';

type Frequency = Subscription['billingFrequency'];
export function nextDetectedPayment(
	last: Date,
	frequency: Frequency,
	customDays?: number,
	from?: Date,
) {
	if (!Number.isFinite(last.getTime())) throw new Error('Invalid last payment date');
	const anchor = new Date(`${last.toISOString().slice(0, 10)}T00:00:00Z`);
	if (frequency === 'custom' && (!Number.isSafeInteger(customDays) || customDays! <= 0))
		throw new Error('Custom frequency requires a positive whole number of days');
	const months = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
	const occurrence = (step: number) => {
		if (frequency === 'custom') return new Date(anchor.getTime() + step * customDays! * 86400000);
		const first = new Date(
			Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + step * months, 1),
		);
		const maxDay = new Date(
			Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
		).getUTCDate();
		first.setUTCDate(Math.min(anchor.getUTCDate(), maxDay));
		return first;
	};
	const cutoff = from ? new Date(`${from.toISOString().slice(0, 10)}T00:00:00Z`) : undefined;
	let step = 1;
	if (cutoff && cutoff > anchor)
		step =
			frequency === 'custom'
				? Math.max(1, Math.floor((cutoff.getTime() - anchor.getTime()) / (customDays! * 86400000)))
				: Math.max(
						1,
						Math.floor(
							((cutoff.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
								cutoff.getUTCMonth() -
								anchor.getUTCMonth()) /
								months,
						),
					);
	let result = occurrence(step);
	while (cutoff && result < cutoff) result = occurrence(++step);
	return result;
}
export function hasRecentDetectedPayment(
	last: Date,
	frequency: Frequency,
	customDays?: number,
	now = new Date(),
) {
	const interval =
		frequency === 'monthly'
			? 30.44
			: frequency === 'quarterly'
				? 91.31
				: frequency === 'annually'
					? 365.25
					: (customDays ?? 30.44);
	return now.getTime() - last.getTime() <= (1.5 * interval + 7) * 86400000;
}
export interface DetectedSubscriptionInput {
	name: string;
	description?: string;
	amount: number;
	currency?: string;
	billingFrequency: Frequency;
	customFrequencyDays?: number;
	categoryId?: string;
	transactionIds: string[];
	isActive?: boolean;
	notes?: string;
	startDate?: Date | string;
	nextPaymentDate?: Date | string;
	website?: string;
	cancellationUrl?: string;
	patterns?: Array<{
		pattern: string;
		patternType: 'exact' | 'contains' | 'starts_with';
		confidence?: number;
	}>;
}
interface DetectionTransaction {
	id: string;
	date: string;
	amount: number;
	currency: string | null;
	type: string;
	subscription_id: string | null;
	is_subscription: number;
}
/** One synchronous transaction ensures an invalid candidate never leaves a half-confirmed batch. */
export interface SavedDetectedSubscription {
	subscription: Pick<
		Subscription,
		| 'id'
		| 'name'
		| 'amount'
		| 'currency'
		| 'billingFrequency'
		| 'nextPaymentDate'
		| 'isActive'
		| 'categoryId'
	>;
	flaggedTransactions: number;
	createdPatterns: number;
}
export function saveDetectedSubscriptions(
	db: Database,
	inputs: DetectedSubscriptionInput[],
	now = new Date(),
): SavedDetectedSubscription[] {
	if (!Array.isArray(inputs) || !inputs.length || inputs.length > 200)
		throw new Error('Select between 1 and 200 subscription candidates');
	return db.transaction(() =>
		inputs.map((input) => {
			if (
				!input ||
				typeof input.name !== 'string' ||
				!input.name.trim() ||
				!Number.isFinite(input.amount) ||
				input.amount <= 0
			)
				throw new Error('Subscription name and positive amount are required');
			if (!['monthly', 'quarterly', 'annually', 'custom'].includes(input.billingFrequency))
				throw new Error('Invalid billing frequency');
			if (input.isActive !== undefined && typeof input.isActive !== 'boolean')
				throw new Error('Active status must be true or false');
			if (
				!Array.isArray(input.transactionIds) ||
				!input.transactionIds.length ||
				new Set(input.transactionIds).size !== input.transactionIds.length ||
				input.transactionIds.some((id) => typeof id !== 'string')
			)
				throw new Error('Select distinct matching transactions');
			const rows = input.transactionIds
				.map((id) => {
					const row = db
						.query(
							'SELECT id,date,amount,currency,type,subscription_id,is_subscription FROM transactions WHERE id=?',
						)
						.get(id) as DetectionTransaction | null;
					if (!row) throw new Error('A matching transaction no longer exists; run detection again');
					if (row.subscription_id || row.is_subscription)
						throw new Error('A matching transaction is already linked; run detection again');
					if (row.type !== 'expense' || row.amount >= 0)
						throw new Error('Subscriptions can only be linked to expense payments');
					return row;
				})
				.sort((a, b) => a.date.localeCompare(b.date));
			const currency = currencyCode(input.currency ?? rows[0].currency);
			if (rows.some((row) => currencyCode(row.currency) !== currency))
				throw new Error('Candidate and payment currencies must match');
			const categoryId = input.categoryId || 'cat_uncategorized';
			if (!db.query('SELECT 1 FROM categories WHERE id=? AND is_active=1').get(categoryId))
				throw new Error('Select an active category');
			const last = new Date(rows.at(-1)!.date);
			const isActive =
				input.isActive ??
				hasRecentDetectedPayment(last, input.billingFrequency, input.customFrequencyDays, now);
			const calculatedNext = nextDetectedPayment(
				last,
				input.billingFrequency,
				input.customFrequencyDays,
				isActive ? now : undefined,
			);
			const next = input.nextPaymentDate ? new Date(input.nextPaymentDate) : calculatedNext;
			const start = input.startDate ? new Date(input.startDate) : new Date(rows[0].date);
			if (!Number.isFinite(next.getTime()) || !Number.isFinite(start.getTime()))
				throw new Error('Invalid subscription date');
			const patterns = input.patterns?.length
				? input.patterns
				: [{ pattern: input.name.trim(), patternType: 'contains' as const, confidence: 1 }];
			for (const pattern of patterns)
				if (
					typeof pattern.pattern !== 'string' ||
					!pattern.pattern.trim() ||
					!['exact', 'contains', 'starts_with'].includes(pattern.patternType) ||
					!Number.isFinite(pattern.confidence ?? 1) ||
					(pattern.confidence ?? 1) < 0 ||
					(pattern.confidence ?? 1) > 1
				)
					throw new Error('Invalid subscription matching pattern');
			const id = crypto.randomUUID(),
				timestamp = now.toISOString();
			db.query(
				`INSERT INTO subscriptions(id,name,description,amount,currency,billing_frequency,custom_frequency_days,next_payment_date,category_id,is_active,start_date,notes,website,cancellation_url,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			).run(
				id,
				input.name.trim(),
				input.description ?? null,
				input.amount,
				currency,
				input.billingFrequency,
				input.customFrequencyDays ?? null,
				next.toISOString(),
				categoryId,
				isActive ? 1 : 0,
				start.toISOString(),
				input.notes ?? null,
				input.website ?? null,
				input.cancellationUrl ?? null,
				timestamp,
				timestamp,
			);
			for (const pattern of patterns)
				db.query(
					`INSERT INTO subscription_patterns(id,subscription_id,pattern,pattern_type,confidence_score,created_by,is_active,created_at,updated_at) VALUES(?,?,?,?,?,'user',1,?,?)`,
				).run(
					crypto.randomUUID(),
					id,
					pattern.pattern,
					pattern.patternType,
					pattern.confidence ?? 1,
					timestamp,
					timestamp,
				);
			for (const row of rows)
				db.query(
					'UPDATE transactions SET subscription_id=?,is_subscription=1,updated_at=? WHERE id=?',
				).run(id, timestamp, row.id);
			return {
				subscription: {
					id,
					name: input.name.trim(),
					amount: input.amount,
					currency,
					billingFrequency: input.billingFrequency,
					nextPaymentDate: next,
					isActive,
					categoryId,
				},
				flaggedTransactions: rows.length,
				createdPatterns: patterns.length,
			};
		}),
	)();
}
