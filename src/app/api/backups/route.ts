import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { financeDb } from '@/lib/finance-db';
import {
	backupSummary,
	createFinanceBackup,
	restoreFinanceBackup,
	validateFinanceBackup,
} from '@/lib/finance-backup';

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
function safetyDirectory() {
	return join(dirname(process.env.FINANCE_DATABASE_PATH || 'data/finance-tracker.db'), 'backups');
}
function download(value: string, name: string) {
	return new NextResponse(value, {
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Disposition': `attachment; filename="${name}"`,
			'Cache-Control': 'no-store',
		},
	});
}
export async function GET(request: NextRequest) {
	try {
		if (new URL(request.url).searchParams.get('safety') === 'latest') {
			let files: string[] = [];
			try {
				files = readdirSync(safetyDirectory())
					.filter((name) => /^before-restore-[\dT-]+-[a-f\d-]+\.json$/.test(name))
					.sort();
			} catch {
				/* No restore has occurred yet. */
			}
			const latest = files.at(-1);
			if (!latest)
				return NextResponse.json(
					{ message: 'No pre-restore backup is available yet' },
					{ status: 404 },
				);
			return download(readFileSync(join(safetyDirectory(), latest), 'utf8'), latest);
		}
		const backup = createFinanceBackup(await financeDb());
		return download(
			JSON.stringify(backup, null, 2),
			`finance-backup-${backup.createdAt.slice(0, 10)}.json`,
		);
	} catch (error) {
		console.error('Backup download failed', error);
		return NextResponse.json({ message: 'Unable to create backup' }, { status: 500 });
	}
}
async function parseBackupRequest(request: NextRequest) {
	if (Number(request.headers.get('content-length') || 0) > MAX_BACKUP_BYTES)
		throw new Error('Backup files must be under 50 MB');
	const raw = await request.text();
	if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
		throw new Error('Backup files must be under 50 MB');
	try {
		return JSON.parse(raw);
	} catch {
		throw new Error('The selected file is not valid JSON');
	}
}
export async function POST(request: NextRequest) {
	try {
		const value = await parseBackupRequest(request);
		const db = await financeDb();
		const backup = validateFinanceBackup(db, value);
		return NextResponse.json({ success: true, preview: backupSummary(backup) });
	} catch (error) {
		return NextResponse.json(
			{ message: error instanceof Error ? error.message : 'Unable to validate backup' },
			{ status: 400 },
		);
	}
}
export async function PUT(request: NextRequest) {
	try {
		if (request.headers.get('x-confirm-restore') !== 'REPLACE ALL FINANCE DATA')
			return NextResponse.json(
				{ message: 'Explicit replacement confirmation is required' },
				{ status: 400 },
			);
		const value = await parseBackupRequest(request);
		const db = await financeDb();
		const validated = validateFinanceBackup(db, value);
		// Persist the previous state before any replacement. A disk failure aborts the restore.
		const safety = createFinanceBackup(db);
		const filename = `before-restore-${safety.createdAt.replace(/[:.Z]/g, '-')}-${randomUUID()}.json`;
		mkdirSync(safetyDirectory(), { recursive: true, mode: 0o700 });
		writeFileSync(join(safetyDirectory(), filename), JSON.stringify(safety), {
			encoding: 'utf8',
			mode: 0o600,
			flag: 'wx',
		});
		const restored = restoreFinanceBackup(db, validated);
		return NextResponse.json({
			success: true,
			restored,
			safetyBackup: '/api/backups?safety=latest',
		});
	} catch (error) {
		console.error('Restore failed', error);
		return NextResponse.json(
			{
				message:
					error instanceof Error ? error.message : 'Restore failed; existing data was retained',
			},
			{ status: 400 },
		);
	}
}
