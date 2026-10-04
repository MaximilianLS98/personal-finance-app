import type { Database } from 'bun:sqlite';
import { DatabaseConnectionError } from './connection';
import type { TransactionRepository } from './contracts';
import { DatabaseErrorType } from './types';

export class RepositoryContext {
	db: Database | null = null;
	repository!: TransactionRepository;
	connection(): Database {
		if (!this.db)
			throw new DatabaseConnectionError(
				DatabaseErrorType.CONNECTION_FAILED,
				'Repository not initialized. Call initialize() first.',
			);
		return this.db;
	}
}
