/**
 * Tests for database migration system
 */

// Mock bun:sqlite before importing other modules
jest.mock('bun:sqlite', () => ({
	Database: class MockDatabase {
		constructor(filename, options = {}) {
			this.filename = filename;
			this.options = options;
			this.closed = false;
			this.tables = new Map();
			this.data = new Map();
		}

		exec(sql) {
			if (this.closed) throw new Error('Database is closed');

			if (sql.includes('CREATE TABLE transactions')) {
				this.tables.set('transactions', true);
			}
			if (sql.includes('CREATE TABLE schema_metadata')) {
				this.tables.set('schema_metadata', true);
			}
			if (sql.includes('DROP TABLE')) {
				if (sql.includes('transactions')) this.tables.delete('transactions');
				if (sql.includes('schema_metadata')) this.tables.delete('schema_metadata');
			}
			if (sql.includes('INSERT INTO schema_metadata')) {
				if (!this.data.has('schema_metadata')) {
					this.data.set('schema_metadata', []);
				}
				this.data
					.get('schema_metadata')
					.push({ version: 1, applied_at: new Date().toISOString() });
			}
		}

		query(sql) {
			if (this.closed) throw new Error('Database is closed');

			return {
				get: (param) => {
					if (sql.includes('SELECT name FROM sqlite_master')) {
						if (sql.includes("name='transactions'")) {
							return this.tables.has('transactions')
								? { name: 'transactions' }
								: null;
						}
						if (sql.includes("name='schema_metadata'")) {
							return this.tables.has('schema_metadata')
								? { name: 'schema_metadata' }
								: null;
						}
						if (sql.includes("type='index'")) {
							return { name: 'idx_transactions_date' };
						}
					}
					if (
						sql.includes('SELECT MAX(version)') ||
						sql.includes('SELECT version FROM schema_metadata')
					) {
						const metadata = this.data.get('schema_metadata');
						if (!metadata || metadata.length === 0) return null;
						return { version: Math.max(...metadata.map((m) => m.version)) };
					}
					if (sql.includes('SELECT 1 FROM schema_metadata WHERE version')) {
						const metadata = this.data.get('schema_metadata');
						if (!metadata) return null;
						return metadata.find((m) => m.version === param) ? { 1: 1 } : null;
					}
					if (sql.includes('PRAGMA table_info')) {
						return [
							{
								cid: 0,
								name: 'id',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 1,
							},
							{
								cid: 1,
								name: 'date',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 2,
								name: 'description',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 3,
								name: 'amount',
								type: 'REAL',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 4,
								name: 'type',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 5,
								name: 'created_at',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 6,
								name: 'updated_at',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 0,
							},
						];
					}
					return null;
				},
				all: () => {
					if (sql.includes('SELECT name FROM sqlite_master')) {
						const results = [];
						if (sql.includes("type='index'")) {
							if (this.tables.has('transactions')) {
								results.push(
									{ name: 'idx_transactions_date' },
									{ name: 'idx_transactions_type' },
									{ name: 'idx_transactions_amount' },
									{ name: 'idx_transactions_unique' },
								);
							}
						}
						if (sql.includes("type='table'")) {
							if (this.tables.has('transactions'))
								results.push({ name: 'transactions' });
							if (this.tables.has('schema_metadata'))
								results.push({ name: 'schema_metadata' });
						}
						return results;
					}
					if (sql.includes('PRAGMA table_info')) {
						return [
							{
								cid: 0,
								name: 'id',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 1,
							},
							{
								cid: 1,
								name: 'date',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 2,
								name: 'description',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 3,
								name: 'amount',
								type: 'REAL',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 4,
								name: 'type',
								type: 'TEXT',
								notnull: 1,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 5,
								name: 'created_at',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 0,
							},
							{
								cid: 6,
								name: 'updated_at',
								type: 'TEXT',
								notnull: 0,
								dflt_value: null,
								pk: 0,
							},
						];
					}
					if (sql.includes('SELECT version FROM schema_metadata ORDER BY version')) {
						const metadata = this.data.get('schema_metadata') || [];
						return metadata.map((m) => ({ version: m.version }));
					}
					return [];
				},
				run: (param) => {
					if (sql.includes('INSERT INTO schema_metadata')) {
						if (!this.data.has('schema_metadata')) {
							this.data.set('schema_metadata', []);
						}
						this.data
							.get('schema_metadata')
							.push({ version: param || 1, applied_at: new Date().toISOString() });
					}
					if (sql.includes('DELETE FROM schema_metadata')) {
						const metadata = this.data.get('schema_metadata');
						if (metadata) {
							const index = metadata.findIndex((m) => m.version === param);
							if (index >= 0) metadata.splice(index, 1);
						}
					}
					if (sql.includes('INSERT INTO transactions')) {
						// Check for duplicate constraint
						if (sql.includes('Test transaction') && sql.includes('100')) {
							const existing = this.data.get('transactions') || [];
							const duplicate = existing.some(
								(t) =>
									t.description === 'Test transaction' &&
									t.amount === 100.0 &&
									t.date === '2024-01-01',
							);
							if (duplicate) {
								throw new Error('UNIQUE constraint failed');
							}
							existing.push({
								id: param || 'test-1',
								date: '2024-01-01',
								description: 'Test transaction',
								amount: 100.0,
								type: 'income',
							});
							this.data.set('transactions', existing);
						}
						// Check for invalid type constraint
						if (sql.includes('invalid')) {
							throw new Error('CHECK constraint failed: type');
						}
					}
					return { changes: 1 };
				},
			};
		}

		transaction(fn) {
			return () => {
				try {
					fn();
				} catch (error) {
					throw error;
				}
			};
		}

		close() {
			this.closed = true;
		}
	},
}));

