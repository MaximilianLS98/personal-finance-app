import type { Database } from 'bun:sqlite';
import { currencyCode, money, validCurrency } from './money';
import type { Budget, BudgetProgress } from './types';

const DAY = 86400000;
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);
export function parseDay(value: unknown): string {
	if (
		typeof value !== 'string' ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		isoDay(new Date(value)) !== value
	)
		throw new Error('Enter a valid date (YYYY-MM-DD)');
	return value;
}
export function spendingSource(db: Database) {
	return db
		.query("SELECT 1 FROM sqlite_master WHERE type='view' AND name='effective_transactions'")
		.get()
		? 'effective_transactions'
		: 'transactions';
}
export type CycleSettings = { payday: number; rollover: 'none' | 'positive' | 'all' };
export function cycleSettings(db: Database, id: string): CycleSettings {
	return (
		(db
			.query('SELECT payday, rollover FROM budget_cycle_settings WHERE budget_id=?')
			.get(id) as CycleSettings | null) ?? { payday: 1, rollover: 'none' }
	);
}
export function saveCycleSettings(db: Database, id: string, input: CycleSettings) {
	if (
		!Number.isInteger(input.payday) ||
		input.payday < 1 ||
		input.payday > 31 ||
		!['none', 'positive', 'all'].includes(input.rollover)
	)
		throw new Error('Payday must be 1–31 and rollover must be none, positive or all');
	const budget = db.query('SELECT period FROM budgets WHERE id=?').get(id) as {
		period: string;
	} | null;
	if (!budget) throw new Error('Budget not found');
	if (budget.period === 'yearly' && input.payday !== 1)
		throw new Error('Payday cycles apply to monthly budgets');
	db.query(
		'INSERT INTO budget_cycle_settings (budget_id,payday,rollover) VALUES (?,?,?) ON CONFLICT(budget_id) DO UPDATE SET payday=excluded.payday,rollover=excluded.rollover',
	).run(id, input.payday, input.rollover);
}
function monthAnchor(year: number, month: number, day: number) {
	const first = new Date(Date.UTC(year, month, 1));
	return new Date(
		Date.UTC(
			first.getUTCFullYear(),
			first.getUTCMonth(),
			Math.min(
				day,
				new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(),
			),
		),
	);
}
export function budgetWindow(budget: Budget, settings: CycleSettings, at: Date) {
	const first = new Date(`${isoDay(budget.startDate)}T00:00:00Z`);
	const last = new Date(`${isoDay(budget.endDate)}T00:00:00Z`);
	const ref = new Date(Math.max(first.getTime(), Math.min(at.getTime(), last.getTime())));
	let start: Date, end: Date;
	if (budget.period === 'monthly') {
		start = monthAnchor(ref.getUTCFullYear(), ref.getUTCMonth(), settings.payday);
		if (start > ref)
			start = monthAnchor(ref.getUTCFullYear(), ref.getUTCMonth() - 1, settings.payday);
		end = new Date(
			monthAnchor(start.getUTCFullYear(), start.getUTCMonth() + 1, settings.payday).getTime() - DAY,
		);
	} else {
		start = new Date(Date.UTC(ref.getUTCFullYear(), 0, 1));
		end = new Date(Date.UTC(ref.getUTCFullYear(), 11, 31));
	}
	return {
		start: new Date(Math.max(first.getTime(), start.getTime())),
		end: new Date(Math.min(last.getTime(), end.getTime())),
	};
}
export type PeriodRecord = {
	start: string;
	end: string;
	baseAmount: number;
	carried: number;
	available: number;
	spent: number;
	remaining: number;
};
export function budgetHistory(db: Database, budget: Budget, at = new Date()): PeriodRecord[] {
	const settings = cycleSettings(db, budget.id);
	const target = budgetWindow(budget, settings, at);
	let cursor = new Date(budget.startDate),
		carry = 0;
	const result: PeriodRecord[] = [];
	// Limit unreasonable imported dates rather than silently truncating rollover history.
	if ((target.start.getTime() - cursor.getTime()) / DAY > 366 * 200)
		throw new Error('Budget history exceeds 200 years');
	while (cursor <= target.end) {
		const window = budgetWindow(budget, settings, cursor);
		const spent = (
			db
				.query(
					`SELECT COALESCE(SUM(-amount),0) AS total FROM ${spendingSource(db)} WHERE type='expense' AND category_id=? AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN'))=? AND substr(date,1,10)>=? AND substr(date,1,10)<=?`,
				)
				.get(
					budget.categoryId,
					currencyCode(budget.currency),
					isoDay(window.start),
					isoDay(new Date(Math.min(window.end.getTime(), at.getTime()))),
				) as { total: number }
		).total;
		const available = money(budget.amount + carry),
			remaining = money(available - spent);
		result.push({
			start: isoDay(window.start),
			end: isoDay(window.end),
			baseAmount: budget.amount,
			carried: carry,
			available,
			spent: money(spent),
			remaining,
		});
		carry =
			settings.rollover === 'all'
				? remaining
				: settings.rollover === 'positive'
					? Math.max(0, remaining)
					: 0;
		cursor = new Date(window.end.getTime() + DAY);
	}
	return result;
}
type Recurring = {
	id: string;
	amount: number;
	next_payment_date: string;
	billing_frequency: string;
	custom_frequency_days: number | null;
	start_date: string;
	end_date: string | null;
};
function occurrence(base: Date, index: number, subscription: Recurring) {
	if (subscription.billing_frequency === 'custom')
		return new Date(
			base.getTime() + index * Math.max(1, subscription.custom_frequency_days ?? 30) * DAY,
		);
	const months =
		subscription.billing_frequency === 'monthly'
			? 1
			: subscription.billing_frequency === 'quarterly'
				? 3
				: 12;
	return monthAnchor(base.getUTCFullYear(), base.getUTCMonth() + index * months, base.getUTCDate());
}
export function budgetForecast(db: Database, budget: Budget, at = new Date()): BudgetProgress {
	const history = budgetHistory(db, budget, at);
	const period = history.at(-1)!;
	const currentSpent = period.spent;
	const start = new Date(period.start),
		end = new Date(period.end);
	const source = spendingSource(db);
	// A refund inherits the original purchase's subscription ownership.
	const subscriptionOwner =
		source === 'effective_transactions'
			? `(t.subscription_id IS NOT NULL OR EXISTS(SELECT 1 FROM refund_links r JOIN transactions p ON p.id=r.purchase_id WHERE r.refund_id=t.id AND p.subscription_id IS NOT NULL))`
			: 't.subscription_id IS NOT NULL';
	const paid = (
		db
			.query(
				`SELECT COALESCE(SUM(-e.amount),0) AS total FROM ${source} e JOIN transactions t ON t.id=e.id WHERE e.type='expense' AND e.category_id=? AND UPPER(COALESCE(NULLIF(TRIM(e.currency),''),'UNKNOWN'))=? AND ${subscriptionOwner} AND substr(e.date,1,10)>=? AND substr(e.date,1,10)<=?`,
			)
			.get(
				budget.categoryId,
				currencyCode(budget.currency),
				period.start,
				isoDay(new Date(Math.min(at.getTime(), end.getTime()))),
			) as { total: number }
	).total;
	const subscriptions = db
		.query(
			`SELECT id,amount,next_payment_date,billing_frequency,custom_frequency_days,start_date,end_date FROM subscriptions WHERE category_id=? AND is_active=1 AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN'))=?`,
		)
		.all(budget.categoryId, currencyCode(budget.currency)) as Recurring[];
	let upcoming = 0;
	for (const sub of subscriptions) {
		const base = new Date(sub.next_payment_date);
		if (!Number.isFinite(base.getTime())) continue;
		for (let i = 0; i < 10000; i++) {
			const due = occurrence(base, i, sub);
			if (due > end || (sub.end_date && isoDay(due) > sub.end_date.slice(0, 10))) break;
			if (due < start || isoDay(due) < sub.start_date.slice(0, 10)) continue;
			// Exclude a bill already linked in its billing interval, including early payments.
			const previous = occurrence(base, i - 1, sub);
			const next = occurrence(base, i + 1, sub);
			const midpointBefore = isoDay(new Date((previous.getTime() + due.getTime()) / 2));
			const midpointAfter = isoDay(new Date((next.getTime() + due.getTime()) / 2));
			const settled = db
				.query(
					`SELECT 1 FROM transactions WHERE subscription_id=? AND type='expense' AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN'))=? AND substr(date,1,10)>? AND substr(date,1,10)<=? AND substr(date,1,10)<=? LIMIT 1`,
				)
				.get(sub.id, currencyCode(budget.currency), midpointBefore, midpointAfter, isoDay(at));
			if (!settled) upcoming += sub.amount;
		}
	}
	const daysRemaining = Math.max(
		0,
		Math.round((end.getTime() - Math.max(start.getTime(), new Date(isoDay(at)).getTime())) / DAY),
	);
	const elapsed = Math.max(
		1,
		Math.min(
			Math.round((end.getTime() - start.getTime()) / DAY) + 1,
			Math.round((new Date(isoDay(at)).getTime() - start.getTime()) / DAY) + 1,
		),
	);
	const variableSpent = money(currentSpent - paid);
	const averageDailySpend = Math.max(0, variableSpent) / elapsed;
	const projectedSpent = money(currentSpent + upcoming + averageDailySpend * daysRemaining);
	const percentageSpent =
		period.available > 0 ? (currentSpent / period.available) * 100 : currentSpent > 0 ? 100 : 0;
	return {
		budgetId: budget.id,
		budget,
		currentSpent,
		remainingAmount: money(period.available - currentSpent),
		percentageSpent,
		status:
			currentSpent >= period.available
				? 'over-budget'
				: projectedSpent > period.available
					? 'at-risk'
					: 'on-track',
		projectedSpent,
		daysRemaining,
		averageDailySpend,
		subscriptionAllocated: money(paid + upcoming),
		variableSpent,
		lastUpdated: at,
		subscriptionPaid: money(paid),
		upcomingCommitted: money(upcoming),
		discretionaryRemaining: money(period.available - currentSpent - upcoming),
		rolloverAmount: period.carried,
		availableAmount: period.available,
		periodStart: period.start,
		periodEnd: period.end,
	};
}

