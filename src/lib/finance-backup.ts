import { createHash } from 'node:crypto';
import type { Database, SQLQueryBindings } from 'bun:sqlite';

type Cell = null | string | number;
interface TableData {
	columns: string[];
	rows: Cell[][];
}
export interface FinanceBackup {
	format: 'personal-finance-backup';
	formatVersion: 1;
	createdAt: string;
	schemaVersion: number;
	schemaFingerprint: string;
	tables: Record<string, TableData>;
	sequences: { name: string; seq: number }[];
	checksum: string;
}
function quoted(name: string) {
	return `"${name.replace(/"/g, '""')}"`;
}
function schemaObjects(db: Database) {
	return db
		.query(
			"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY type,name",
		)
		.all() as { type: string; name: string; tbl_name: string; sql: string }[];
}
function tableNames(db: Database) {
	return schemaObjects(db)
		.filter((item) => item.type === 'table')
		.map((item) => item.name)
		.sort();
}
function columns(db: Database, table: string) {
	return (db.query(`PRAGMA table_info(${quoted(table)})`).all() as { name: string }[]).map(
		(column) => column.name,
	);
}
function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
		.join(',')}}`;
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function content(backup: Omit<FinanceBackup, 'checksum'> | FinanceBackup) {
	const { format, formatVersion, createdAt, schemaVersion, schemaFingerprint, tables, sequences } =
		backup;
	return { format, formatVersion, createdAt, schemaVersion, schemaFingerprint, tables, sequences };
}
export function createFinanceBackup(db: Database): FinanceBackup {
	// One read transaction provides a consistent view even when another connection writes.
	return db.transaction(() => {
		const tables: Record<string, TableData> = {};
		for (const table of tableNames(db)) {
			const names = columns(db, table);
			const rows = db
				.query(`SELECT ${names.map(quoted).join(',')} FROM ${quoted(table)}`)
				.values() as Cell[][];
			tables[table] = { columns: names, rows };
		}
		const sequences = db.query("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()
			? (db.query('SELECT name,seq FROM sqlite_sequence ORDER BY name').all() as {
					name: string;
					seq: number;
				}[])
			: [];
		const data = {
			format: 'personal-finance-backup' as const,
			formatVersion: 1 as const,
			createdAt: new Date().toISOString(),
			schemaVersion: Math.max(
				...tables.schema_metadata.rows.map((row) =>
					Number(row[tables.schema_metadata.columns.indexOf('version')]),
				),
			),
			schemaFingerprint: digest(schemaObjects(db)),
			tables,
			sequences,
		};
		return { ...data, checksum: digest(data) };
	})();
}
export function validateFinanceBackup(db: Database, value: unknown): FinanceBackup {
	if (!value || typeof value !== 'object') throw new Error('Select a personal finance JSON backup');
	const backup = value as FinanceBackup;
	if (backup.format !== 'personal-finance-backup' || backup.formatVersion !== 1)
		throw new Error('Unsupported backup format');
	if (
		typeof backup.createdAt !== 'string' ||
		!Number.isFinite(new Date(backup.createdAt).getTime())
	)
		throw new Error('Backup creation date is invalid');
	const currentVersion = (
		db.query('SELECT MAX(version) AS version FROM schema_metadata').get() as { version: number }
	).version;
	if (
		backup.schemaVersion !== currentVersion ||
		backup.schemaFingerprint !== digest(schemaObjects(db))
	)
		throw new Error(
			'This backup uses a different database schema. Restore it with the matching app version.',
		);
	if (typeof backup.checksum !== 'string' || digest(content(backup)) !== backup.checksum)
		throw new Error('Backup checksum mismatch; the file may be incomplete or modified');
	if (
		!backup.tables ||
		typeof backup.tables !== 'object' ||
		Array.isArray(backup.tables) ||
		JSON.stringify(Object.keys(backup.tables).sort()) !== JSON.stringify(tableNames(db))
	)
		throw new Error('Backup must contain every finance table');
	for (const table of tableNames(db)) {
		const data = backup.tables[table];
		if (
			!data ||
			!Array.isArray(data.columns) ||
			JSON.stringify(data.columns) !== JSON.stringify(columns(db, table)) ||
			!Array.isArray(data.rows)
		)
			throw new Error(`Invalid columns or rows for ${table}`);
		for (const row of data.rows)
			if (
				!Array.isArray(row) ||
				row.length !== data.columns.length ||
				!row.every(
					(cell) =>
						cell === null ||
						typeof cell === 'string' ||
						(typeof cell === 'number' && Number.isFinite(cell)),
				)
			)
				throw new Error(`Invalid record in ${table}`);
	}
	const metadata = backup.tables.schema_metadata;
	const versionIndex = metadata.columns.indexOf('version');
	const versions = metadata.rows.map((row) => row[versionIndex]).sort();
	const currentVersions = (
		db.query('SELECT version FROM schema_metadata').all() as { version: number }[]
	)
		.map((row) => row.version)
		.sort();
	if (JSON.stringify(versions) !== JSON.stringify(currentVersions))
		throw new Error('Backup migration history is incompatible');
	if (
		!Array.isArray(backup.sequences) ||
		backup.sequences.some(
			(row) =>
				!row || !tableNames(db).includes(row.name) || !Number.isSafeInteger(row.seq) || row.seq < 0,
		) ||
		new Set(backup.sequences.map((row) => row.name)).size !== backup.sequences.length
	)
		throw new Error('Invalid backup sequence metadata');
	return backup;
}
export function backupSummary(backup: FinanceBackup) {
	return {
		createdAt: backup.createdAt,
		schemaVersion: backup.schemaVersion,
		checksum: backup.checksum,
		tables: Object.entries(backup.tables).map(([name, data]) => ({
			name,
			records: data.rows.length,
		})),
		totalRecords: Object.values(backup.tables).reduce((sum, data) => sum + data.rows.length, 0),
	};
}
/** Executes trusted local DDL only. Imported backups supply values, never SQL. */
export function restoreFinanceBackup(db: Database, value: unknown) {
	const backup = validateFinanceBackup(db, value);
	const triggers = schemaObjects(db).filter((item) => item.type === 'trigger');
	const foreignKeys = (db.query('PRAGMA foreign_keys').get() as { foreign_keys: number })
		.foreign_keys;
	// SQLite requires this outside the transaction. Everything until finally is synchronous.
	db.exec('PRAGMA foreign_keys=OFF');
	try {
		db.transaction(() => {
			for (const trigger of triggers) db.exec(`DROP TRIGGER ${quoted(trigger.name)}`);
			for (const table of tableNames(db)) db.exec(`DELETE FROM ${quoted(table)}`);
			for (const [table, data] of Object.entries(backup.tables)) {
				const insert = db.prepare(
					`INSERT INTO ${quoted(table)} (${data.columns.map(quoted).join(',')}) VALUES (${data.columns.map(() => '?').join(',')})`,
				);
				for (const row of data.rows) insert.run(...(row as SQLQueryBindings[]));
			}
			if (db.query("SELECT 1 FROM sqlite_master WHERE name='sqlite_sequence'").get()) {
				db.exec('DELETE FROM sqlite_sequence');
				for (const sequence of backup.sequences)
					db.query('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(
						sequence.name,
						sequence.seq,
					);
			}
			for (const trigger of triggers) db.exec(trigger.sql);
			if (db.query('PRAGMA foreign_key_check').all().length)
				throw new Error('Backup contains broken references; no data was changed');
			const check = db.query('PRAGMA quick_check').get() as { quick_check: string };
			if (check.quick_check !== 'ok')
				throw new Error('Database integrity check failed; no data was changed');
		})();
	} finally {
		db.exec(`PRAGMA foreign_keys=${foreignKeys ? 'ON' : 'OFF'}`);
	}
	return backupSummary(backup);
}
function csvCell(value: unknown) {
	let text = value == null ? '' : String(value);
	if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
}
export function exportTransactionsCSV(db: Database) {
	const names = columns(db, 'transactions');
	const rows = db
		.query(`SELECT ${names.map(quoted).join(',')} FROM transactions ORDER BY date,id`)
		.values();
	return '\uFEFF' + [names, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
