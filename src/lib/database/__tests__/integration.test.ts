/**
 * Integration tests for database migration system
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
					if (sql.includes('SELECT 1 as health_check')) {
						return { health_check: 1 };
					}
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
					}
					if (sql.includes('SELECT MAX(version)')) {
						const metadata = this.data.get('schema_metadata');
						if (!metadata || metadata.length === 0) return null;
						return { version: Math.max(...metadata.map((m) => m.version)) };
					}
					return null;
				},
				run: () => ({ changes: 1 }),
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

import { SQLiteConnectionManager } from '../connection';

describe('Database Migration Integration', () => {
	let manager: SQLiteConnectionManager;

	beforeEach(() => {
		manager = new SQLiteConnectionManager({ filename: ':memory:' });
	});

	afterEach(async () => {
		if (manager.isReady()) {
			await manager.close();
		}
	});

	it('should initialize database and run migrations successfully', async () => {
		// Initialize the database
		await manager.initialize();
		expect(manager.isReady()).toBe(true);

		// Run migrations
		await manager.runMigrations();

		// Verify database is healthy
		const healthy = await manager.isHealthy();
		expect(healthy).toBe(true);

		// Verify tables were created
		const db = manager.getConnection();
		const transactionsTable = db
			.query(
				`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='transactions'
		`,
			)
			.get();
		expect(transactionsTable).toBeTruthy();

		const metadataTable = db
			.query(
				`
			SELECT name FROM sqlite_master 
			WHERE type='table' AND name='schema_metadata'
		`,
			)
			.get();
		expect(metadataTable).toBeTruthy();
	});

	it('should handle full database lifecycle', async () => {
		// Initialize
		await manager.initialize();
		expect(manager.isReady()).toBe(true);

		// Run migrations
		await manager.runMigrations();

		// Verify health
		expect(await manager.isHealthy()).toBe(true);

		// Close
		await manager.close();
		expect(manager.isReady()).toBe(false);
		expect(await manager.isHealthy()).toBe(false);
	});

	it('should handle errors gracefully', async () => {
		// Try to run migrations before initialization
		await expect(manager.runMigrations()).rejects.toThrow('Database must be initialized');

		// Try to get connection before initialization
		expect(() => manager.getConnection()).toThrow('Database not initialized');
	});
});
