import type { Database } from 'bun:sqlite';
import { money } from './money';
export function monthlyOverview(db: Database, month: string) {
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Provide a valid month');
	const start = `${month}-01`,
		end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
			.toISOString()
			.slice(0, 10);
	const totals = db
		.query(
			`SELECT COALESCE(currency,'UNKNOWN') currency,
  ROUND(SUM(CASE WHEN type='income' THEN amount ELSE 0 END),2) income,
  ROUND(SUM(CASE WHEN type='expense' THEN -amount ELSE 0 END),2) expenses,
  COUNT(DISTINCT id) count FROM effective_transactions WHERE substr(date,1,7)=? GROUP BY COALESCE(currency,'UNKNOWN') ORDER BY currency`,
		)
		.all(month) as { currency: string; income: number; expenses: number; count: number }[];
	const categories = db
		.query(
			`SELECT COALESCE(e.category_id,'cat_uncategorized') categoryId,COALESCE(c.name,'Uncategorized') name,COALESCE(c.color,'#9CA3AF') color,
  COALESCE(e.currency,'UNKNOWN') currency,ROUND(SUM(-e.amount),2) amount,COUNT(DISTINCT e.id) count
  FROM effective_transactions e LEFT JOIN categories c ON c.id=e.category_id WHERE e.type='expense' AND substr(e.date,1,7)=?
  GROUP BY e.category_id,COALESCE(e.currency,'UNKNOWN') ORDER BY amount DESC`,
		)
		.all(month) as {
		categoryId: string;
		name: string;
		color: string;
		currency: string;
		amount: number;
		count: number;
	}[];
	const latest = db.query('SELECT MAX(date) date FROM transactions').get() as {
		date: string | null;
	};
	const review = db
		.query(
			"SELECT COUNT(*) count FROM transactions t WHERE type='expense' AND (category_id IS NULL OR category_id='cat_uncategorized') AND substr(date,1,7)=? AND NOT EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=t.id)",
		)
		.get(month) as { count: number };
	const upcoming = db
		.query(
			"SELECT id,name,amount,COALESCE(currency,'UNKNOWN') currency,next_payment_date date FROM subscriptions WHERE is_active=1 AND substr(next_payment_date,1,10)>=? AND substr(next_payment_date,1,10)<=? ORDER BY next_payment_date LIMIT 20",
		)
		.all(start, end) as {
		id: string;
		name: string;
		amount: number;
		currency: string;
		date: string;
	}[];
	const budgets = db
		.query(
			`SELECT b.id,b.name,b.currency,b.amount,
  COALESCE((SELECT SUM(-e.amount) FROM effective_transactions e WHERE e.type='expense' AND e.category_id=b.category_id AND COALESCE(e.currency,'UNKNOWN')=b.currency AND substr(e.date,1,10)>=substr(b.start_date,1,10) AND substr(e.date,1,10)<=substr(b.end_date,1,10)),0) spent
  FROM budgets b LEFT JOIN budget_scenarios s ON s.id=b.scenario_id
  WHERE b.is_active=1 AND (b.scenario_id IS NULL OR s.is_active=1) AND substr(b.start_date,1,10)<=? AND substr(b.end_date,1,10)>=?`,
		)
		.all(end, start) as {
		id: string;
		name: string;
		currency: string;
		amount: number;
		spent: number;
	}[];
	const goals = db
		.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='savings_goals'")
		.get()
		? (db
				.query(
					'SELECT g.id,g.name,g.currency,g.target,COALESCE(SUM(c.amount),0) saved FROM savings_goals g LEFT JOIN goal_contributions c ON c.goal_id=g.id GROUP BY g.id ORDER BY g.created_at DESC LIMIT 5',
				)
				.all() as { id: string; name: string; currency: string; target: number; saved: number }[])
		: [];
	return {
		goals,
		month,
		totals: totals.map((t) => ({ ...t, net: money(t.income - t.expenses) })),
		categories,
		latestDate: latest.date,
		reviewCount: review.count,
		upcoming,
		budgetRisks: budgets
			.filter((b) => b.spent >= b.amount * 0.8)
			.map((b) => ({ ...b, spent: money(b.spent) })),
	};
}
