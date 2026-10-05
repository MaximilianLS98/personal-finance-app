import type { Database } from 'bun:sqlite';
import { randomUUID } from 'node:crypto';
import type { LedgerRow } from './transaction-ledger';

export type TransferDecision = 'transfer' | 'cashflow';
interface Evidence extends LedgerRow {
	source_format?: string | null;
	source_type?: string | null;
	source_fee?: number | null;
	account_name?: string;
	filename?: string;
}
interface Rule {
	id: string;
	account_id: string;
	currency: string;
	direction: string;
	description: string;
	decision: TransferDecision;
}
export const normalizeTransferDescription = (text: string) =>
	text.trim().replace(/\s+/g, ' ').toUpperCase();

export function automaticTransferReason(row: Evidence): string | null {
	const revolut =
		row.source_format === 'revolut' ||
		(!row.source_format &&
			(/revolut/i.test(row.account_name ?? '') || /^account-statement_/i.test(row.filename ?? '')));
	if (!revolut || (row.source_fee != null && row.source_fee !== 0)) return null;
	if (
		(!row.source_type || row.source_type === 'Transfer') &&
		(/^(?:To|From) pocket .+ (?:from|to) [A-Z]{3}$/i.test(row.description) ||
			/^Pocket Withdrawal$/i.test(row.description))
	)
		return 'Revolut pocket movement between your own balances';
	if (row.source_type === 'Exchange' && row.source_fee === 0)
		return 'Revolut currency exchange between your own balances';
	return null;
}

function ruleMatches(rule: Rule, row: Evidence) {
	return (
		rule.account_id === row.account_id &&
		rule.currency === row.currency &&
		rule.direction === (row.amount < 0 ? 'out' : 'in') &&
		rule.description === normalizeTransferDescription(row.description)
	);
}
export function suggestedClassification(db: Database, row: Evidence) {
	const rule = (db.query('SELECT * FROM transfer_rules').all() as Rule[]).find((r) =>
		ruleMatches(r, row),
	);
	if (rule)
		return {
			decision: rule.decision,
			origin: 'rule' as const,
			reason: 'Remembered account and description rule',
			ruleId: rule.id,
		};
	const reason = automaticTransferReason(row);
	return reason
		? { decision: 'transfer' as const, origin: 'automatic' as const, reason, ruleId: null }
		: null;
}

export function transferDecision(db: Database, id: string) {
	return db.query('SELECT * FROM transfer_decisions WHERE transaction_id=?').get(id) as {
		decision: TransferDecision;
		origin: string;
		reason: string;
	} | null;
}
export function recordTransferDecision(
	db: Database,
	id: string,
	decision: TransferDecision,
	origin: 'manual' | 'automatic' | 'rule',
	reason: string,
	ruleId: string | null = null,
) {
	db.query(
		`INSERT INTO transfer_decisions VALUES(?,?,?,?,?) ON CONFLICT(transaction_id)
		DO UPDATE SET decision=excluded.decision,origin=excluded.origin,reason=excluded.reason,rule_id=excluded.rule_id`,
	).run(id, decision, origin, reason, ruleId);
}
function applyDecision(
	db: Database,
	row: Evidence,
	decision: TransferDecision,
	origin: 'manual' | 'automatic' | 'rule',
	reason: string,
	ruleId: string | null = null,
) {
	db.query('UPDATE transactions SET type=?,updated_at=? WHERE id=?').run(
		decision === 'transfer' ? 'transfer' : row.amount < 0 ? 'expense' : 'income',
		new Date().toISOString(),
		row.id,
	);
	recordTransferDecision(db, row.id, decision, origin, reason, ruleId);
}

// Never change a split purchase, linked refund, or matched pair behind the user's back.
export const eligibleTransferSql = `NOT EXISTS(SELECT 1 FROM transfer_matches m WHERE t.id=m.incoming_id OR t.id=m.outgoing_id)
	AND NOT EXISTS(SELECT 1 FROM transaction_allocations a WHERE a.transaction_id=t.id)
	AND NOT EXISTS(SELECT 1 FROM refund_links r WHERE r.refund_id=t.id OR r.purchase_id=t.id)`;