export interface GoalInput {
	name: string;
	description?: string;
	target: number;
	currency: string;
	deadline: string;
}
export interface Goal extends GoalInput {
	id: string;
	saved: number;
	remaining: number;
	progress: number;
	monthsRemaining: number;
	monthlyRequired: number;
	overdue: boolean;
	plannedMonthly: number;
	capacity: number | null;
	otherGoalsMonthly: number;
	affordable: boolean | null;
	suggestedMonths: number | null;
}
function validateGoal(input: GoalInput, creating: boolean) {
	if (!input.name?.trim() || input.name.length > 120)
		throw new Error('Enter a goal name (up to 120 characters)');
	if (!Number.isFinite(input.target) || input.target <= 0)
		throw new Error('Target must be positive');
	if (!validCurrency(input.currency)) throw new Error('Select a three-letter currency');
	parseDay(input.deadline);
	if (creating && input.deadline <= isoDay(new Date()))
		throw new Error('Deadline must be in the future');
}
export function saveGoal(db: Database, input: GoalInput, id?: string) {
	validateGoal(input, !id);
	const goalId = id ?? crypto.randomUUID();
	if (id) {
		const old = db.query('SELECT currency FROM savings_goals WHERE id=?').get(id) as {
			currency: string;
		} | null;
		if (!old) throw new Error('Goal not found');
		if (
			old.currency !== input.currency &&
			(db.query('SELECT 1 FROM goal_contributions WHERE goal_id=? LIMIT 1').get(id) ||
				db.query('SELECT 1 FROM goal_subscription_plans WHERE goal_id=? LIMIT 1').get(id))
		)
			throw new Error('Currency cannot change while contributions or subscription plans exist');
		db.query(
			'UPDATE savings_goals SET name=?,description=?,target=?,currency=?,deadline=? WHERE id=?',
		).run(
			input.name.trim(),
			input.description ?? '',
			money(input.target),
			input.currency,
			input.deadline,
			id,
		);
	} else
		db.query(
			'INSERT INTO savings_goals(id,name,description,target,currency,deadline) VALUES(?,?,?,?,?,?)',
		).run(
			goalId,
			input.name.trim(),
			input.description ?? '',
			money(input.target),
			input.currency,
			input.deadline,
		);
	return goalId;
}
export function saveContribution(
	db: Database,
	goalId: string,
	input: { amount: number; date: string; note?: string },
	id?: string,
) {
	if (!db.query('SELECT 1 FROM savings_goals WHERE id=?').get(goalId))
		throw new Error('Goal not found');
	if (!Number.isFinite(input.amount) || money(input.amount) <= 0)
		throw new Error('Contribution must be positive');
	parseDay(input.date);
	if (input.date > isoDay(new Date())) throw new Error('Contributions cannot be future-dated');
	if (id && !db.query('SELECT 1 FROM goal_contributions WHERE id=? AND goal_id=?').get(id, goalId))
		throw new Error('Contribution not found');
	const contributionId = id ?? crypto.randomUUID();
	if (id)
		db.query('UPDATE goal_contributions SET amount=?,date=?,note=? WHERE id=? AND goal_id=?').run(
			money(input.amount),
			input.date,
			input.note ?? '',
			id,
			goalId,
		);
	else
		db.query('INSERT INTO goal_contributions(id,goal_id,amount,date,note) VALUES(?,?,?,?,?)').run(
			contributionId,
			goalId,
			money(input.amount),
			input.date,
			input.note ?? '',
		);
	return contributionId;
}
export function monthlySubscription(amount: number, frequency: string, days: number | null) {
	return money(
		frequency === 'monthly'
			? amount
			: frequency === 'quarterly'
				? amount / 3
				: frequency === 'annually'
					? amount / 12
					: (amount * 365.25) / 12 / Math.max(1, days ?? 30),
	);
}
export function planSubscription(db: Database, goalId: string, subscriptionId: string) {
	const goal = db.query('SELECT currency FROM savings_goals WHERE id=?').get(goalId) as {
		currency: string;
	} | null;
	const sub = db
		.query('SELECT currency,is_active FROM subscriptions WHERE id=?')
		.get(subscriptionId) as { currency: string; is_active: number } | null;
	if (!goal || !sub) throw new Error('Goal or subscription not found');
	if (currencyCode(sub.currency) !== goal.currency)
		throw new Error('Goal and subscription currencies must match');
	if (!sub.is_active) throw new Error('Choose an active subscription');
	db.query(
		'INSERT INTO goal_subscription_plans(subscription_id,goal_id) VALUES(?,?) ON CONFLICT(subscription_id) DO UPDATE SET goal_id=excluded.goal_id',
	).run(subscriptionId, goalId);
}
export function listGoals(db: Database, at = new Date()): Goal[] {
	const rows = db
		.query(
			'SELECT g.*,COALESCE(SUM(c.amount),0) AS saved FROM savings_goals g LEFT JOIN goal_contributions c ON c.goal_id=g.id GROUP BY g.id ORDER BY g.deadline',
		)
		.all() as Array<GoalInput & { id: string; saved: number }>;
	const goals = rows.map((row) => {
		const remaining = money(Math.max(0, row.target - row.saved));
		const monthsRemaining = Math.max(
			1,
			Math.ceil((new Date(row.deadline).getTime() - at.getTime()) / DAY / 30.4375),
		);
		const plans = db
			.query(
				'SELECT s.amount,s.billing_frequency,s.custom_frequency_days FROM subscriptions s JOIN goal_subscription_plans p ON p.subscription_id=s.id WHERE p.goal_id=? AND s.is_active=1 AND s.currency=?',
			)
			.all(row.id, row.currency) as {
			amount: number;
			billing_frequency: string;
			custom_frequency_days: number | null;
		}[];
		const plannedMonthly = money(
			plans.reduce(
				(n, s) => n + monthlySubscription(s.amount, s.billing_frequency, s.custom_frequency_days),
				0,
			),
		);
		return {
			...row,
			saved: money(row.saved),
			remaining,
			progress: Math.min(100, (row.saved / row.target) * 100),
			monthsRemaining,
			monthlyRequired: money(remaining / monthsRemaining),
			overdue: row.deadline < isoDay(at) && remaining > 0,
			plannedMonthly,
		};
	});
	return goals.map((goal) => {
		const end = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
		const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 3, 1));
		// Three complete months, including months with no activity. Transfers never count as capacity.
		const balance = db
			.query(
				`SELECT COALESCE(SUM(amount),0) AS net,COUNT(*) AS count FROM ${spendingSource(db)} WHERE type IN ('income','expense') AND UPPER(COALESCE(NULLIF(TRIM(currency),''),'UNKNOWN'))=? AND substr(date,1,10)>=? AND substr(date,1,10)<?`,
			)
			.get(goal.currency, isoDay(start), isoDay(end)) as { net: number; count: number };
		const capacity = balance.count ? money(Math.max(0, balance.net / 3)) : null;
		const otherGoalsMonthly = money(
			goals
				.filter((g) => g.id !== goal.id && g.currency === goal.currency)
				.reduce((n, g) => n + g.monthlyRequired, 0),
		);
		const available = capacity === null ? null : Math.max(0, capacity - otherGoalsMonthly);
		return {
			...goal,
			capacity,
			otherGoalsMonthly,
			affordable: available === null ? null : goal.monthlyRequired <= available,
			suggestedMonths:
				available && goal.remaining > 0 ? Math.ceil(goal.remaining / available) : null,
		};
	});
}
