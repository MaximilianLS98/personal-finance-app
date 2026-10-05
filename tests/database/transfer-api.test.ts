import { beforeEach, afterEach, it, expect } from 'bun:test';
import { financeDb } from '../../src/lib/finance-db';
import { getConnectionManager, resetConnectionManager } from '../../src/lib/database/connection';
import { createAccount, commitImport } from '../../src/lib/ledger-service';
import { GET, POST, DELETE } from '../../src/app/api/transfers/route';
import { transactionDetails } from '../../src/lib/transaction-ledger';
let id: string;
beforeEach(async () => {
	resetConnectionManager();
	getConnectionManager({ filename: ':memory:' });
	const db = await financeDb();
	const a = createAccount(db, {
		name: 'Synthetic bank',
		currency: 'NOK',
		openingDate: '2026-01-01',
	});
	commitImport(db, 'Date,Description,Amount\n2026-10-01,Own account,-100', 'synthetic.csv', {
		accountId: a.id,
	});
	id = (db.query('SELECT id FROM transactions').get() as { id: string }).id;
});
afterEach(async () => {
	await getConnectionManager().close();
	resetConnectionManager();
});
const request = (body: unknown) =>
	new Request('http://localhost/api/transfers', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
it('classifies, remembers, reports provenance and removes a rule through HTTP', async () => {
	const result = await POST(
		request({ action: 'classify', id, decision: 'transfer', remember: true }),
	);
	expect(result.status).toBe(200);
	const body = await result.json();
	const state = await (await GET()).json();
	expect(state.rules).toHaveLength(1);
	const details = transactionDetails(await financeDb(), id);
	expect(details.transaction.type).toBe('transfer');
	expect(details.transferDecision?.origin).toBe('manual');
	expect(details.account?.name).toBe('Synthetic bank');
	expect((await DELETE(request({ action: 'rule', id: body.ruleId }))).status).toBe(200);
	expect((await (await GET()).json()).rules).toHaveLength(0);
	expect((await POST(request({ action: 'detect' }))).status).toBe(200);
	expect(transactionDetails(await financeDb(), id).transaction.type).toBe('transfer');
});
it('rejects invalid classifications and flags without partial rules or type changes', async () => {
	for (const bad of [
		{ decision: 'income' },
		{ decision: 'transfer', remember: 'yes' },
		{ decision: 'transfer', applyHistory: 1 },
	]) {
		expect((await POST(request({ action: 'classify', id, ...bad }))).status).toBe(400);
	}
	expect((await POST(request({ action: 'not-an-action' }))).status).toBe(400);
	expect((await (await GET()).json()).rules).toHaveLength(0);
	expect(transactionDetails(await financeDb(), id).transaction.type).toBe('expense');
});