export function classifyKnownTransfers(db: Database) {
	let classified = 0;
	const rows = db
		.query(
			`SELECT t.*,a.name account_name,b.filename FROM transactions t
		LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN import_batches b ON b.id=t.import_id
		WHERE ${eligibleTransferSql} AND NOT EXISTS(SELECT 1 FROM transfer_decisions d WHERE d.transaction_id=t.id)`,
		)
		.all() as Evidence[];
	for (const row of rows) {
		if (row.type === 'transfer') continue; // Preserve earlier manual edits.
		const suggestion = suggestedClassification(db, row);
		if (suggestion) {
			applyDecision(
				db,
				row,
				suggestion.decision,
				suggestion.origin,
				suggestion.reason,
				suggestion.ruleId,
			);
			classified++;
		}
	}
	return classified;
}

export function setTransferClassification(
	db: Database,
	input: {
		id: string;
		decision: TransferDecision;
		remember?: boolean;
		applyHistory?: boolean;
	},
) {
	return db.transaction(() => {
		if (
			typeof input.id !== 'string' ||
			!['transfer', 'cashflow'].includes(input.decision) ||
			(input.remember !== undefined && typeof input.remember !== 'boolean') ||
			(input.applyHistory !== undefined && typeof input.applyHistory !== 'boolean')
		)
			throw new Error('Choose a transaction and transfer or cash flow');
		const row = db
			.query(`SELECT t.* FROM transactions t WHERE t.id=? AND ${eligibleTransferSql}`)
			.get(input.id) as Evidence | null;
		if (!row)
			throw new Error(
				'Unmatch this transfer or remove its splits and refund links before changing classification',
			);
		let ruleId: string | null = null;
		const rule: Rule = {
			id: randomUUID(),
			account_id: row.account_id!,
			currency: row.currency!,
			direction: row.amount < 0 ? 'out' : 'in',
			description: normalizeTransferDescription(row.description),
			decision: input.decision,
		};
		if (input.remember || input.applyHistory) {
			if (!row.account_id || !row.currency)
				throw new Error(
					'Assign an account and currency before remembering a rule or applying it to history',
				);
		}
		if (input.remember) {
			const existing = db
				.query(
					'SELECT id FROM transfer_rules WHERE account_id=? AND currency=? AND direction=? AND description=?',
				)
				.get(rule.account_id, rule.currency, rule.direction, rule.description) as {
				id: string;
			} | null;
			ruleId = existing?.id ?? rule.id;
			db.query(
				`INSERT INTO transfer_rules VALUES(?,?,?,?,?,?) ON CONFLICT(account_id,currency,direction,description) DO UPDATE SET decision=excluded.decision`,
			).run(
				ruleId,
				rule.account_id,
				rule.currency,
				rule.direction,
				rule.description,
				rule.decision,
			);
		}
		let changed = 1;
		if (input.applyHistory) {
			const others = db
				.query(
					`SELECT t.* FROM transactions t WHERE t.id!=? AND ${eligibleTransferSql}
				AND NOT EXISTS(SELECT 1 FROM transfer_decisions d WHERE d.transaction_id=t.id AND d.origin='manual')`,
				)
				.all(row.id) as Evidence[];
			for (const other of others.filter((other) => ruleMatches(rule, other))) {
				applyDecision(
					db,
					other,
					input.decision,
					ruleId ? 'rule' : 'manual',
					'Applied to matching account, direction and description',
					ruleId,
				);
				changed++;
			}
		}
		applyDecision(db, row, input.decision, 'manual', 'Your explicit classification');
		return { changed, ruleId };
	})();
}

export function listTransferRules(db: Database) {
	return db
		.query(
			'SELECT r.*,a.name account_name FROM transfer_rules r JOIN accounts a ON a.id=r.account_id ORDER BY a.name,r.description',
		)
		.all() as (Rule & { account_name: string })[];
}
export function deleteTransferRule(db: Database, id: string) {
	if (typeof id !== 'string' || !db.query('SELECT 1 FROM transfer_rules WHERE id=?').get(id))
		throw new Error('Rule not found');
	// Historical classifications remain explicit and reviewable. Deleting a rule only stops future application.
	db.query('DELETE FROM transfer_rules WHERE id=?').run(id);
}
