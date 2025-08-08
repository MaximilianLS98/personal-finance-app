/**
 * Database module exports
 */

export {
	SQLiteConnectionManager,
	getConnectionManager,
	resetConnectionManager,
	DatabaseConnectionError,
} from './connection';
export { SQLiteTransactionRepository, createTransactionRepository } from './repository';
export type {
	DatabaseConfig,
	DatabaseManager,
	DatabaseError,
	DatabaseTransaction,
	Migration,
	TransactionRepository,
} from './types';
export { DatabaseErrorType } from './types';
