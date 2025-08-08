/**
 * Migration registry and runner
 * Manages database schema migrations with version tracking
 */

import type { Migration } from '../types';
import { migration001 } from './001_initial';
import { migration002 } from './002_add_transfer_type';
import { migration003 } from './003_add_categories';

/**
 * Registry of all available migrations in order
 */
export const migrations: Migration[] = [migration001, migration002, migration003];

/**
 * Migration runner class for managing database schema evolution
 */
export class MigrationRunner {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private db: any;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(db: any) {
		this.db = db;
	}

	/**
	 * Get the current schema version from the database
	 */
	private getCurrentVersion(): number {
		try {
			const result = this.db
				.query('SELECT MAX(version) as version FROM schema_metadata')
				.get() as { version: number } | null;
			return result?.version || 0;
		} catch (error) {
			// If schema_metadata table doesn't exist, we're at version 0
			return 0;
		}
	}

	/**
	 * Check if a specific migration version has been applied
	 */
	private isMigrationApplied(version: number): boolean {
		try {
			const result = this.db
				.query('SELECT 1 FROM schema_metadata WHERE version = ?')
				.get(version);
			return result !== null;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Run all pending migrations
	 */
	async runPendingMigrations(): Promise<void> {
		// Use individual migration check instead of just max version
		const pendingMigrations = migrations.filter((m) => !this.isMigrationApplied(m.version));

		if (pendingMigrations.length === 0) {
			return;
		}

		const currentVersion = this.getCurrentVersion();

		// Run migrations in a transaction for atomicity
		const transaction = this.db.transaction(() => {
			for (const migration of pendingMigrations) {
				try {
					migration.up(this.db);

					// The migration's up() method should handle its own metadata insertion
					// So we don't need to insert it here anymore
				} catch (error) {
					throw new Error(
						`Migration ${migration.version} failed: ${
							error instanceof Error ? error.message : 'Unknown error'
						}`,
					);
				}
			}
		});

		transaction();
	}

	/**
	 * Rollback to a specific version
	 */
	async rollbackToVersion(targetVersion: number): Promise<void> {
		const currentVersion = this.getCurrentVersion();

		if (targetVersion >= currentVersion) {
			return;
		}

		const migrationsToRollback = migrations
			.filter((m) => m.version > targetVersion && m.version <= currentVersion)
			.sort((a, b) => b.version - a.version); // Rollback in reverse order

		// Run rollbacks in a transaction
		const transaction = this.db.transaction(() => {
			for (const migration of migrationsToRollback) {
				try {
					migration.down(this.db);

					// Remove migration record
					this.db
						.query('DELETE FROM schema_metadata WHERE version = ?')
						.run(migration.version);
				} catch (error) {
					throw new Error(
						`Rollback of migration ${migration.version} failed: ${
							error instanceof Error ? error.message : 'Unknown error'
						}`,
					);
				}
			}
		});

		transaction();
	}

	/**
	 * Get list of applied migrations
	 */
	getAppliedMigrations(): number[] {
		try {
			const results = this.db
				.query('SELECT version FROM schema_metadata ORDER BY version')
				.all() as { version: number }[];
			return results.map((r) => r.version);
		} catch (error) {
			return [];
		}
	}

	/**
	 * Get list of pending migrations
	 */
	getPendingMigrations(): Migration[] {
		const currentVersion = this.getCurrentVersion();
		return migrations.filter((m) => m.version > currentVersion);
	}

	/**
	 * Validate migration integrity
	 */
	validateMigrations(): boolean {
		// Check that migration versions are sequential and unique
		const versions = migrations.map((m) => m.version).sort((a, b) => a - b);

		for (let i = 0; i < versions.length; i++) {
			if (versions[i] !== i + 1) {
				return false;
			}
		}

		return true;
	}
}
