/**
 * Database-specific types and interfaces for SQLite persistence layer
 */

import type { Transaction, FinancialSummary } from '../types';

/**
 * Database configuration options
 */
export interface DatabaseConfig {
	/** Database file path */
	filename: string;
	/** Whether to open in readonly mode */
	readonly: boolean;
	/** Whether to create database if it doesn't exist */
	create: boolean;
	/** Whether to enable strict mode */
	strict: boolean;
	/** Connection timeout in milliseconds */
	timeout: number;
}

/**
 * Database error types for specific error handling
 */
export enum DatabaseErrorType {
	CONNECTION_FAILED = 'CONNECTION_FAILED',
	MIGRATION_FAILED = 'MIGRATION_FAILED',
	CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
	TRANSACTION_FAILED = 'TRANSACTION_FAILED',
	DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
}

/**
 * Custom database error with additional context
 */
export interface DatabaseError extends Error {
	type: DatabaseErrorType;
	query?: string;
	params?: unknown[];
}

/**
 * Database connection manager interface
 */
export interface DatabaseManager {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	getConnection(): any;
	initialize(): Promise<void>;
	runMigrations(): Promise<void>;
	close(): Promise<void>;
	isHealthy(): Promise<boolean>;
}

/**
 * Enhanced transaction model with database metadata
 */
export interface DatabaseTransaction extends Transaction {
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Migration definition interface
 */
export interface Migration {
	version: number;
	description: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => void;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => void;
}

/**
 * Result of creating multiple transactions with duplicate detection
 */
export interface CreateManyResult {
	/** Successfully created transactions */
	created: Transaction[];
	/** Information about duplicate transactions that were skipped */
	duplicates: DuplicateInfo[];
	/** Total number of transactions processed */
	totalProcessed: number;
}

/**
 * Information about a duplicate transaction
 */
export interface DuplicateInfo {
	/** Date of the duplicate transaction */
	date: Date;
	/** Description of the duplicate transaction */
	description: string;
	/** Amount of the duplicate transaction */
	amount: number;
	/** Type of the duplicate transaction */
	type: 'income' | 'expense' | 'transfer';
	/** Human-readable identifier for the duplicate */
	identifier: string;
}

/**
 * Repository interface for transaction database operations
 */
export interface TransactionRepository {
	// Core CRUD operations
	create(transaction: Omit<Transaction, 'id'>): Promise<Transaction>;
	createMany(transactions: Omit<Transaction, 'id'>[]): Promise<CreateManyResult>;
	findAll(): Promise<Transaction[]>;
	findById(id: string): Promise<Transaction | null>;
	findByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]>;

	// Business logic operations
	calculateSummary(startDate?: Date, endDate?: Date): Promise<FinancialSummary>;
	checkDuplicates(transactions: Omit<Transaction, 'id'>[]): Promise<DuplicateInfo[]>;

	// Database management
	initialize(): Promise<void>;
	close(): Promise<void>;
}
