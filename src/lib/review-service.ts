import type { Database } from 'bun:sqlite';
import { currencyCode, money } from './money';
import type { LedgerRow } from './transaction-ledger';

interface Rule {
	category_id: string;
	pattern: string;
	pattern_type: string;
	confidence_score: number;
}
interface Change {
	id: string;
	categoryId: string | null;
}
export function matchesRule(description: string, pattern: string, type: string) {
	const text = description.toUpperCase(),
		target = pattern.toUpperCase();
	if (type === 'exact') return text === target;
	if (type === 'starts_with') return text.startsWith(target);
	if (type === 'contains') return text.includes(target);
	try {
		return pattern.length <= 200 && new RegExp(pattern, 'i').test(description);
	} catch {
		return false;
	}
}
export function reviewInbox(db: Database, month?: string) {
	if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Provide a valid month');
	const rows = db
		.query(
			"SELECT * FROM transactions WHERE type='expense' AND (category_id IS NULL OR category_id='cat_uncategorized') AND (? IS NULL OR substr(date,1,7)=?) AND NOT EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=transactions.id) ORDER BY date DESC",
		)
		.all(month ?? null, month ?? null) as LedgerRow[];
	const rules = db
		.query('SELECT * FROM category_rules WHERE is_active=1 ORDER BY confidence_score DESC')
		.all() as Rule[];
	const groups = new Map<
		string,
		{
			merchant: string;
			currency: string;
			ids: string[];
			amount: number;
			suggestion: { categoryId: string; confidence: number } | null;
		}
	>();
	for (const row of rows) {
		const merchant = row.description.trim().replace(/\s+/g, ' ').toUpperCase();
		const key = JSON.stringify([merchant, currencyCode(row.currency)]);
		const rule = rules.find((rule) =>
			matchesRule(row.description, rule.pattern, rule.pattern_type),
		);
		const group = groups.get(key) ?? {
			merchant,
			currency: currencyCode(row.currency),
			ids: [],
			amount: 0,
			suggestion: rule ? { categoryId: rule.category_id, confidence: rule.confidence_score } : null,
		};
		group.ids.push(row.id);
		group.amount = money(group.amount - row.amount);
		groups.set(key, group);
	}
	const duplicates = db
		.query(
			"SELECT date,description,amount,COALESCE(currency,'UNKNOWN') currency,account_id,COUNT(*) count,GROUP_CONCAT(id) ids FROM transactions WHERE (? IS NULL OR substr(date,1,7)=?) GROUP BY date,description,amount,currency,account_id HAVING COUNT(*)>1 ORDER BY date DESC LIMIT 100",
		)
		.all(month ?? null, month ?? null);
	return {
		groups: [...groups.values()],
		total: rows.length,
		duplicates,
		actions: db
			.query(
				'SELECT id,created_at,category_id,undone_at,json_array_length(changes_json) count FROM review_actions ORDER BY created_at DESC,rowid DESC LIMIT 20',
			)
			.all(),
	};
}
export function applyReview(
	db: Database,
	input: {
		ids?: string[];
		categoryId: string;
		pattern?: string;
		applyHistory?: boolean;
		createRule?: boolean;
	},
) {
	return db.transaction(() => {
		if (
			!input.categoryId ||
			!db.query('SELECT 1 FROM categories WHERE id=? AND is_active=1').get(input.categoryId)
		)
			throw new Error('Select an active category');
		if (
			!Array.isArray(input.ids) ||
			!input.ids.length ||
			input.ids.length > 10000 ||
			input.ids.some((id) => typeof id !== 'string')
		)
			throw new Error('Select transactions to review');
		if (
			(input.applyHistory || input.createRule) &&
			(!input.pattern?.trim() || input.pattern.length > 200)
		)
			throw new Error('Provide a merchant pattern of 1 to 200 characters');
		const selected = new Set(input.ids);
		const rows = db
			.query(
				"SELECT * FROM transactions WHERE type='expense' AND NOT EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=transactions.id)",
			)
			.all() as LedgerRow[];
		const targets = rows.filter(
			(row) =>
				selected.has(row.id) ||
				(input.applyHistory && matchesRule(row.description, input.pattern!, 'contains')),
		);
		if (input.ids.some((id) => !targets.some((row) => row.id === id)))
			throw new Error('A selected transaction is unavailable or split; refresh the review');
		const changes: Change[] = targets.map((row) => ({ id: row.id, categoryId: row.category_id }));
		let ruleId: string | null = null;
		if (input.createRule) {
			ruleId = crypto.randomUUID();
			db.query(
				"INSERT INTO category_rules(id,category_id,pattern,pattern_type,confidence_score,usage_count,created_by) VALUES(?,?,?,'contains',1,?,'user')",
			).run(ruleId, input.categoryId, input.pattern!.trim(), targets.length);
		}
		for (const row of targets)
			db.query('UPDATE transactions SET category_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
				input.categoryId,
				row.id,
			);
		const id = crypto.randomUUID();
		db.query('INSERT INTO review_actions(id,category_id,rule_id,changes_json) VALUES(?,?,?,?)').run(
			id,
			input.categoryId,
			ruleId,
			JSON.stringify(changes),
		);
		return { id, count: changes.length };
	})();
}
export function undoReview(db: Database, id: string) {
	return db.transaction(() => {
		const action = db.query('SELECT * FROM review_actions WHERE id=?').get(id) as {
			category_id: string;
			rule_id: string | null;
			changes_json: string;
			undone_at: string | null;
		} | null;
		if (!action || action.undone_at)
			throw new Error('Review action is unavailable or already undone');
		const changes = JSON.parse(action.changes_json) as Change[];
		// Refuse stale undo instead of overwriting a later manual categorization.
		for (const change of changes) {
			const later = db
				.query(
					`SELECT 1 FROM review_actions a, json_each(a.changes_json) item
                WHERE a.rowid > (SELECT rowid FROM review_actions WHERE id=?)
                AND a.undone_at IS NULL AND json_extract(item.value,'$.id')=? LIMIT 1`,
				)
				.get(id, change.id);
			if (later)
				throw new Error(
					'A transaction was changed after this review; undo the later changes first',
				);
			const current = db
				.query('SELECT category_id FROM transactions WHERE id=?')
				.get(change.id) as { category_id: string | null } | null;
			if (current && current.category_id !== action.category_id)
				throw new Error(
					'A transaction was changed after this review; undo the later changes first',
				);
		}
		for (const change of changes)
			db.query('UPDATE transactions SET category_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(
				change.categoryId,
				change.id,
			);
		if (action.rule_id) db.query('DELETE FROM category_rules WHERE id=?').run(action.rule_id);
		db.query('UPDATE review_actions SET undone_at=CURRENT_TIMESTAMP WHERE id=?').run(id);
		return { count: changes.length };
	})();
}
