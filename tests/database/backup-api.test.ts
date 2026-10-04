import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '../../src/app/api/backups/route';
import { GET as exportData } from '../../src/app/api/data/export/route';
import { createTransactionRepository } from '../../src/lib/database';
import { getConnectionManager } from '../../src/lib/database/connection';
let temporary: string, previousPath: string | undefined;
beforeEach(async () => {
	temporary = mkdtempSync(join(tmpdir(), 'finance-backup-test-'));
	previousPath = process.env.FINANCE_DATABASE_PATH;
	process.env.FINANCE_DATABASE_PATH = join(temporary, 'finance.db');
	await getConnectionManager({ filename: ':memory:' }).close();
	const repo = createTransactionRepository();
	await repo.initialize();
	await repo.create({
		date: new Date('2026-10-01'),
		description: 'Backup original',
		amount: -10,
		type: 'expense',
		currency: 'NOK',
	});
});
afterEach(async () => {
	await getConnectionManager().close();
	if (previousPath === undefined) delete process.env.FINANCE_DATABASE_PATH;
	else process.env.FINANCE_DATABASE_PATH = previousPath;
	rmSync(temporary, { recursive: true, force: true });
});
describe('backup and export API', () => {
	it('requires explicit confirmation and retains a downloadable pre-restore copy', async () => {
		const downloaded = await GET(new NextRequest('http://localhost/api/backups'));
		expect(downloaded.headers.get('content-disposition')).toContain('attachment');
		const original = await downloaded.text();
		const validated = await POST(
			new NextRequest('http://localhost/api/backups', { method: 'POST', body: original }),
		);
		expect(validated.status).toBe(200);
		expect((await validated.json()).preview.totalRecords).toBeGreaterThan(0);
		const denied = await PUT(
			new NextRequest('http://localhost/api/backups', { method: 'PUT', body: original }),
		);
		expect(denied.status).toBe(400);
		const repo = createTransactionRepository();
		await repo.initialize();
		await repo.create({
			date: new Date('2026-10-02'),
			description: 'Later record',
			amount: -20,
			type: 'expense',
			currency: 'USD',
		});
		const restored = await PUT(
			new NextRequest('http://localhost/api/backups', {
				method: 'PUT',
				headers: { 'X-Confirm-Restore': 'REPLACE ALL FINANCE DATA' },
				body: original,
			}),
		);
		expect(restored.status).toBe(200);
		expect(await repo.findAll()).toHaveLength(1);
		const safety = await GET(new NextRequest('http://localhost/api/backups?safety=latest'));
		expect(safety.status).toBe(200);
		expect((await safety.json()).tables.transactions.rows).toHaveLength(2);
	});
	it('exports both complete portable JSON and transaction CSV', async () => {
		const json = await exportData(new NextRequest('http://localhost/api/data/export?format=json'));
		expect(json.status).toBe(200);
		expect((await json.json()).tables.transactions.rows).toHaveLength(1);
		const csv = await exportData(new NextRequest('http://localhost/api/data/export?format=csv'));
		expect(csv.headers.get('content-type')).toContain('text/csv');
		expect(await csv.text()).toContain('Backup original');
		const invalid = await exportData(
			new NextRequest('http://localhost/api/data/export?format=sql'),
		);
		expect(invalid.status).toBe(400);
	});
	it('rejects malformed files and reports missing safety copies', async () => {
		expect(
			(
				await POST(
					new NextRequest('http://localhost/api/backups', { method: 'POST', body: 'not JSON' }),
				)
			).status,
		).toBe(400);
		expect((await GET(new NextRequest('http://localhost/api/backups?safety=latest'))).status).toBe(
			404,
		);
	});
});
