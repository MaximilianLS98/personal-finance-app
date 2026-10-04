/**
 * Database module exports
 */

export {
	DatabaseConnectionError,
	SQLiteConnectionManager,
	getConnectionManager,
	resetConnectionManager,
} from './connection';
export { SQLiteTransactionRepository, createTransactionRepository } from './repository';
export { DatabaseErrorType } from './types';
export type {
	DatabaseConfig,
	DatabaseError,
	DatabaseManager,
	DatabaseTransaction,
	Migration,
	TransactionRepository,
} from './types';
