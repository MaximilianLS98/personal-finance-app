/**
 * Migration to add categories and category rules tables
 * Implements the intelligent categorization system
 */

import type { Migration } from '../types';

export const migration003: Migration = {
	version: 3,
	description: 'Add categories and category rules tables for intelligent categorization',
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	up: (db: any) => {
		// Categories table
		db.exec(`
			CREATE TABLE categories (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				description TEXT,
				color TEXT NOT NULL, -- Hex color for UI
				icon TEXT NOT NULL, -- Lucide icon name
				parent_id TEXT REFERENCES categories(id),
				is_active BOOLEAN DEFAULT TRUE,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Category rules table for learning system
		db.exec(`
			CREATE TABLE category_rules (
				id TEXT PRIMARY KEY,
				category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
				pattern TEXT NOT NULL,
				pattern_type TEXT NOT NULL CHECK (pattern_type IN ('exact', 'contains', 'starts_with', 'regex')),
				confidence_score REAL DEFAULT 1.0, -- 0.0-1.0, higher = more confident
				usage_count INTEGER DEFAULT 1,
				last_used_at TEXT,
				created_by TEXT NOT NULL CHECK (created_by IN ('user', 'system')),
				is_active BOOLEAN DEFAULT TRUE,
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);

		// Add category_id to transactions table
		db.exec('ALTER TABLE transactions ADD COLUMN category_id TEXT REFERENCES categories(id);');

		// Create indexes for performance
		db.exec('CREATE INDEX idx_categories_parent ON categories(parent_id);');
		db.exec('CREATE INDEX idx_categories_active ON categories(is_active);');
		db.exec('CREATE INDEX idx_category_rules_category ON category_rules(category_id);');
		db.exec('CREATE INDEX idx_category_rules_pattern ON category_rules(pattern);');
		db.exec('CREATE INDEX idx_category_rules_active ON category_rules(is_active);');
		db.exec('CREATE INDEX idx_transactions_category ON transactions(category_id);');
		db.exec('CREATE INDEX idx_category_rules_confidence ON category_rules(confidence_score DESC);');

		// Insert default categories
		const defaultCategories = [
			// Essential categories
			{ id: 'cat_groceries', name: 'Groceries', description: 'Food and household items', color: '#10B981', icon: 'shopping-cart' },
			{ id: 'cat_transportation', name: 'Transportation', description: 'Travel, fuel, public transport', color: '#3B82F6', icon: 'car' },
			{ id: 'cat_utilities', name: 'Utilities', description: 'Electricity, water, gas, internet', color: '#F59E0B', icon: 'zap' },
			{ id: 'cat_rent', name: 'Rent/Mortgage', description: 'Housing payments', color: '#EF4444', icon: 'home' },
			
			// Lifestyle categories
			{ id: 'cat_dining', name: 'Dining Out', description: 'Restaurants, cafes, takeout', color: '#8B5CF6', icon: 'utensils' },
			{ id: 'cat_entertainment', name: 'Entertainment', description: 'Movies, streaming, games', color: '#EC4899', icon: 'film' },
			{ id: 'cat_shopping', name: 'Shopping', description: 'Clothes, electronics, general purchases', color: '#06B6D4', icon: 'shopping-bag' },
			{ id: 'cat_healthcare', name: 'Healthcare', description: 'Medical, dental, pharmacy', color: '#84CC16', icon: 'heart' },
			
			// Financial categories
			{ id: 'cat_banking', name: 'Banking/Fees', description: 'ATM fees, bank charges', color: '#6B7280', icon: 'credit-card' },
			{ id: 'cat_insurance', name: 'Insurance', description: 'Health, auto, home insurance', color: '#9333EA', icon: 'shield' },
			{ id: 'cat_investments', name: 'Investments', description: 'Stocks, bonds, retirement', color: '#059669', icon: 'trending-up' },
			
			// Other
			{ id: 'cat_uncategorized', name: 'Uncategorized', description: 'Transactions without a category', color: '#9CA3AF', icon: 'help-circle' }
		];

		for (const category of defaultCategories) {
			db.exec(`
				INSERT INTO categories (id, name, description, color, icon, is_active, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
			`, [category.id, category.name, category.description, category.color, category.icon]);
		}

		// Insert common categorization patterns
		const commonPatterns = [
			// Transportation
			{ categoryId: 'cat_transportation', pattern: 'UBER', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_transportation', pattern: 'LYFT', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_transportation', pattern: 'TAXI', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_transportation', pattern: 'GAS STATION', type: 'contains', confidence: 0.85 },
			{ categoryId: 'cat_transportation', pattern: 'SHELL', type: 'contains', confidence: 0.8 },
			{ categoryId: 'cat_transportation', pattern: 'BP ', type: 'contains', confidence: 0.8 },
			
			// Shopping
			{ categoryId: 'cat_shopping', pattern: 'AMAZON', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_shopping', pattern: 'WALMART', type: 'contains', confidence: 0.85 },
			{ categoryId: 'cat_shopping', pattern: 'TARGET', type: 'contains', confidence: 0.85 },
			{ categoryId: 'cat_shopping', pattern: 'EBAY', type: 'contains', confidence: 0.9 },
			
			// Groceries
			{ categoryId: 'cat_groceries', pattern: 'GROCERY', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_groceries', pattern: 'SUPERMARKET', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_groceries', pattern: 'WHOLE FOODS', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_groceries', pattern: 'SAFEWAY', type: 'contains', confidence: 0.95 },
			
			// Dining Out
			{ categoryId: 'cat_dining', pattern: 'RESTAURANT', type: 'contains', confidence: 0.85 },
			{ categoryId: 'cat_dining', pattern: 'STARBUCKS', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_dining', pattern: 'MCDONALDS', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_dining', pattern: 'PIZZA', type: 'contains', confidence: 0.85 },
			
			// Entertainment
			{ categoryId: 'cat_entertainment', pattern: 'NETFLIX', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_entertainment', pattern: 'SPOTIFY', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_entertainment', pattern: 'CINEMA', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_entertainment', pattern: 'MOVIE', type: 'contains', confidence: 0.8 },
			
			// Banking/Fees
			{ categoryId: 'cat_banking', pattern: 'ATM', type: 'starts_with', confidence: 0.95 },
			{ categoryId: 'cat_banking', pattern: 'BANK FEE', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_banking', pattern: 'OVERDRAFT', type: 'contains', confidence: 0.95 },
			
			// Utilities
			{ categoryId: 'cat_utilities', pattern: 'ELECTRIC', type: 'contains', confidence: 0.9 },
			{ categoryId: 'cat_utilities', pattern: 'WATER DEPT', type: 'contains', confidence: 0.95 },
			{ categoryId: 'cat_utilities', pattern: 'INTERNET', type: 'contains', confidence: 0.85 },
			{ categoryId: 'cat_utilities', pattern: 'PHONE BILL', type: 'contains', confidence: 0.9 },
		];

		for (const pattern of commonPatterns) {
			const ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			db.exec(`
				INSERT INTO category_rules (id, category_id, pattern, pattern_type, confidence_score, usage_count, created_by, is_active, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, 0, 'system', 1, datetime('now'), datetime('now'))
			`, [ruleId, pattern.categoryId, pattern.pattern, pattern.type, pattern.confidence]);
		}

		// Update schema metadata
		db.exec('INSERT OR IGNORE INTO schema_metadata (version) VALUES (3);');
	},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	down: (db: any) => {
		// Remove category_id column from transactions (SQLite doesn't support DROP COLUMN directly)
		db.exec(`
			CREATE TABLE transactions_backup AS 
			SELECT id, date, description, amount, type, created_at, updated_at 
			FROM transactions;
		`);
		
		db.exec('DROP TABLE transactions;');
		
		db.exec(`
			CREATE TABLE transactions (
				id TEXT PRIMARY KEY,
				date TEXT NOT NULL,
				description TEXT NOT NULL,
				amount REAL NOT NULL,
				type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
				created_at TEXT DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT DEFAULT CURRENT_TIMESTAMP
			);
		`);
		
		db.exec(`
			INSERT INTO transactions (id, date, description, amount, type, created_at, updated_at)
			SELECT id, date, description, amount, type, created_at, updated_at 
			FROM transactions_backup;
		`);
		
		db.exec('DROP TABLE transactions_backup;');
		
		// Recreate original indexes
		db.exec('CREATE INDEX idx_transactions_date ON transactions(date);');
		db.exec('CREATE INDEX idx_transactions_type ON transactions(type);');
		db.exec('CREATE INDEX idx_transactions_amount ON transactions(amount);');
		db.exec('CREATE UNIQUE INDEX idx_transactions_unique ON transactions(date, description, amount);');
		
		// Drop category tables
		db.exec('DROP TABLE IF EXISTS category_rules;');
		db.exec('DROP TABLE IF EXISTS categories;');
		
		// Remove migration version
		db.exec('DELETE FROM schema_metadata WHERE version = 3;');
	},
};