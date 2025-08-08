/**
 * Database connection manager using Bun's native SQLite
 */

import type { DatabaseConfig, DatabaseManager, DatabaseError } from './types';
import { DatabaseErrorType } from './types';

// Dynamic import to avoid webpack build issues with bun:sqlite
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database: any = null;

/**
 * Default database configuration
 */
const DEFAULT_CONFIG: DatabaseConfig = {
	filename: process.env.NODE_ENV === 'test' ? ':memory:' : 'data/finance-tracker.db',
	readonly: false,
	create: true,
	strict: true,
	timeout: 5000,
};

/**
 * Custom database error class
 */
export class DatabaseConnectionError extends Error implements DatabaseError {
	public readonly type: DatabaseErrorType;
	public readonly query?: string;
	public readonly params?: unknown[];

	constructor(type: DatabaseErrorType, message: string, query?: string, params?: unknown[]) {
		super(message);
		this.name = 'DatabaseConnectionError';
		this.type = type;
		this.query = query;
		this.params = params;
	}
}

/**
 * SQLite database connection manager with health checks and error handling
 */
export class SQLiteConnectionManager implements DatabaseManager {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private db: any | null = null;
	private config: DatabaseConfig;
	private isInitialized = false;

	constructor(config: Partial<DatabaseConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * Get the database connection instance
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getConnection(): any {
		if (!this.db) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.CONNECTION_FAILED,
				'Database not initialized. Call initialize() first.',
			);
		}
		return this.db;
	}

	/**
	 * Initialize the database connection
	 */
	async initialize(): Promise<void> {
		try {
			// Dynamic import of Database to avoid build issues with Next.js webpack
			if (!Database) {
				try {
					const bunSqliteModule = 'bun:sqlite';
					const bunSqlite = await import(/* webpackIgnore: true */ bunSqliteModule);
					Database = bunSqlite.Database;
				} catch (error) {
					throw new DatabaseConnectionError(
						DatabaseErrorType.CONNECTION_FAILED,
						'bun:sqlite is not available. This application requires Bun runtime.',
					);
				}
			}

			// Ensure data directory exists for file-based databases
			if (this.config.filename !== ':memory:' && !this.config.filename.includes(':memory:')) {
				const { dirname } = await import('path');
				const { existsSync, mkdirSync } = await import('fs');
				const dir = dirname(this.config.filename);
				if (!existsSync(dir)) {
					mkdirSync(dir, { recursive: true });
				}
			}

			// Create database connection
			this.db = new Database(this.config.filename, {
				readonly: this.config.readonly,
				create: this.config.create,
				strict: this.config.strict,
			});

			// Enable WAL mode for better concurrency (not available in memory)
			if (this.config.filename !== ':memory:') {
				this.db.exec('PRAGMA journal_mode = WAL;');
			}

			// Enable foreign key constraints
			this.db.exec('PRAGMA foreign_keys = ON;');

			// Set reasonable timeout
			this.db.exec(`PRAGMA busy_timeout = ${this.config.timeout};`);

			this.isInitialized = true;
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.CONNECTION_FAILED,
				`Failed to initialize database: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Run database migrations
	 */
	async runMigrations(): Promise<void> {
		if (!this.isInitialized) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.MIGRATION_FAILED,
				'Database must be initialized before running migrations',
			);
		}

		try {
			const { MigrationRunner } = await import('./migrations');
			const runner = new MigrationRunner(this.getConnection());

			// Validate migrations before running
			if (!runner.validateMigrations()) {
				throw new DatabaseConnectionError(
					DatabaseErrorType.MIGRATION_FAILED,
					'Migration validation failed: versions must be sequential starting from 1',
				);
			}

			await runner.runPendingMigrations();
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.MIGRATION_FAILED,
				`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
		}
	}

	/**
	 * Check if database connection is healthy
	 */
	async isHealthy(): Promise<boolean> {
		try {
			if (!this.db || !this.isInitialized) {
				return false;
			}

			// Simple health check query
			const result = this.db.query('SELECT 1 as health_check').get() as {
				health_check: number;
			} | null;
			return result !== null && result.health_check === 1;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Close the database connection
	 */
	async close(): Promise<void> {
		try {
			if (this.db) {
				this.db.close();
				this.db = null;
				this.isInitialized = false;
			}
		} catch (error) {
			throw new DatabaseConnectionError(
				DatabaseErrorType.CONNECTION_FAILED,
				`Failed to close database: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			);
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): DatabaseConfig {
		return { ...this.config };
	}

	/**
	 * Check if database is initialized
	 */
	isReady(): boolean {
		return this.isInitialized && this.db !== null;
	}
}

/**
 * Singleton instance for application-wide database access
 */
let connectionManager: SQLiteConnectionManager | null = null;

/**
 * Get or create the singleton database connection manager
 */
export function getConnectionManager(config?: Partial<DatabaseConfig>): SQLiteConnectionManager {
	if (!connectionManager) {
		connectionManager = new SQLiteConnectionManager(config);
	}
	return connectionManager;
}

/**
 * Reset the singleton instance (primarily for testing)
 */
export function resetConnectionManager(): void {
	if (connectionManager) {
		connectionManager.close().catch(() => {
			// Ignore close errors during reset
		});
		connectionManager = null;
	}
}