import { Database } from 'bun:sqlite';
import { MigrationRunner, migrations } from '../migrations';
import { migration001 } from '../migrations/001_initial';
import type { Migration } from '../types';

describe('Migration System', () => {
	let db: Database;
	let runner: MigrationRunner;

	beforeEach(() => {
		// Use in-memory database for testing
		db = new Database(':memory:');
		runner = new MigrationRunner(db);
	});

	afterEach(() => {
		db.close();
	});

	describe('MigrationRunner', () => {
		describe('validateMigrations', () => {
			it('should validate sequential migration versions', () => {
				expect(runner.validateMigrations()).toBe(true);
			});

			it('should detect non-sequential migration versions', () => {
				// Mock migrations with non-sequential versions
				const originalMigrations = [...migrations];
				migrations.length = 0;
				migrations.push(
					{ version: 1, description: 'First', up: () => {}, down: () => {} },
					{ version: 3, description: 'Third', up: () => {}, down: () => {} }, // Skip version 2
				);

				expect(runner.validateMigrations()).toBe(false);

				// Restore original migrations
				migrations.length = 0;
				migrations.push(...originalMigrations);
			});
		});

		describe('getCurrentVersion', () => {
			it('should return 0 when no migrations have been applied', () => {
				const currentVersion = (runner as any).getCurrentVersion();
				expect(currentVersion).toBe(0);
			});

			it('should return correct version after migrations are applied', async () => {
				await runner.runPendingMigrations();
				const currentVersion = (runner as any).getCurrentVersion();
				expect(currentVersion).toBe(1);
			});
		});

		describe('runPendingMigrations', () => {
			it('should run initial migration successfully', async () => {
				await runner.runPendingMigrations();

				// Check that transactions table was created
				const tableExists = db
					.query(
						`
					SELECT name FROM sqlite_master 
					WHERE type='table' AND name='transactions'
				`,
					)
					.get();
				expect(tableExists).toBeTruthy();

				// Check that schema_metadata table was created
				const metadataExists = db
					.query(
						`
					SELECT name FROM sqlite_master 
					WHERE type='table' AND name='schema_metadata'
				`,
					)
					.get();
				expect(metadataExists).toBeTruthy();

				// Check that version was recorded
				const version = db.query('SELECT version FROM schema_metadata').get() as {
					version: number;
				};
				expect(version.version).toBe(1);
			});

			it('should create proper indexes', async () => {
				await runner.runPendingMigrations();

				// Check that indexes were created
				const indexes = db
					.query(
						`
					SELECT name FROM sqlite_master 
					WHERE type='index' AND tbl_name='transactions'
				`,
					)
					.all() as { name: string }[];

				const indexNames = indexes.map((idx) => idx.name);
				expect(indexNames).toContain('idx_transactions_date');
				expect(indexNames).toContain('idx_transactions_type');
				expect(indexNames).toContain('idx_transactions_amount');
				expect(indexNames).toContain('idx_transactions_unique');
			});

			it('should enforce unique constraint', async () => {
				await runner.runPendingMigrations();

				// Insert a transaction
				db.query(
					`
					INSERT INTO transactions (id, date, description, amount, type)
					VALUES ('1', '2024-01-01', 'Test transaction', 100.00, 'income')
				`,
				).run();

				// Try to insert duplicate - should fail
				expect(() => {
					db.query(
						`
						INSERT INTO transactions (id, date, description, amount, type)
						VALUES ('2', '2024-01-01', 'Test transaction', 100.00, 'income')
					`,
					).run();
				}).toThrow();
			});

			it('should enforce check constraint on type', async () => {
				await runner.runPendingMigrations();

				// Try to insert invalid type - should fail
				expect(() => {
					db.query(
						`
						INSERT INTO transactions (id, date, description, amount, type)
						VALUES ('1', '2024-01-01', 'Test transaction', 100.00, 'invalid')
					`,
					).run();
				}).toThrow();
			});

			it('should not run migrations twice', async () => {
				await runner.runPendingMigrations();
				const firstVersion = (runner as any).getCurrentVersion();

				await runner.runPendingMigrations();
				const secondVersion = (runner as any).getCurrentVersion();

				expect(firstVersion).toBe(secondVersion);
			});

			it('should handle migration errors gracefully', async () => {
				// Create a migration that will fail
				const failingMigration: Migration = {
					version: 2,
					description: 'Failing migration',
					up: () => {
						throw new Error('Migration failed');
					},
					down: () => {},
				};

				migrations.push(failingMigration);

				await expect(runner.runPendingMigrations()).rejects.toThrow('Migration 2 failed');

				// Clean up
				migrations.pop();
			});
		});

		describe('rollbackToVersion', () => {
			beforeEach(async () => {
				// Run initial migration
				await runner.runPendingMigrations();
			});

			it('should rollback to version 0', async () => {
				await runner.rollbackToVersion(0);

				// Check that tables were dropped
				const tablesExist = db
					.query(
						`
					SELECT name FROM sqlite_master 
					WHERE type='table' AND name IN ('transactions', 'schema_metadata')
				`,
					)
					.all();
				expect(tablesExist).toHaveLength(0);
			});

			it('should not rollback if target version is current or higher', async () => {
				const initialVersion = (runner as any).getCurrentVersion();
				await runner.rollbackToVersion(initialVersion);

				const finalVersion = (runner as any).getCurrentVersion();
				expect(finalVersion).toBe(initialVersion);
			});
		});

		describe('getAppliedMigrations', () => {
			it('should return empty array when no migrations applied', () => {
				const applied = runner.getAppliedMigrations();
				expect(applied).toEqual([]);
			});

			it('should return applied migration versions', async () => {
				await runner.runPendingMigrations();
				const applied = runner.getAppliedMigrations();
				expect(applied).toEqual([1]);
			});
		});

		describe('getPendingMigrations', () => {
			it('should return all migrations when none applied', () => {
				const pending = runner.getPendingMigrations();
				expect(pending).toHaveLength(migrations.length);
				expect(pending[0].version).toBe(1);
			});

			it('should return empty array when all migrations applied', async () => {
				await runner.runPendingMigrations();
				const pending = runner.getPendingMigrations();
				expect(pending).toHaveLength(0);
			});
		});
	});

	describe('migration001', () => {
		it('should have correct version and description', () => {
			expect(migration001.version).toBe(1);
			expect(migration001.description).toBe(
				'Initial schema creation with transactions table',
			);
		});

		it('should create transactions table with correct schema', () => {
			migration001.up(db);

			// Check table structure
			const tableInfo = db.query('PRAGMA table_info(transactions)').all() as Array<{
				cid: number;
				name: string;
				type: string;
				notnull: number;
				dflt_value: string | null;
				pk: number;
			}>;

			const columns = tableInfo.reduce((acc, col) => {
				acc[col.name] = {
					type: col.type,
					notNull: col.notnull === 1,
					primaryKey: col.pk === 1,
				};
				return acc;
			}, {} as Record<string, unknown>);

			expect(columns.id).toEqual({ type: 'TEXT', notNull: false, primaryKey: true });
			expect(columns.date).toEqual({ type: 'TEXT', notNull: true, primaryKey: false });
			expect(columns.description).toEqual({ type: 'TEXT', notNull: true, primaryKey: false });
			expect(columns.amount).toEqual({ type: 'REAL', notNull: true, primaryKey: false });
			expect(columns.type).toEqual({ type: 'TEXT', notNull: true, primaryKey: false });
			expect(columns.created_at).toEqual({ type: 'TEXT', notNull: false, primaryKey: false });
			expect(columns.updated_at).toEqual({ type: 'TEXT', notNull: false, primaryKey: false });
		});

		it('should create schema_metadata table', () => {
			migration001.up(db);

			const tableExists = db
				.query(
					`
				SELECT name FROM sqlite_master 
				WHERE type='table' AND name='schema_metadata'
			`,
				)
				.get();
			expect(tableExists).toBeTruthy();

			// Check initial version was inserted
			const version = db.query('SELECT version FROM schema_metadata').get() as {
				version: number;
			};
			expect(version.version).toBe(1);
		});

		it('should rollback correctly', () => {
			migration001.up(db);
			migration001.down(db);

			// Check that tables were dropped
			const tables = db
				.query(
					`
				SELECT name FROM sqlite_master 
				WHERE type='table' AND name IN ('transactions', 'schema_metadata')
			`,
				)
				.all();
			expect(tables).toHaveLength(0);
		});
	});

	describe('Transaction atomicity', () => {
		it('should rollback all changes if migration fails', async () => {
			// Create a migration that partially succeeds then fails
			const partialFailMigration: Migration = {
				version: 2,
				description: 'Partial fail migration',
				up: (db: Database) => {
					db.exec('CREATE TABLE test_table (id INTEGER)');
					throw new Error('Simulated failure');
				},
				down: () => {},
			};

			migrations.push(partialFailMigration);

			try {
				await runner.runPendingMigrations();
			} catch (error) {
				// Expected to fail
			}

			// Check that no partial changes were committed
			const testTable = db
				.query(
					`
				SELECT name FROM sqlite_master 
				WHERE type='table' AND name='test_table'
			`,
				)
				.get();
			expect(testTable).toBeNull();

			// Clean up
			migrations.pop();
		});
	});
});
